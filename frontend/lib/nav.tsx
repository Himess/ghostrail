"use client";
import { createContext, useContext, useState, ReactNode } from "react";

// GhostRail's route set: a multi-market confidential LENDING platform. Markets is the hero (default);
// Payments is the subordinate, last item. Earn is the per-(asset, venue) deposit/withdraw screen.
export type Route =
  | "markets"
  | "earn"
  | "ghostgate"
  | "balances"
  | "bridge"
  | "faucet"
  | "dashboard"
  | "status"
  | "payments";

// A "market" is now an (asset, venue) pair: an asset (e.g. cUSDC) routes to more than one public venue
// (Morpho, Aave), each its own router. Nav tracks BOTH the selected asset symbol and the selected venue.
const DEFAULT_VENUE = "Morpho";

type NavState = {
  route: Route;
  go: (r: Route) => void;
  selectedMarket: string; // confidential asset symbol, e.g. "cUSDC"
  setSelectedMarket: (symbol: string) => void;
  selectedVenue: string; // venue name, e.g. "Morpho" | "Aave"
  setSelectedVenue: (venueName: string) => void;
  openMarket: (symbol: string) => void; // select an asset (default venue) + navigate to Earn
  openVenue: (symbol: string, venueName: string) => void; // select an (asset, venue) pair + navigate to Earn
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
  const [selectedVenue, setSelectedVenue] = useState<string>(DEFAULT_VENUE);
  const scroll = () => typeof window !== "undefined" && window.scrollTo(0, 0);
  const go = (r: Route) => { setRoute(r); scroll(); };
  // Selecting an asset without naming a venue resets to the default (live/primary) venue, so the Earn
  // screen always binds a deterministic router.
  const openMarket = (symbol: string) => { setSelectedMarket(symbol); setSelectedVenue(DEFAULT_VENUE); go("earn"); };
  const openVenue = (symbol: string, venueName: string) => { setSelectedMarket(symbol); setSelectedVenue(venueName); go("earn"); };
  return (
    <Ctx.Provider value={{ route, go, selectedMarket, setSelectedMarket, selectedVenue, setSelectedVenue, openMarket, openVenue }}>
      {children}
    </Ctx.Provider>
  );
}
