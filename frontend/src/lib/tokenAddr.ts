import type { DeployedManifest } from "./contracts";

export type DisplayToken = "USDT" | "USDC" | "ETH" | "GEN";

export function resolveTokenAddress(
  m: DeployedManifest,
  display: DisplayToken
): `0x${string}` {
  if (display === "ETH") return m.contracts.WETH as `0x${string}`;
  return m.contracts[display] as `0x${string}`;
}

export function decimalsFor(display: DisplayToken): number {
  return display === "USDT" || display === "USDC" ? 6 : 18;
}
