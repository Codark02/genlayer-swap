# test_swap.py
# GenLayer Swap Portal — Contract Tests
# Run with: genlayer-test or pytest (with gltest plugin)

import pytest
from gltest import get_contract_instance, gl_client, accounts


# ─── FIXTURES ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def deployer(accounts):
    return accounts[0]

@pytest.fixture(scope="module")
def alice(accounts):
    return accounts[1]

@pytest.fixture(scope="module")
def bob(accounts):
    return accounts[2]


@pytest.fixture(scope="module")
def usdt(deployer):
    return get_contract_instance(
        contract_file="contracts/ERC20Token.py",
        args=["Tether USD", "USDT", 6, 100_000_000 * 10**6],
        account=deployer,
    )

@pytest.fixture(scope="module")
def weth(deployer):
    return get_contract_instance(
        contract_file="contracts/ERC20Token.py",
        args=["Wrapped Ether", "WETH", 18, 50_000 * 10**18],
        account=deployer,
    )

@pytest.fixture(scope="module")
def pool(deployer, usdt, weth):
    return get_contract_instance(
        contract_file="contracts/LiquidityPool.py",
        args=[usdt.address, weth.address, 30],  # 0.3% fee
        account=deployer,
    )

@pytest.fixture(scope="module")
def router(deployer):
    return get_contract_instance(
        contract_file="contracts/SwapRouter.py",
        args=[deployer.address],
        account=deployer,
    )


# ─── TOKEN TESTS ─────────────────────────────────────────────────────────────

class TestERC20Token:

    def test_initial_supply(self, usdt, deployer):
        bal = usdt.balance_of(deployer.address)
        assert bal == 100_000_000 * 10**6, "Deployer should have full supply"

    def test_transfer(self, usdt, deployer, alice):
        amount = 1_000 * 10**6  # 1000 USDT
        usdt.transfer(alice.address, amount, from_account=deployer)
        assert usdt.balance_of(alice.address) == amount

    def test_approve_and_transfer_from(self, usdt, deployer, alice, bob):
        amount = 500 * 10**6
        usdt.approve(bob.address, amount, from_account=alice)
        assert usdt.allowance(alice.address, bob.address) == amount

        usdt.transfer_from(alice.address, bob.address, amount, from_account=bob)
        assert usdt.balance_of(bob.address) == amount
        assert usdt.allowance(alice.address, bob.address) == 0

    def test_mint_only_owner(self, usdt, deployer, alice):
        with pytest.raises(Exception, match="only owner"):
            usdt.mint(alice.address, 100 * 10**6, from_account=alice)

    def test_burn(self, usdt, deployer):
        initial = usdt.balance_of(deployer.address)
        burn_amount = 100 * 10**6
        usdt.burn(burn_amount, from_account=deployer)
        assert usdt.balance_of(deployer.address) == initial - burn_amount


# ─── LIQUIDITY POOL TESTS ─────────────────────────────────────────────────────

