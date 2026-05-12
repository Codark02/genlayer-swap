import { useCallback, useEffect, useState } from "react";
import { parseUnits, formatUnits } from "viem";
import { useWallet } from "../context/WalletContext";
import { loadDeployed, isConfigured } from "../lib/contracts";
import type { DeployedManifest } from "../lib/contracts";
import { resolveTokenAddress, decimalsFor, type DisplayToken } from "../lib/tokenAddr";
import { waitTxAccepted } from "../lib/tx";
import { recordActivity } from "../lib/activity";

type PairBase = "USDT" | "USDC" | "ETH";

export default function SwapPage() {
  const { address, client } = useWallet();
  const [manifest, setManifest] = useState<DeployedManifest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pairBase, setPairBase] = useState<PairBase>("USDT");
  const [from, setFrom] = useState<DisplayToken>("USDT");
  const [to, setTo] = useState<DisplayToken>("GEN");
  const [amountIn, setAmountIn] = useState("");
  const [quoteOut, setQuoteOut] = useState<bigint | null>(null);
  const [balFrom, setBalFrom] = useState<string>("—");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDeployed().then((m) => {
      setManifest(m);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const base: DisplayToken = pairBase === "ETH" ? "ETH" : pairBase;
    setFrom(base);
    setTo("GEN");
  }, [pairBase]);

  const dIn = decimalsFor(from);
  const dOut = decimalsFor(to);

  const refreshQuote = useCallback(async () => {
    if (!client || !manifest || !isConfigured(manifest) || !amountIn.trim()) {
      setQuoteOut(null);
      return;
    }
    try {
      const amt = parseUnits(amountIn.trim(), dIn);
      if (amt === 0n) {
        setQuoteOut(null);
        return;
      }
      const path = [resolveTokenAddress(manifest, from), resolveTokenAddress(manifest, to)];
      const q = await client.readContract({
        address: manifest.contracts.ROUTER as `0x${string}`,
        functionName: "quote_exact_in",
        args: [path, amt],
      });
      setQuoteOut(BigInt(q as bigint | string | number));
    } catch {
      setQuoteOut(null);
    }
  }, [client, manifest, amountIn, from, to, dIn]);

  useEffect(() => {
    const t = setTimeout(() => void refreshQuote(), 350);
    return () => clearTimeout(t);
  }, [refreshQuote]);

  useEffect(() => {
    async function bal() {
      if (!client || !manifest || !isConfigured(manifest) || !address) {
        setBalFrom("—");
        return;
      }
      try {
        const b = await client.readContract({
          address: resolveTokenAddress(manifest, from),
          functionName: "balance_of",
          args: [address],
        });
        setBalFrom(formatUnits(BigInt(b as bigint | string | number), dIn));
      } catch {
        setBalFrom("—");
      }
    }
    void bal();
  }, [client, manifest, address, from, dIn]);

  const flip = () => {
    const a = from;
    setFrom(to);
    setTo(a);
    setAmountIn("");
    setQuoteOut(null);
  };

  const onSwap = async () => {
    setMsg(null);
    if (!client || !manifest || !isConfigured(manifest) || !address) {
      setMsg("Connect your wallet and deploy contracts (see README).");
      return;
    }
    const amt = parseUnits(amountIn.trim() || "0", dIn);
    if (amt === 0n) {
      setMsg("Enter an amount to swap.");
      return;
    }
    if (quoteOut === null || quoteOut === 0n) {
      setMsg("No quote available — check pool liquidity and pair.");
      return;
    }
    const path = [resolveTokenAddress(manifest, from), resolveTokenAddress(manifest, to)];
    const minOut = (quoteOut * 99n) / 100n;
    const router = manifest.contracts.ROUTER as `0x${string}`;
    const tokenIn = resolveTokenAddress(manifest, from);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    setBusy(true);
    try {
      const allowance = await client.readContract({
        address: tokenIn,
        functionName: "allowance",
        args: [address, router],
      });
      const alw = BigInt(allowance as bigint | string | number);
      if (alw < amt) {
        setMsg("Approving router…");
        const h1 = await client.writeContract({
          address: tokenIn,
          functionName: "approve",
          args: [router, amt],
          value: 0n,
        });
        await waitTxAccepted(client, h1);
      }
      setMsg("Submitting swap…");
      const h2 = await client.writeContract({
        address: router,
        functionName: "swap_exact_tokens_for_tokens",
        args: [amt, minOut, path, address, deadline],
        value: 0n,
      });
      await waitTxAccepted(client, h2);
      setMsg("Swap completed.");
      setAmountIn("");
      setQuoteOut(null);
      void recordActivity(address, "swap");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p style={{ color: "var(--muted)" }}>Loading configuration…</p>;

  if (!manifest || !isConfigured(manifest)) {
    return (
      <div>
        <div className="banner-warn">
          Add <span className="mono">deployed-addresses.json</span> to{" "}
          <span className="mono">frontend/public/</span> after running{" "}
          <span className="mono">node deploy.mjs</span> (set <span className="mono">DEPLOYER_PRIVATE_KEY</span> and
          optional <span className="mono">GENLAYER_NETWORK=bradbury</span>).
        </div>
        <p style={{ color: "var(--muted)" }}>
          The app reads your router, token, and pool addresses to execute real swaps on GenLayer testnet.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem" }}>Swap</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
        Trade USDT/GEN, ETH (WETH)/GEN, or USDC/GEN through the on-chain router.
      </p>

      <div className="card" style={{ maxWidth: 440, margin: "0 auto" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Pair</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: 6, flexWrap: "wrap" }}>
            {(["USDT", "USDC", "ETH"] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-ghost"
                onClick={() => setPairBase(p)}
                style={{
                  borderColor: pairBase === p ? "var(--accent-strong)" : undefined,
                  background: pairBase === p ? "rgba(139,92,246,0.2)" : undefined,
                }}
              >
                {p}/GEN
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>
            From ({from}) — balance {balFrom}
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
          />
        </div>

        <div style={{ textAlign: "center", margin: "0.25rem 0" }}>
          <button type="button" className="btn btn-ghost" onClick={flip} title="Flip direction">
            ⇅ Flip
          </button>
        </div>

        <div className="field">
          <label>To ({to})</label>
          <input
            readOnly
            style={{ opacity: 0.9 }}
            value={quoteOut !== null ? formatUnits(quoteOut, dOut) : "—"}
          />
        </div>

        {msg && (
          <p style={{ fontSize: "0.88rem", color: msg.includes("completed") ? "var(--success)" : "var(--muted)" }}>
            {msg}
          </p>
        )}

        <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={() => void onSwap()}>
          {busy ? "Working…" : "Swap"}
        </button>
      </div>
    </div>
  );
}
