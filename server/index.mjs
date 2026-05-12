/**
 * Leaderboard API — persists wallet interaction counts for the GenLayer portal.
 * Run: npm start (from server/) default port 8787
 */
import express from "express";
import cors from "cors";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LEADERBOARD_PORT || 8787);
const DB_PATH = join(__dirname, "leaderboard-db.json");

function loadDb() {
  if (!existsSync(DB_PATH)) {
    return { wallets: {} };
  }
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf8"));
  } catch {
    return { wallets: {} };
  }
}

function saveDb(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function isAddress(a) {
  return typeof a === "string" && /^0x[a-fA-F0-9]{40}$/.test(a);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post("/api/activity", (req, res) => {
  const { address, action } = req.body || {};
  if (!isAddress(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  const key = address.toLowerCase();
  const act = typeof action === "string" && action.length < 64 ? action : "unknown";

  const db = loadDb();
  if (!db.wallets[key]) {
    db.wallets[key] = { count: 0, actions: {}, lastAt: null };
  }
  db.wallets[key].count += 1;
  db.wallets[key].actions[act] = (db.wallets[key].actions[act] || 0) + 1;
  db.wallets[key].lastAt = new Date().toISOString();
  saveDb(db);

  res.json({ ok: true, count: db.wallets[key].count });
});

app.get("/api/leaderboard", (_req, res) => {
  const db = loadDb();
  const entries = Object.entries(db.wallets)
    .map(([addr, v]) => ({
      address: addr,
      txCount: v.count,
      lastAt: v.lastAt,
      actions: v.actions || {},
    }))
    .sort((a, b) => b.txCount - a.txCount)
    .slice(0, 100)
    .map((e, i) => ({ rank: i + 1, ...e }));

  const totalWallets = Object.keys(db.wallets).length;
  const totalTransactions = Object.values(db.wallets).reduce((s, w) => s + w.count, 0);

  res.json({
    entries,
    totalWallets,
    totalTransactions,
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Leaderboard API http://localhost:${PORT}`);
});
