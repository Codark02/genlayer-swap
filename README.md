# GenLayer Swap Portal

Full-stack portal for **GenLayer testnet** (chain **4221**): intelligent-contract AMM (Python), deployment script, **React (Vite)** frontend with **MetaMask / Rabby / OKX** via `genlayer-js` + injected providers, and a small **leaderboard API** that records real on-site activity.

## Layout

| Area | Description |
|------|-------------|
| **Swap** | USDT/GEN, ETH (WETH)/GEN, USDC/GEN — router `quote_exact_in` + `swap_exact_tokens_for_tokens` |
| **Liquidity** | Add/remove on `POOL_USDT_GEN`, `POOL_WETH_GEN`, `POOL_USDC_GEN` |
| **About** | What swap and liquidity do on this stack |
| **Leaderboard** | Top 100 wallets by **action count** (persisted when the API is running) |
| **Footer** | `genlayer 2026 by coded` |

## Prerequisites

- Node.js 20+
- Python + GenLayer tooling for tests (`genlayer-test`, `pytest`) as in your environment
- `DEPLOYER_PRIVATE_KEY` for deployment
- Testnet GEN from the [faucet](https://testnet-faucet.genlayer.foundation/)

## 1. Deploy intelligent contracts

From the repo root:

```powershell
$env:DEPLOYER_PRIVATE_KEY="0x..."   # PowerShell
# Optional: $env:GENLAYER_NETWORK="bradbury"   # default is asimov
npm install genlayer-js
node deploy.mjs
```

This deploys ERC20 tokens, `SwapRouter`, pools (including **USDC/GEN**), seeds liquidity, and writes **`deployed-addresses.json`**.

Copy that file into the frontend:

```powershell
Copy-Item deployed-addresses.json frontend/public/deployed-addresses.json
```

## 2. Leaderboard API (real ranks)

The UI POSTs events after **connect**, **swap**, **add/remove liquidity**. Start the API so data persists to `server/leaderboard-db.json`:

```powershell
cd server
npm install
npm start
```

Default port **8787**. The Vite dev server proxies `/api` to it.

## 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Set optional env in `frontend/.env`:

```env
VITE_GENLAYER_NETWORK=asimov
# or bradbury
# VITE_API_URL=http://127.0.0.1:8787   # only if not using Vite proxy
```

## Contracts layout

```
contracts/
  ERC20Token.py
  LiquidityPool.py
  SwapRouter.py
```

## Tests

```bash
pytest test_swap.py -v
```

(Paths expect `contracts/` next to `test_swap.py`.)

## References

- [GenLayer networks & RPC](https://docs.genlayer.com/developers/networks)
- [genlayer-js](https://www.npmjs.com/package/genlayer-js)
