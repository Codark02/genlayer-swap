import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "genlayer-js";
import type { Address, EIP1193Provider } from "viem";
import { getAddress } from "viem";
import { getGenLayerChain, walletAddChainParams } from "../lib/chain";
import { recordActivity } from "../lib/activity";

export type WalletKind = "metamask" | "rabby" | "okx";

function pickMetaMask(): EIP1193Provider | null {
  type P = EIP1193Provider & { providers?: EIP1193Provider[]; isMetaMask?: boolean; isRabby?: boolean };
  const e = (typeof window !== "undefined" ? (window as unknown as { ethereum?: P }).ethereum : undefined);
  if (!e) return null;
  if (e.providers && Array.isArray(e.providers)) {
    const list = e.providers as P[];
    const mm = list.find((p) => p.isMetaMask && !p.isRabby);
    return mm ?? list.find((p) => p.isMetaMask) ?? null;
  }
  return e.isMetaMask ? e : null;
}

function pickRabby(): EIP1193Provider | null {
  type P = EIP1193Provider & { providers?: EIP1193Provider[]; isRabby?: boolean };
  const e = (typeof window !== "undefined" ? (window as unknown as { ethereum?: P }).ethereum : undefined);
  if (!e) return null;
  if (e.providers && Array.isArray(e.providers)) {
    return (e.providers as P[]).find((p) => p.isRabby) ?? null;
  }
  return e.isRabby ? e : null;
}

function pickOkx(): EIP1193Provider | null {
  return (
    (typeof window !== "undefined"
      ? (window as unknown as { okxwallet?: { ethereum?: EIP1193Provider } }).okxwallet?.ethereum
      : undefined) ?? null
  );
}

export type GlClient = ReturnType<typeof createClient>;

type Ctx = {
  address: Address | null;
  provider: EIP1193Provider | null;
  client: GlClient | null;
  chain: ReturnType<typeof getGenLayerChain>;
  error: string | null;
  connecting: boolean;
  walletKind: WalletKind | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
};

const W = createContext<Ctx | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const chain = useMemo(() => getGenLayerChain(), []);
  const [address, setAddress] = useState<Address | null>(null);
  const [provider, setProvider] = useState<EIP1193Provider | null>(null);
  const [walletKind, setWalletKind] = useState<WalletKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const client = useMemo(() => {
    if (!address || !provider) return null;
    return createClient({ chain, account: getAddress(address), provider });
  }, [chain, address, provider]);

  const connect = useCallback(
    async (kind: WalletKind) => {
      setErr(null);
      setConnecting(true);
      try {
        const p =
          kind === "okx" ? pickOkx() : kind === "rabby" ? pickRabby() : pickMetaMask();
        if (!p) {
          setErr(
            kind === "okx"
              ? "OKX Wallet not found. Install the OKX browser extension."
              : kind === "rabby"
                ? "Rabby not found. Install Rabby or connect with MetaMask."
                : "MetaMask not found."
          );
          return;
        }
        const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
        if (!accounts[0]) {
          setErr("Wallet returned no accounts.");
          return;
        }
        const acct = getAddress(accounts[0] as Address);
        const targetHex = ("0x" + chain.id.toString(16)) as `0x${string}`;
        const cur = (await p.request({ method: "eth_chainId" })) as string;
        if (cur.toLowerCase() !== targetHex.toLowerCase()) {
          try {
            await p.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: targetHex }],
            });
          } catch (switchErr: unknown) {
            const code = (switchErr as { code?: number }).code;
            if (code === 4902 || code === -32603) {
              await p.request({
                method: "wallet_addEthereumChain",
                params: [walletAddChainParams(chain)],
              });
            } else {
              throw switchErr;
            }
          }
        }
        setProvider(p);
        setAddress(acct);
        setWalletKind(kind);
        void recordActivity(acct, "connect");
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setConnecting(false);
      }
    },
    [chain]
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setWalletKind(null);
    setErr(null);
  }, []);

  const value = useMemo(
    () => ({
      address,
      provider,
      client,
      chain,
      error: err,
      connecting,
      walletKind,
      connect,
      disconnect,
    }),
    [address, provider, client, chain, err, connecting, walletKind, connect, disconnect]
  );

  return <W.Provider value={value}>{children}</W.Provider>;
}

export function useWallet() {
  const x = useContext(W);
  if (!x) throw new Error("useWallet must be used inside WalletProvider");
  return x;
}