class TestLiquidityPool:

    def test_add_initial_liquidity(self, pool, usdt, weth, deployer):
        usdt_amount = 3378 * 10**6  # $3378 USDT
        weth_amount = 1 * 10**18   # 1 WETH

        # Approve pool
        usdt.approve(pool.address, usdt_amount, from_account=deployer)
        weth.approve(pool.address, weth_amount, from_account=deployer)

        result = pool.add_liquidity(
            usdt_amount, weth_amount, 0, 0,
            from_account=deployer
        )
        assert result["lp_minted"] > 0
        assert result["amount0_used"] > 0
        assert result["amount1_used"] > 0

    def test_reserves_after_add_liquidity(self, pool):
        reserves = pool.get_reserves()
        assert reserves["reserve0"] > 0
        assert reserves["reserve1"] > 0

    def test_quote_swap_out(self, pool, usdt):
        # Quoting 100 USDT → WETH
        amount_in = 100 * 10**6
        quote = pool.quote_swap_out(usdt.address, amount_in)
        assert quote > 0
        # Should be roughly 100/3378 ETH ≈ 0.0296 WETH
        expected_approx = 0.0296 * 10**18
        assert abs(quote - expected_approx) / expected_approx < 0.01  # within 1%

    def test_swap_exact_in(self, pool, usdt, weth, deployer, alice):
        # Fund alice
        usdt.transfer(alice.address, 500 * 10**6, from_account=deployer)

        amount_in = 100 * 10**6  # 100 USDT
        quote = pool.quote_swap_out(usdt.address, amount_in)

        usdt.approve(pool.address, amount_in, from_account=alice)
        weth_before = weth.balance_of(alice.address)

        amount_out = pool.swap_exact_in(
            usdt.address,
            amount_in,
            quote * 99 // 100,  # 1% slippage
            alice.address,
            from_account=alice,
        )

        weth_after = weth.balance_of(alice.address)
        assert weth_after - weth_before == amount_out
        assert amount_out >= quote * 99 // 100

    def test_remove_liquidity(self, pool, usdt, weth, deployer):
        lp_bal = pool.get_lp_balance(deployer.address)
        assert lp_bal > 0

        half = lp_bal // 2
        usdt_before = usdt.balance_of(deployer.address)
        weth_before = weth.balance_of(deployer.address)

        result = pool.remove_liquidity(half, 0, 0, from_account=deployer)
        assert result["amount0_out"] > 0
        assert result["amount1_out"] > 0

        assert usdt.balance_of(deployer.address) > usdt_before
        assert weth.balance_of(deployer.address) > weth_before


# ─── ROUTER TESTS ─────────────────────────────────────────────────────────────

class TestSwapRouter:

    @pytest.fixture(autouse=True)
    def setup_router(self, router, pool, usdt, weth, deployer):
        """Register the pool in the router before each test."""
        router.register_pool(
            usdt.address,
            weth.address,
            pool.address,
            from_account=deployer,
        )

    def test_get_pool(self, router, usdt, weth):
        pool_addr = router.get_pool(usdt.address, weth.address)
        assert pool_addr != ""
        assert pool_addr != "0x" + "0" * 40

    def test_swap_exact_tokens_for_tokens(self, router, usdt, weth, deployer, alice):
        amount_in = 50 * 10**6  # 50 USDT

        usdt.transfer(alice.address, amount_in, from_account=deployer)
        usdt.approve(router.address, amount_in, from_account=alice)

        # Get quote
        expected = router.quote_exact_in(
            [usdt.address, weth.address],
            amount_in
        )

        weth_before = weth.balance_of(alice.address)
        deadline = 9999999999  # Far future

        amount_out = router.swap_exact_tokens_for_tokens(
            amount_in,
            expected * 99 // 100,  # 1% slippage
            [usdt.address, weth.address],
            alice.address,
            deadline,
            from_account=alice,
        )

        assert weth.balance_of(alice.address) - weth_before == amount_out

    def test_swap_reverts_when_no_pool(self, router, usdt, deployer, alice):
        # Use a random address as a token that has no pool
        fake_token = "0x1234567890abcdef1234567890abcdef12345678"
        with pytest.raises(Exception, match="no pool"):
            router.swap_exact_tokens_for_tokens(
                100 * 10**6,
                1,
                [usdt.address, fake_token],
                alice.address,
                9999999999,
                from_account=alice,
            )

    def test_protocol_fee(self, router, deployer):
        router.set_protocol_fee(10, from_account=deployer)  # 0.1%
        assert router.get_protocol_fee_bps() == 10
        router.set_protocol_fee(0, from_account=deployer)   # reset

    def test_only_owner_can_register_pool(self, router, usdt, weth, pool, alice):
        with pytest.raises(Exception, match="only owner"):
            router.register_pool(
                usdt.address,
                weth.address,
                pool.address,
                from_account=alice,
            )
