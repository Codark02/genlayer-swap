import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardEntry } from "../lib/activity";

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [totalWallets, setTotalWallets] = useState(0);
  const [totalTx, setTotalTx] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchLeaderboard();
        if (cancelled) return;
        setEntries(d.entries);
        setTotalWallets(d.totalWallets);
        setTotalTx(d.totalTransactions);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load leaderboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading leaderboard…</p>;

  return (
    <div>
      <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.75rem" }}>Leaderboard</h1>
      <p style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
        Top 100 wallets by on-site transaction count (connect, swap, liquidity changes).
      </p>

      {err && (
        <div className="banner-warn" style={{ marginBottom: "1rem" }}>
          {err} — Start the API: <span className="mono">cd server && npm install && npm start</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div className="card" style={{ flex: "1 1 140px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Wallets seen</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{totalWallets}</div>
        </div>
        <div className="card" style={{ flex: "1 1 140px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Total site actions</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{totalTx}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="leader">
            <thead>
              <tr>
                <th>#</th>
                <th>Wallet</th>
                <th>Actions</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "1.5rem", color: "var(--muted)" }}>
                    No data yet. Connect and swap with the API running to populate real ranks.
                  </td>
                </tr>
              ) : (
                entries.map((row) => (
                  <tr key={row.address}>
                    <td>{row.rank}</td>
                    <td className="mono">{row.address}</td>
                    <td>{row.txCount}</td>
                    <td style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                      {row.lastAt ? new Date(row.lastAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
