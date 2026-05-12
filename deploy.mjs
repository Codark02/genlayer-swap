// deploy.mjs — GenLayer Swap Portal deployment
// Usage: set DEPLOYER_PRIVATE_KEY, optional GENLAYER_NETWORK=asimov|bradbury
//   node deploy.mjs

import { createClient, createAccount } from "genlayer-js";
import { testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { readFileSync } from "fs";
import { TransactionStatus } from "genlayer-js/types";

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Set DEPLOYER_PRIVATE_KEY in environment");

const NETWORK = (process.env.GENLAYER_NETWORK || "asimov").toLowerCase();
const chain =
  NETWORK === "bradbury" ? testnetBradbury : testnetAsimov;

const ONE_TOKEN = 10n ** 18n;

const TOKENS = [
  { name: "Tether USD", symbol: "USDT", decimals: 6n, supply: 100_000_000n * 10n ** 6n },
  { name: "USD Coin", symbol: "USDC", decimals: 6n, supply: 100_000_000n * 10n ** 6n },
  { name: "Wrapped Ether", symbol: "WETH", decimals: 18n, supply: 50_000n * ONE_TOKEN },
  { name: "GenLayer Token", symbol: "GEN", decimals: 18n, supply: 500_000_000n * ONE_TOKEN },
];

const POOLS = [
  ["USDT", "USDC", 5n],
  ["USDT", "WETH", 30n],
  ["USDC", "WETH", 30n],
  ["WETH", "GEN", 30n],
  ["USDT", "GEN", 30n],
  ["USDC", "GEN", 30n],
];

const INITIAL_LIQUIDITY = {
  "USDT-USDC": [10_000n * 10n ** 6n, 10_000n * 10n ** 6n],
  "USDT-WETH": [3_378n * 10n ** 6n, 1n * ONE_TOKEN],
  "USDC-WETH": [3_378n * 10n ** 6n, 1n * ONE_TOKEN],
  "WETH-GEN": [1n * ONE_TOKEN, 8_043n * ONE_TOKEN],
  "USDT-GEN": [420n * 10n ** 6n, 1_000n * ONE_TOKEN],
  "USDC-GEN": [420n * 10n ** 6n, 1_000n * ONE_TOKEN],
};

const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain, account });

async function deployContract(name, codePath, args = []) {
  console.log(`\n▶ Deploying ${name}...`);
  const code = readFileSync(codePath, "utf8");
  const txHash = await client.deployContract({ code, args, leaderOnly: false });
  console.log(`  TX: ${txHash}`);
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 5000,
  });
  const addr = receipt.data?.contract_address;
  console.log(`  ✓ ${name} deployed at: ${addr}`);
  return addr;
}

async function callWrite(label, contractAddr, method, args = []) {
  console.log(`  → ${label}`);
  const tx = await client.writeContract({
    address: contractAddr,
    functionName: method,
    args,
    value: 0n,
  });
  await client.waitForTransactionReceipt({
    hash: tx,
    status: TransactionStatus.ACCEPTED,
    retries: 30,
    interval: 4000,
  });
}

async function callRead(contractAddr, method, args = []) {
  return client.readContract({
    address: contractAddr,
    functionName: method,
    args,
  });
}

/** Pool sorts by token address; map (symA amt, symB amt) → (amount0, amount1). */
function poolAmountsForAdd(addresses, symA, symB, amtForA, amtForB) {
  const addrA = addresses[symA].toLowerCase();
  const addrB = addresses[symB].toLowerCase();
  if (addrA < addrB) return { token0Sym: symA, token1Sym: symB, amt0: amtForA, amt1: amtForB };
  return { token0Sym: symB, token1Sym: symA, amt0: amtForB, amt1: amtForA };
}

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  GenLayer Swap Portal — Deployment");
  console.log("═══════════════════════════════════════");
  console.log(`  Deployer: ${account.address}`);
  console.log(`  Network:  ${NETWORK} (${chain.name})`);

  const deployerAddr = account.address;
  const addresses = {};

  console.log("\n━━━ STEP 1: Token Contracts ━━━");
  for (const token of TOKENS) {
    const addr = await deployContract(
      `ERC20 — ${token.symbol}`,
      "./contracts/ERC20Token.py",
      [token.name, token.symbol, token.decimals, token.supply]
    );
    addresses[token.symbol] = addr;
  }

  console.log("\n━━━ STEP 2: Swap Router ━━━");
  const routerAddr = await deployContract(
    "SwapRouter",
    "./contracts/SwapRouter.py",
    [deployerAddr]
  );
  addresses.ROUTER = routerAddr;

  console.log("\n━━━ STEP 3: Liquidity Pools ━━━");
  for (const [symA, symB, feeBps] of POOLS) {
    const poolName = `Pool ${symA}/${symB}`;
    const addr = await deployContract(
      poolName,
      "./contracts/LiquidityPool.py",
      [addresses[symA], addresses[symB], feeBps]
    );
    addresses[`POOL_${symA}_${symB}`] = addr;
    await callWrite(
      `Register ${symA}/${symB} in router`,
      routerAddr,
      "register_pool",
      [addresses[symA], addresses[symB], addr]
    );
  }

  console.log("\n━━━ STEP 4: Seed Initial Liquidity ━━━");
  for (const [symA, symB] of POOLS) {
    const poolKey = `POOL_${symA}_${symB}`;
    const poolAddr = addresses[poolKey];
    const liqKey = `${symA}-${symB}`;
    const raw = INITIAL_LIQUIDITY[liqKey] || [0n, 0n];
    const [amtForA, amtForB] = raw;

    if (amtForA === 0n) {
      console.log(`  ⚠ No initial liquidity for ${liqKey}, skipping`);
      continue;
    }

    const { token0Sym, token1Sym, amt0, amt1 } = poolAmountsForAdd(
      addresses,
      symA,
      symB,
      amtForA,
      amtForB
    );

    console.log(`\n  Seeding ${symA}/${symB} (token0=${token0Sym}, token1=${token1Sym})...`);

    await callWrite(`Approve pool for ${token0Sym}`, addresses[token0Sym], "approve", [
      poolAddr,
      amt0,
    ]);
    await callWrite(`Approve pool for ${token1Sym}`, addresses[token1Sym], "approve", [
      poolAddr,
      amt1,
    ]);
    await callWrite(`Add initial liquidity`, poolAddr, "add_liquidity", [amt0, amt1, 0n, 0n]);

    const reserves = await callRead(poolAddr, "get_reserves");
    console.log(`  ✓ Reserves: ${JSON.stringify(reserves)}`);
  }

  console.log("\n\n═══════════════════════════════════════");
  console.log("  ✅ DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════");

  const output = {
    network: NETWORK === "bradbury" ? "testnet-bradbury" : "testnet-asimov",
    deployer: deployerAddr,
    deployedAt: new Date().toISOString(),
    contracts: addresses,
  };

  const fs = await import("fs");
  fs.writeFileSync("./deployed-addresses.json", JSON.stringify(output, null, 2));
  console.log("\n✓ Addresses saved to deployed-addresses.json");
  console.log("Copy deployed-addresses.json to frontend/public/ for the web app.");
}

main().catch((err) => {
  console.error("\n✗ Deployment failed:", err);
  process.exit(1);
});
