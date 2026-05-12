import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import SwapPage from "./pages/SwapPage";
import LiquidityPage from "./pages/LiquidityPage";
import AboutPage from "./pages/AboutPage";
import LeaderboardPage from "./pages/LeaderboardPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<SwapPage />} />
        <Route path="/liquidity" element={<LiquidityPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
      </Route>
    </Routes>
  );
}
