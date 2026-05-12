# LiquidityPool.py
# GenLayer Intelligent Contract — AMM Liquidity Pool (Uniswap V2-style x*y=k)
# One pool per token pair (e.g. USDT/ETH, USDC/USDT, ETH/WETH)

from genlayer import *


@gl.contract
class LiquidityPool:
    """
    Constant-product AMM pool: x * y = k
    Supports: add_liquidity, remove_liquidity, swap_exact_in, swap_exact_out
    Fee: 0.3% (30 bps) — taken from input amount
    """

    # --- Storage ---
    token0: Address          # Lower address token (sorted)
    token1: Address          # Higher address token
    reserve0: u256           # Current reserve of token0
    reserve1: u256           # Current reserve of token1
    total_lp_supply: u256    # Total LP tokens minted
    fee_bps: u256            # Fee in basis points (30 = 0.3%)
    owner: Address           # Pool deployer / factory

    lp_balances: TreeMap[Address, u256]

    def __init__(
        self,
        token0: Address,
        token1: Address,
        fee_bps: u256,
    ) -> None:
        # Sort tokens so pool is canonical regardless of order passed
        if str(token0) < str(token1):
            self.token0 = token0
            self.token1 = token1
        else:
            self.token0 = token1
            self.token1 = token0

        self.reserve0 = u256(0)
        self.reserve1 = u256(0)
        self.total_lp_supply = u256(0)
        self.fee_bps = fee_bps  # e.g. 30 for 0.3%
        self.owner = gl.message.sender_address

    # --- Views ---

    @gl.public.view
    def get_reserves(self) -> dict:
        return {
            "token0": str(self.token0),
            "token1": str(self.token1),
            "reserve0": int(self.reserve0),
            "reserve1": int(self.reserve1),
        }

    @gl.public.view
    def get_lp_balance(self, account: Address) -> u256:
        return self.lp_balances.get(account, u256(0))

    @gl.public.view
    def get_total_lp_supply(self) -> u256:
        return self.total_lp_supply

    @gl.public.view
    def quote_swap_out(self, token_in: Address, amount_in: u256) -> u256:
        """
        Preview: how many token_out would I get for amount_in of token_in?
        Amount after fee deducted.
        """
        (reserve_in, reserve_out) = self._get_ordered_reserves(token_in)
        return self._get_amount_out(amount_in, reserve_in, reserve_out)

    @gl.public.view
    def quote_swap_in(self, token_out: Address, amount_out: u256) -> u256:
        """
        Preview: how many token_in do I need to get exactly amount_out?
        """
        token_in = self.token1 if str(token_out) == str(self.token0) else self.token0
        (reserve_in, reserve_out) = self._get_ordered_reserves(token_in)
        return self._get_amount_in(amount_out, reserve_in, reserve_out)

    # --- Writes ---

    @gl.public.write
    def add_liquidity(
        self,
        amount0_desired: u256,
        amount1_desired: u256,
        amount0_min: u256,
        amount1_min: u256,
    ) -> dict:
        """
        Add liquidity to the pool. Caller must have approved this contract
        for both token0 and token1 beforehand.
        Returns: { lp_minted, amount0_used, amount1_used }
        """
        sender = gl.message.sender_address

        amount0_used: u256
        amount1_used: u256

        if self.reserve0 == u256(0) and self.reserve1 == u256(0):
            # First liquidity — accept exactly desired amounts
            amount0_used = amount0_desired
            amount1_used = amount1_desired
        else:
            # Maintain ratio
            amount1_optimal = (amount0_desired * self.reserve1) // self.reserve0
            if amount1_optimal <= amount1_desired:
                assert amount1_optimal >= amount1_min, "Pool: insufficient token1 amount"
                amount0_used = amount0_desired
                amount1_used = amount1_optimal
            else:
                amount0_optimal = (amount1_desired * self.reserve0) // self.reserve1
                assert amount0_optimal >= amount0_min, "Pool: insufficient token0 amount"
                amount0_used = amount0_optimal
                amount1_used = amount1_desired

        # Pull tokens from sender
        self._pull_token(self.token0, sender, amount0_used)
        self._pull_token(self.token1, sender, amount1_used)

        # Mint LP tokens
        lp_minted: u256
        if self.total_lp_supply == u256(0):
            # Geometric mean for first deposit
            lp_minted = self._sqrt(amount0_used * amount1_used)
        else:
            lp_from_0 = (amount0_used * self.total_lp_supply) // self.reserve0
            lp_from_1 = (amount1_used * self.total_lp_supply) // self.reserve1
            lp_minted = lp_from_0 if lp_from_0 < lp_from_1 else lp_from_1

        assert lp_minted > u256(0), "Pool: insufficient liquidity minted"

        self.lp_balances[sender] = self.lp_balances.get(sender, u256(0)) + lp_minted
        self.total_lp_supply = self.total_lp_supply + lp_minted
        self.reserve0 = self.reserve0 + amount0_used
        self.reserve1 = self.reserve1 + amount1_used

        return {
            "lp_minted": int(lp_minted),
            "amount0_used": int(amount0_used),
            "amount1_used": int(amount1_used),
        }

    @gl.public.write
    def remove_liquidity(
        self,
        lp_amount: u256,
        amount0_min: u256,
        amount1_min: u256,
    ) -> dict:
        """
        Burn LP tokens and receive back proportional share of reserves.
        Returns: { amount0_out, amount1_out }
        """
        sender = gl.message.sender_address
        lp_bal = self.lp_balances.get(sender, u256(0))
        assert lp_bal >= lp_amount, "Pool: insufficient LP balance"

        amount0_out = (lp_amount * self.reserve0) // self.total_lp_supply
        amount1_out = (lp_amount * self.reserve1) // self.total_lp_supply

        assert amount0_out >= amount0_min, "Pool: insufficient token0 output"
        assert amount1_out >= amount1_min, "Pool: insufficient token1 output"

        self.lp_balances[sender] = lp_bal - lp_amount
        self.total_lp_supply = self.total_lp_supply - lp_amount
        self.reserve0 = self.reserve0 - amount0_out
        self.reserve1 = self.reserve1 - amount1_out

        self._send_token(self.token0, sender, amount0_out)
        self._send_token(self.token1, sender, amount1_out)

        return {
            "amount0_out": int(amount0_out),
            "amount1_out": int(amount1_out),
        }

    @gl.public.write
    def swap_exact_in(
        self,
        token_in: Address,
        amount_in: u256,
        amount_out_min: u256,
        to: Address,
    ) -> u256:
        """
        Swap exact amount_in of token_in for at least amount_out_min of the other token.
        Caller must approve this contract for amount_in of token_in beforehand.
        Returns amount_out received.
        """
        sender = gl.message.sender_address
        (reserve_in, reserve_out) = self._get_ordered_reserves(token_in)
        token_out = self.token1 if str(token_in) == str(self.token0) else self.token0

        amount_out = self._get_amount_out(amount_in, reserve_in, reserve_out)
        assert amount_out >= amount_out_min, "Pool: slippage exceeded — output too low"

        self._pull_token(token_in, sender, amount_in)
        self._send_token(token_out, to, amount_out)

        # Update reserves
        if str(token_in) == str(self.token0):
            self.reserve0 = self.reserve0 + amount_in
            self.reserve1 = self.reserve1 - amount_out
        else:
            self.reserve1 = self.reserve1 + amount_in
            self.reserve0 = self.reserve0 - amount_out

        return amount_out

    @gl.public.write
    def swap_exact_out(
        self,
        token_out: Address,
        amount_out: u256,
        amount_in_max: u256,
        to: Address,
    ) -> u256:
        """
        Receive exactly amount_out of token_out, paying at most amount_in_max.
        Returns amount_in actually used.
        """
        sender = gl.message.sender_address
        token_in = self.token1 if str(token_out) == str(self.token0) else self.token0
        (reserve_in, reserve_out) = self._get_ordered_reserves(token_in)

        amount_in = self._get_amount_in(amount_out, reserve_in, reserve_out)
        assert amount_in <= amount_in_max, "Pool: slippage exceeded — input too high"

        self._pull_token(token_in, sender, amount_in)
        self._send_token(token_out, to, amount_out)

        if str(token_in) == str(self.token0):
            self.reserve0 = self.reserve0 + amount_in
            self.reserve1 = self.reserve1 - amount_out
        else:
            self.reserve1 = self.reserve1 + amount_in
            self.reserve0 = self.reserve0 - amount_out

        return amount_in

    # --- Internal helpers ---

    def _get_ordered_reserves(self, token_in: Address):
        if str(token_in) == str(self.token0):
            return (self.reserve0, self.reserve1)
        else:
            return (self.reserve1, self.reserve0)

    def _get_amount_out(self, amount_in: u256, reserve_in: u256, reserve_out: u256) -> u256:
        """x*y=k formula with fee. fee_bps=30 means 0.3%."""
        assert reserve_in > u256(0) and reserve_out > u256(0), "Pool: zero reserves"
        amount_in_with_fee = amount_in * (u256(10000) - self.fee_bps)
        numerator = amount_in_with_fee * reserve_out
        denominator = (reserve_in * u256(10000)) + amount_in_with_fee
        return numerator // denominator

    def _get_amount_in(self, amount_out: u256, reserve_in: u256, reserve_out: u256) -> u256:
        """Reverse formula: how much do I need in to get amount_out?"""
        assert reserve_in > u256(0) and reserve_out > u256(0), "Pool: zero reserves"
        assert amount_out < reserve_out, "Pool: insufficient reserve"
        numerator = reserve_in * amount_out * u256(10000)
        denominator = (reserve_out - amount_out) * (u256(10000) - self.fee_bps)
        return (numerator // denominator) + u256(1)

    def _sqrt(self, y: u256) -> u256:
        """Integer square root (Babylonian method)."""
        if y > u256(3):
            z = y
            x = y // u256(2) + u256(1)
            while x < z:
                z = x
                x = (y // x + x) // u256(2)
            return z
        elif y != u256(0):
            return u256(1)
        return u256(0)

    def _pull_token(self, token: Address, from_addr: Address, amount: u256) -> None:
        """Call transferFrom on a token contract to pull funds into this pool."""
        gl.call(
            token,
            "transfer_from",
            from_addr,
            gl.message.contract_address,
            amount,
        )

    def _send_token(self, token: Address, to: Address, amount: u256) -> None:
        """Send tokens out of the pool to a recipient."""
        gl.call(token, "transfer", to, amount)
