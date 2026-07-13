// Merged market config: on-chain addresses (addresses.ts) + display metadata for the multi-market
// lending UI. APY/venue are DISPLAY values — they simulate what an Arc-mainnet deployment against real
// Morpho/Aave venues would show. On testnet the venues are mocks; the `simulated` flag marks the
// non-USDC markets (mock underlyings) vs the LIVE USDC market (real Arc testnet USDC).

import { MARKETS, type MarketAddrs } from "./addresses";

export type MarketMeta = MarketAddrs & {
  label: string; // human asset name, e.g. "USD Coin"
  underlyingSymbol: string; // e.g. "USDC"
  venueName: string; // "Morpho" | "Aave"
  venueUrl: string; // official venue page
  apy: string; // display APY, e.g. "4.8%"
  tint: string; // accent color for the market card
};

const DISPLAY: Record<string, Omit<MarketMeta, keyof MarketAddrs>> = {
  cUSDC: { label: "USD Coin", underlyingSymbol: "USDC", venueName: "Morpho", venueUrl: "https://morpho.org", apy: "4.82%", tint: "#2775CA" },
  cWETH: { label: "Ether", underlyingSymbol: "WETH", venueName: "Aave", venueUrl: "https://aave.com", apy: "2.14%", tint: "#627EEA" },
  cWBTC: { label: "Bitcoin", underlyingSymbol: "WBTC", venueName: "Morpho", venueUrl: "https://morpho.org", apy: "1.37%", tint: "#F7931A" },
  cEURC: { label: "Euro Coin", underlyingSymbol: "EURC", venueName: "Aave", venueUrl: "https://aave.com", apy: "3.05%", tint: "#1C4CE0" },
  cUSTB: { label: "Tokenized Treasury", underlyingSymbol: "USTB", venueName: "Morpho", venueUrl: "https://morpho.org", apy: "5.11%", tint: "#1c8f5a" },
};

export const MARKET_LIST: MarketMeta[] = MARKETS.map((m) => ({ ...m, ...DISPLAY[m.symbol] }));
export const marketMeta = (symbol: string): MarketMeta => MARKET_LIST.find((m) => m.symbol === symbol) ?? MARKET_LIST[0];
