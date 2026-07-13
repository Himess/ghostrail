"use client";
import { createContext, useContext, useState, ReactNode } from "react";

// GhostRail's route set: a multi-market confidential LENDING platform. Markets is the hero (default);
// Payments is the subordinate, last item. Earn is the per-market deposit/withdraw screen.
export type Route =
  | "markets"
  | "earn"
  | "ghostgate"
  | "balances"
  | "faucet"
  | "dashboard"
  | "status"
  | "payments";

type NavState = {
  route: Route;
  go: (r: Route) => void;
  selectedMarket: string; // confidential symbol, e.g. "cUSDC"
  setSelectedMarket: (symbol: string) => void;
  openMarket: (symbol: string) => void; // select a market + navigate to Earn
};

const Ctx = createContext<NavState | null>(null);
export const useNav = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNav outside provider");
  return c;
};

export function NavProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>("markets");
  const [selectedMarket, setSelectedMarket] = useState<string>("cUSDC");
  const scroll = () => typeof window !== "undefined" && window.scrollTo(0, 0);
  const go = (r: Route) => { setRoute(r); scroll(); };
  const openMarket = (symbol: string) => { setSelectedMarket(symbol); go("earn"); };
  return (
    <Ctx.Provider value={{ route, go, selectedMarket, setSelectedMarket, openMarket }}>
      {children}
    </Ctx.Provider>
  );
}
