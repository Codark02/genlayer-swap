export type DeployedContracts = {
  ROUTER: string;
  USDT: string;
  USDC: string;
  WETH: string;
  GEN: string;
  POOL_USDT_GEN: string;
  POOL_WETH_GEN: string;
  POOL_USDC_GEN: string;
};

export type DeployedManifest = {
  network: string;
  deployer?: string;
  deployedAt?: string;
  contracts: DeployedContracts & Record<string, string>;
};

export function isConfigured(
  m: DeployedManifest | null | undefined
): m is DeployedManifest {
  const r = m?.contracts?.ROUTER;
  if (typeof r !== "string" || r.length !== 42 || !r.startsWith("0x")) return false;
  if (/^0x0{40}$/i.test(r)) return false;
  return true;
}

export async function loadDeployed(): Promise<DeployedManifest | null> {
  try {
    const res = await fetch("/deployed-addresses.json", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as DeployedManifest;
  } catch {
    return null;
  }
}

export function poolKeyForPair(base: "USDT" | "USDC" | "WETH"): keyof DeployedContracts {
  if (base === "USDT") return "POOL_USDT_GEN";
  if (base === "USDC") return "POOL_USDC_GEN";
  return "POOL_WETH_GEN";
}

export function tokenAddress(
  manifest: DeployedManifest,
  sym: "USDT" | "USDC" | "WETH" | "GEN"
): `0x${string}` {
  return manifest.contracts[sym] as `0x${string}`;
}
