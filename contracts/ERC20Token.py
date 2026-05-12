# ERC20Token.py
# GenLayer Intelligent Contract — Standard ERC20 Token
# Deploy one instance per token (USDT, USDC, WETH, GEN)

from genlayer import *


@gl.contract
class ERC20Token:
    """
    Standard ERC20 token for GenLayer Swap Portal.
    Deploy with: name, symbol, decimals, initial_supply (in smallest unit).
    """

    # --- Storage ---
    name: str
    symbol: str
    decimals: u256
    total_supply: u256
    owner: Address

    balances: TreeMap[Address, u256]
    allowances: TreeMap[Address, TreeMap[Address, u256]]

    def __init__(
        self,
        name: str,
        symbol: str,
        decimals: u256,
        initial_supply: u256,
    ) -> None:
        self.name = name
        self.symbol = symbol
        self.decimals = decimals
        self.total_supply = initial_supply
        self.owner = gl.message.sender_address

        # Mint entire supply to deployer
        self.balances[gl.message.sender_address] = initial_supply

    # --- Views ---

    @gl.public.view
    def get_name(self) -> str:
        return self.name

    @gl.public.view
    def get_symbol(self) -> str:
        return self.symbol

    @gl.public.view
    def get_decimals(self) -> u256:
        return self.decimals

    @gl.public.view
    def get_total_supply(self) -> u256:
        return self.total_supply

    @gl.public.view
    def balance_of(self, account: Address) -> u256:
        return self.balances.get(account, u256(0))

    @gl.public.view
    def allowance(self, owner: Address, spender: Address) -> u256:
        owner_allowances = self.allowances.get(owner)
        if owner_allowances is None:
            return u256(0)
        return owner_allowances.get(spender, u256(0))

    # --- Writes ---

    @gl.public.write
    def transfer(self, to: Address, amount: u256) -> bool:
        sender = gl.message.sender_address
        self._transfer(sender, to, amount)
        return True

    @gl.public.write
    def approve(self, spender: Address, amount: u256) -> bool:
        sender = gl.message.sender_address
        if sender not in self.allowances:
            self.allowances[sender] = TreeMap()
        self.allowances[sender][spender] = amount
        return True

    @gl.public.write
    def transfer_from(self, from_addr: Address, to: Address, amount: u256) -> bool:
        spender = gl.message.sender_address
        current_allowance = self.allowance(from_addr, spender)
        assert current_allowance >= amount, "ERC20: insufficient allowance"
        self.allowances[from_addr][spender] = current_allowance - amount
        self._transfer(from_addr, to, amount)
        return True

    @gl.public.write
    def mint(self, to: Address, amount: u256) -> None:
        """Only owner can mint additional tokens."""
        assert gl.message.sender_address == self.owner, "ERC20: only owner can mint"
        self.total_supply = self.total_supply + amount
        self.balances[to] = self.balances.get(to, u256(0)) + amount

    @gl.public.write
    def burn(self, amount: u256) -> None:
        sender = gl.message.sender_address
        bal = self.balances.get(sender, u256(0))
        assert bal >= amount, "ERC20: burn amount exceeds balance"
        self.balances[sender] = bal - amount
        self.total_supply = self.total_supply - amount

    # --- Internal ---

    def _transfer(self, from_addr: Address, to: Address, amount: u256) -> None:
        assert to != Address("0x" + "0" * 40), "ERC20: transfer to zero address"
        from_bal = self.balances.get(from_addr, u256(0))
        assert from_bal >= amount, "ERC20: insufficient balance"
        self.balances[from_addr] = from_bal - amount
        self.balances[to] = self.balances.get(to, u256(0)) + amount
