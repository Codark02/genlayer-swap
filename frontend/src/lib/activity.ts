/** POST successful user actions for real leaderboard ranking. */
const base = () => (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export async function recordActivity(
  address: `0x${string}`,
  action: "connect" | "swap" | "add_liquidity" | "remove_liquidity"
): Promise<void> {
  try {
    await fetch(`${base()}/api/activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, action }),
    });
  } catch {
    /* leaderboard is best-effort */
  }
}

export type LeaderboardEntry = {
  rank: number;
  address: string;
  txCount: number;
  lastAt: string | null;
  actions: Record<string, number>;
};

export async function fetchLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  totalWallets: number;
  totalTransactions: number;
}> {
  const r = await fetch(`${base()}/api/leaderboard`);
  if (!r.ok) throw new Error("leaderboard fetch failed");
  return r.json();
}
