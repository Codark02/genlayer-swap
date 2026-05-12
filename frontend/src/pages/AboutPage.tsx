export default function AboutPage() {
  return (
    <div>
      <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.75rem" }}>About</h1>
      <p style={{ color: "var(--muted)", maxWidth: 720 }}>
        This portal is a front end for an automated market maker (AMM) on{" "}
        <strong>GenLayer testnet</strong>. It talks to your deployed intelligent contracts: ERC-20
        test tokens, constant-product <span className="mono">LiquidityPool</span> pairs, and the{" "}
        <span className="mono">SwapRouter</span> that routes single-hop swaps between USDT, USDC,
        wrapped ETH (WETH, shown as ETH in the UI), and GEN.
      </p>

      <div style={{ display: "grid", gap: "1rem", marginTop: "1.5rem", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div className="card">
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Swap</h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            The <strong>Swap</strong> page quotes execution price from the router&apos;s{" "}
            <span className="mono">quote_exact_in</span> read, then asks your wallet to approve the
            router (if needed) and submit <span className="mono">swap_exact_tokens_for_tokens</span>.
            You trade against pooled liquidity with slippage protection (1% minimum output in the
            UI). Use the faucet and deploy script so you hold test USDT, USDC, WETH, and GEN on chain
            4221.
          </p>
        </div>
        <div className="card">
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Liquidity</h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            The <strong>Liquidity</strong> page calls <span className="mono">add_liquidity</span> on
            each pool contract (after token approvals). Adding funds increases reserves on the x*y=k
            curve so swappers get depth; you receive LP units tracked inside the pool. You can
            remove a percentage of your LP with <span className="mono">remove_liquidity</span>, which
            burns LP and returns both assets pro-rata.
          </p>
        </div>
        <div className="card">
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Leaderboard</h2>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
            The <strong>Leaderboard</strong> is backed by a small API that records each wallet action
            (connect, swap, add/remove liquidity) so ranks reflect real usage of this site, not mock
            data. Run the API server locally (see README) so counts persist in{" "}
            <span className="mono">leaderboard-db.json</span>.
          </p>
        </div>
      </div>

      <p style={{ color: "var(--muted)", marginTop: "1.5rem", fontSize: "0.9rem" }}>
        Official GenLayer docs: networks, RPCs, and chain id 4221 —{" "}
        <a href="https://docs.genlayer.com/developers/networks" target="_blank" rel="noreferrer">
          docs.genlayer.com/developers/networks
        </a>
        . Wallets: connect with MetaMask, Rabby, or OKX; the app switches or adds the GenLayer
        testnet network automatically.
      </p>
    </div>
  );
}
