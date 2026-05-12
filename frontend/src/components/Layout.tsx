import { NavLink, Outlet } from "react-router-dom";
import { WalletBar } from "./WalletBar";

const nav = [
  { to: "/", label: "Swap" },
  { to: "/liquidity", label: "Liquidity" },
  { to: "/about", label: "About" },
  { to: "/leaderboard", label: "Leaderboard" },
];

export function Layout() {
  return (
    <div className="app-shell">
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(12, 10, 20, 0.75)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: "1.15rem",
                letterSpacing: "-0.02em",
                background: "linear-gradient(90deg,#c4b5fd,#93c5fd)",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              GenLayer Swap
            </span>
            <nav style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {nav.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  style={({ isActive }) => ({
                    padding: "0.45rem 0.85rem",
                    borderRadius: 10,
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: isActive ? "#fff" : "var(--muted)",
                    background: isActive ? "rgba(139,92,246,0.35)" : "transparent",
                    textDecoration: "none",
                  })}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
          <WalletBar />
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer
        style={{
          textAlign: "center",
          padding: "1.5rem 1rem",
          color: "var(--muted)",
          fontSize: "0.9rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        genlayer 2026 by coded
      </footer>
    </div>
  );
}
