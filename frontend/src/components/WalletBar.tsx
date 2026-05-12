import { useState } from "react";
import { useWallet, type WalletKind } from "../context/WalletContext";

export function WalletBar() {
  const { address, connect, disconnect, connecting, error, walletKind } = useWallet();
  const [open, setOpen] = useState(false);

  if (address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span className="mono" style={{ color: "var(--accent)", fontSize: "0.85rem" }}>
          {walletKind === "okx" ? "OKX" : walletKind === "rabby" ? "Rabby" : "MetaMask"}{" "}
          · {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const onPick = async (k: WalletKind) => {
    setOpen(false);
    await connect(k);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={connecting}
        onClick={() => setOpen(!open)}
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            minWidth: 220,
            zIndex: 50,
            padding: "0.75rem",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--muted)" }}>
            GenLayer testnet (chain 4221)
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <button type="button" className="btn btn-ghost" onClick={() => onPick("metamask")}>
              MetaMask
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onPick("rabby")}>
              Rabby
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onPick("okx")}>
              OKX Wallet
            </button>
          </div>
        </div>
      )}
      {error && (
        <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 6, maxWidth: 260 }}>
          {error}
        </div>
      )}
    </div>
  );
}
