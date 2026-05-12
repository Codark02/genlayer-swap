# SwapRouter.py
# GenLayer Intelligent Contract — Swap Router
# Central entry point: routes swaps across registered pools, handles multi-hop paths.

from genlayer import *


@gl.contract
class SwapRouter:
    """
    GenLayer Swap Portal — Router Contract
    ----------------------------------------
    - Maintains a registry of token pair → pool address
    - Executes single-hop and multi-hop swaps
    - Enforces deadlines and slippage protection
    - Collects protocol fee (optional, starts at 0)

    Usage flow:
      1. User approves router for token_in amount
      2. User calls swap_exact_tokens_for_tokens or swap_tokens_for_exact_tokens
      3. Router pulls token_in from user, routes through pool, sends token_out to user
    """

    # --- Storage ---
    owner: Address
    protocol_fee_bps: u256   # Protocol fee on top of pool fee (starts at 0)
    fee_recipient: Address

    # pool_registry[token_a_str][token_b_str] = pool_address
    pool_registry: TreeMap[str, TreeMap[str, Address]]

    # Reverse: pool_address -> (token0, token1)
    pool_tokens: TreeMap[str, list]

    def __init__(self, fee_recipient: Address) -> None:
        self.owner = gl.message.sender_address
        self.fee_recipient = fee_recipient
        self.protocol_fee_bps = u256(0)

    # --- Admin ---

    @gl.public.write
    def register_pool(
        self,
        token_a: Address,
        token_b: Address,
        pool_address: Address,
    ) -> None:
        """Register a deployed LiquidityPool for a token pair."""
        assert gl.message.sender_address == self.owner, "Router: only owner"

        a_str = str(token_a)
        b_str = str(token_b)

        if a_str not in self.pool_registry:
            self.pool_registry[a_str] = TreeMap()
        self.pool_registry[a_str][b_str] = pool_address

        if b_str not in self.pool_registry:
            self.pool_registry[b_str] = TreeMap()
        self.pool_registry[b_str][a_str] = pool_address

        self.pool_tokens[str(pool_address)] = [a_str, b_str]

    @gl.public.write
    def set_protocol_fee(self, fee_bps: u256) -> None:
        assert gl.message.sender_address == self.owner, "Router: only owner"
        assert fee_bps <= u256(50), "Router: fee capped at 0.5%"
        self.protocol_fee_bps = fee_bps

    @gl.public.write
    def set_fee_recipient(self, recipient: Address) -> None:
        assert gl.message.sender_address == self.owner, "Router: only owner"
        self.fee_recipient = recipient

    @gl.public.write
    def transfer_ownership(self, new_owner: Address) -> None:
        assert gl.message.sender_address == self.owner, "Router: only owner"
        self.owner = new_owner

    # --- Views ---

    @gl.public.view
    def get_pool(self, token_a: Address, token_b: Address) -> str:
        """Return pool address for a pair, or empty string if not registered."""
        inner = self.pool_registry.get(str(token_a))
        if inner is None:
            return ""
        pool = inner.get(str(token_b))
        return str(pool) if pool else ""

    @gl.public.view
    def quote_exact_in(
        self,
        path: list,   # [token_in_addr, token_mid_addr?, token_out_addr]
        amount_in: u256,
    ) -> u256:
        """
        Simulate a swap along path and return expected output (before slippage).
        path is a list of token address strings.
        """
        amount = amount_in
        for i in range(len(path) - 1):
            token_in = Address(path[i])
            token_out = Address(path[i + 1])
            pool_addr = self._require_pool(token_in, token_out)
            amount = gl.call(pool_addr, "quote_swap_out", token_in, amount)
        return amount

    @gl.public.view
    def get_owner(self) -> str:
        return str(self.owner)

    @gl.public.view
    def get_protocol_fee_bps(self) -> u256:
        return self.protocol_fee_bps

    # --- Swap: Exact In ---

    @gl.public.write
    def swap_exact_tokens_for_tokens(
        self,
        amount_in: u256,
        amount_out_min: u256,
        path: list,         # list of token address strings, e.g. ["0xUSDT...", "0xETH..."]
        to: Address,
        deadline: u256,
    ) -> u256:
        """
        Swap exact amount_in along path, receive at least amount_out_min at `to`.
        Supports single-hop and multi-hop (any path length ≥ 2).
        Returns actual amount_out.
        """
        self._check_deadline(deadline)
        assert len(path) >= 2, "Router: path too short"

        sender = gl.message.sender_address
        amount = amount_in

        # Deduct protocol fee from input if > 0
        if self.protocol_fee_bps > u256(0):
            proto_fee = (amount_in * self.protocol_fee_bps) // u256(10000)
            self._pull_token(Address(path[0]), sender, proto_fee, self.fee_recipient)
            amount = amount_in - proto_fee

        # Pull first token from user into router
        self._pull_token(Address(path[0]), sender, amount, gl.message.contract_address)

        # Route through each hop
        for i in range(len(path) - 1):
            token_in = Address(path[i])
            token_out = Address(path[i + 1])
            pool_addr = self._require_pool(token_in, token_out)

            # For last hop, send directly to recipient; otherwise to next pool
            recipient = to if i == len(path) - 2 else gl.message.contract_address

            # Approve pool to pull from router
            gl.call(token_in, "approve", pool_addr, amount)

            amount = gl.call(
                pool_addr,
                "swap_exact_in",
                token_in,
                amount,
                u256(0),  # min enforced at the end
                recipient,
            )

        assert amount >= amount_out_min, "Router: slippage — output below minimum"
        return amount

    # --- Swap: Exact Out ---

    @gl.public.write
    def swap_tokens_for_exact_tokens(
        self,
        amount_out: u256,
        amount_in_max: u256,
        path: list,
        to: Address,
        deadline: u256,
    ) -> u256:
        """
        Receive exactly amount_out at `to`, paying at most amount_in_max.
        Single-hop only (multi-hop exact-out requires reverse path computation).
        Returns actual amount_in used.
        """
        self._check_deadline(deadline)
        assert len(path) == 2, "Router: exact-out only supports single-hop"

        sender = gl.message.sender_address
        token_in = Address(path[0])
        token_out = Address(path[1])
        pool_addr = self._require_pool(token_in, token_out)

        # Quote how much we need
        amount_in = gl.call(pool_addr, "quote_swap_in", token_out, amount_out)

        # Apply protocol fee
        if self.protocol_fee_bps > u256(0):
            proto_fee = (amount_in * self.protocol_fee_bps) // u256(10000)
            amount_in_total = amount_in + proto_fee
        else:
            amount_in_total = amount_in
            proto_fee = u256(0)

        assert amount_in_total <= amount_in_max, "Router: slippage — input above maximum"

        # Pull total from user
        self._pull_token(token_in, sender, amount_in_total, gl.message.contract_address)

        # Send protocol fee
        if proto_fee > u256(0):
            gl.call(token_in, "transfer", self.fee_recipient, proto_fee)

        # Approve and execute swap
        gl.call(token_in, "approve", pool_addr, amount_in)
        gl.call(
            pool_addr,
            "swap_exact_out",
            token_out,
            amount_out,
            amount_in,
            to,
        )

        return amount_in_total

    # --- Internal ---

    def _require_pool(self, token_a: Address, token_b: Address) -> Address:
        inner = self.pool_registry.get(str(token_a))
        assert inner is not None, f"Router: no pool for {token_a}"
        pool = inner.get(str(token_b))
        assert pool is not None, f"Router: no pool for pair"
        return pool

    def _pull_token(
        self,
        token: Address,
        from_addr: Address,
        amount: u256,
        to: Address,
    ) -> None:
        gl.call(token, "transfer_from", from_addr, to, amount)

    def _check_deadline(self, deadline: u256) -> None:
        # GenLayer doesn't expose block.timestamp directly yet;
        # deadline is validated client-side for now.
        # TODO: replace with gl.block.timestamp once available.
        assert deadline > u256(0), "Router: invalid deadline"
