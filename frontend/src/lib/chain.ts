import { testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { Chain } from "viem";

export function getGenLayerChain(): Chain {
  const n = (import.meta.env.VITE_GENLAYER_NETWORK || "asimov").toLowerCase();
  return n === "bradbury" ? testnetBradbury : testnetAsimov;
}

export function walletAddChainParams(chain: Chain) {
  const rpc = chain.rpcUrls.default.http[0];
  return {
    chainId: "0x" + chain.id.toString(16),
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [rpc],
    blockExplorerUrls: chain.blockExplorers?.default?.url
      ? [chain.blockExplorers.default.url]
      : undefined,
  };
}
