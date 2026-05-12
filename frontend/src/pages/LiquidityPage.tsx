import { useCallback, useEffect, useMemo, useState } from "react";
import { parseUnits, formatUnits } from "viem";
import { useWallet } from "../context/WalletContext";
import { loadDeployed, isConfigured } from "../lib/contracts";
import type { DeployedManifest } from "../lib/contracts";
import { resolveTokenAddress, decimalsFor, type DisplayToken } from "../lib/tokenAddr";
import { waitTxAccepted } from "../lib/tx";
import { recordActivity } from "../lib/activity";

type PoolChoice = "USDT" | "USDC" | "ETH";

function sym0FromReserves(m: DeployedManifest, token0: string): DisplayToken {
  const t = token0.toLowerCase();
  const map: [string, DisplayToken][] = [
    [m.contracts.USDT.toLowerCase(), "USDT"],
    [m.contracts.USDC.toLowerCase(), "USDC"],
    [m.contracts.WETH.toLowerCase(), "ETH"],
    [m.contracts.GEN.toLowerCase(), "GEN"],
  ];
  for (const [addr, s] of map) if (addr === t) return s;
  return "GEN";
}

export default function LiquidityPage() {
  const { address, client } = useWallet();
  const [manifest, setManifest] = useState<DeployedManifest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [poolChoice, setPoolChoice] = useState<PoolChoice>("USDT");
  const [reserves, setReserves] = useState<{
    token0: string;
    token1: string;
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);
  const [sym0, setSym0] = useState<DisplayToken>("USDT");
  const [sym1, setSym1] = useState<DisplayToken>("GEN");
  const [amt0, setAmt0] = useState("");
  const [amt1, setAmt1] = useState("");
  const [lpBal, setLpBal] = useState<bigint>(0n);
  const [removePct, setRemovePct] = useState(25);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const poolAddr = useMemo(() => {
    if (!manifest || !isConfigured(manifest)) return null;
    const key = poolKeyForBase(poolChoice);
    const c = manifest.contracts as Record<string, string>;
    return (c[key] || "") as `0x${string}`;
  }, [manifest, poolChoice]);

  useEffect(() => {
    loadDeployed().then((m) => {
      setManifest(m);
      setLoaded(true);
    });
  }, []);

  const refreshPool = useCallback(async () => {
    if (!client || !manifest || !isConfigured(manifest) || !poolAddr) {
      setReserves(null);
      return;
    }
    try {
      const r = (await client.readContract({
        address: poolAddr,
        functionName: "get_reserves",
        args: [],
      })) as { token0: string; token1: string; reserve0: number; reserve1: number };
      const res = {
        token0: r.token0,
        token1: r.token1,
        reserve0: BigInt(r.reserve0),
        reserve1: BigInt(r.reserve1),
      };
      setReserves(res);
      setSym0(sym0FromReserves(manifest, res.token0));
      setSym1(sym0FromReserves(manifest, res.token1));
      if (address) {
        const lp = await client.readContract({
          address: poolAddr,
          functionName: "get_lp_balance",
          args: [address],
        });
        setLpBal(BigInt(lp as bigint | string | number));
      } else {
        setLpBal(0n);
      }
    } catch {
      setReserves(null);
    }
  }, [client, manifest, poolAddr, address]);

  useEffect(() => {
    void refreshPool();
  }, [refreshPool]);

  const ratioFill = (which: 0 | 1) => {
    if (!reserves || reserves.reserve0 === 0n || reserves.reserve1 === 0n) return;
    const d0 = decimalsFor(sym0);
    const d1 = decimalsFor(sym1);
    if (which === 0 && amt0.trim()) {
      const a0 = parseUnits(amt0.trim(), d0);
      const a1 = (a0 * reserves.reserve1) / reserves.reserve0;
      setAmt1(formatUnits(a1, d1));
    }
    if (which === 1 && amt1.trim()) {
      const a1 = parseUnits(amt1.trim(), d1);
      const a0 = (a1 * reserves.reserve0) / reserves.reserve1;
      setAmt0(formatUnits(a0, d0));
    }
  };

  const addLiquidity = async () => {
    setMsg(null);
    if (!client || !manifest || !isConfigured(manifest) || !address || !poolAddr || !reserves) {
      setMsg("Connect wallet and ensure pools are deployed.");
      return;
    }
    const d0 = decimalsFor(sym0);
    const d1 = decimalsFor(sym1);
    const a0 = parseUnits(amt0.trim() || "0", d0);
    const a1 = parseUnits(amt1.trim() || "0", d1);
    if (a0 === 0n || a1 === 0n) {
      setMsg("Enter both amounts.");
      return;
    }
    const t0 = resolveTokenAddress(manifest, sym0);
    const t1 = resolveTokenAddress(manifest, sym1);
    setBusy(true);
    try {
      setMsg("Approving tokens…");
      const h0 = await client.writeContract({
        address: t0,
        functionName: "approve",
        args: [poolAddr, a0],
        value: 0n,
      });
      await waitTxAccepted(client, h0);
      const h1 = await client.writeContract({
        address: t1,
        functionName: "approve",
        args: [poolAddr, a1],
        value: 0n,
      });
      await waitTxAccepted(client, h1);
      setMsg("Adding liquidity…");
      const h2 = await client.writeContract({
        address: poolAddr,
        functionName: "add_liquidity",
        args: [a0, a1, 0n, 0n],
        value: 0n,
      });
      await waitTxAccepted(client, h2);
      setMsg("Liquidity added.");
      setAmt0("");
      setAmt1("");
      void recordActivity(address, "add_liquidity");
      void refreshPool();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeLiquidity = async () => {
    setMsg(null);
    if (!client || !manifest || !isConfigured(manifest) || !address || !poolAddr) return;
    if (lpBal === 0n) {
      setMsg("No LP balance in this pool.");
      return;
    }
    const lpAmt = (lpBal * BigInt(removePct)) / 100n;
    if (lpAmt === 0n) {
      setMsg("Increase remove percentage.");
      return;
    }
    setBusy(true);
    try {
      setMsg("Removing liquidity…");
      const h = await client.writeContract({
        address: poolAddr,
        functionName: "remove_liquidity",
        args: [lpAmt, 0n, 0n],
        value: 0n,
      });
      await waitTxAccepted(client, h);
      setMsg("Liquidity removed.");
      void recordActivity(address, "remove_liquidity");
      void refreshPool();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p style={{ color: "var(--muted)" }}>Loading…</p>;
  if (!manifest || !isConfigured(manifest)) {
    return (
      <div className="banner-warn">
        Deploy contracts and copy <span className="mono">deployed-addresses.json</span> into{" "}
        <span className="mono">frontend/public/</span>.
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem" }}>Liquidity</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
        Provide liquidity to USDT/GEN, ETH (WETH)/GEN, or USDC/GEN pools. Fees accrue to LPs per the pool contract.
      </p>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="card">
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Pool</h2>
          <div className="field">
            <label>Pair</label>
            <select value={poolChoice} onChange={(e) => setPoolChoice(e.target.value as PoolChoice)}>
              <option value="USDT">USDT / GEN</option>
              <option value="USDC">USDC / GEN</option>
              <option value="ETH">ETH (WETH) / GEN</option>
            </select>
          </div>
          {reserves && (
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.75rem" }}>
              <div>
                Reserve {sym0}: {formatUnits(reserves.reserve0, decimalsFor(sym0))}
              </div>
              <div>
                Reserve {sym1}: {formatUnits(reserves.reserve1, decimalsFor(sym1))}
              </div>
              <div style={{ marginTop: 6 }} className="mono" title="Pool contract">
                {poolAddr}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Add liquidity</h2>
          <div className="field">
            <label>Amount {sym0}</label>
            <input
              value={amt0}
              onChange={(e) => setAmt0(e.target.value)}
              onBlur={() => ratioFill(0)}
              placeholder="0.0"
            />
          </div>
          <div className="field">
            <label>Amount {sym1}</label>
            <input
              value={amt1}
              onChange={(e) => setAmt1(e.target.value)}
              onBlur={() => ratioFill(1)}
              placeholder="0.0"
            />
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Blur a field to auto-fill the other side using the live pool ratio.
          </p>
          {msg && <p style={{ fontSize: "0.88rem" }}>{msg}</p>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void addLiquidity()}>
            {busy ? "…" : "Add liquidity"}
          </button>
        </div>

        <div className="card">
          <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Your position</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            LP balance (raw):{" "}
            <span className="mono" style={{ color: "var(--text)" }}>
              {lpBal.toString()}
            </span>
          </p>
          <div className="field">
            <label>Remove % of your LP</label>
            <input
              type="number"
              min={1}
              max={100}
              value={removePct}
              onChange={(e) => setRemovePct(Number(e.target.value) || 0)}
            />
          </div>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void removeLiquidity()}>
            Remove liquidity
          </button>
        </div>
      </div>
    </div>
  );
}

function poolKeyForBase(base: PoolChoice): string {
  if (base === "USDT") return "POOL_USDT_GEN";
  if (base === "USDC") return "POOL_USDC_GEN";
  return "POOL_WETH_GEN";
}
