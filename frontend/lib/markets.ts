// Merged UI config: on-chain addresses (addresses.ts) + display metadata for the multi-asset,
// multi-venue lending UI. APY / TVL / curator are DISPLAY values — they simulate what an Arc-mainnet
// deployment against real Morpho/Aave venues would show. On testnet the venues are mocks; the LIVE
// (USDC, Morpho) market wraps real Arc testnet USDC. Not affiliated with Morpho, Aave, or Steakhouse.

import { ASSETS, type AssetAddrs, type VenueAddrs } from "./addresses";

export type VenueMeta = VenueAddrs & {
  url: string; // official venue page
  logoKey: "morpho" | "aave"; // maps to a venue logo in the UI
  apy: string; // display supply APY, e.g. "4.82%"
  tvl: string; // display TVL, e.g. "$48.2M"
  curator?: string; // e.g. "Steakhouse" for the Morpho USDC vault
};

export type AssetMeta = Omit<AssetAddrs, "venues"> & {
  label: string; // human asset name, e.g. "USD Coin"
  underlyingSymbol: string; // e.g. "USDC"
  tint: string; // accent color
  venues: VenueMeta[];
};

// asset display, keyed by confidential symbol
const ASSET_DISPLAY: Record<string, { label: string; underlyingSymbol: string; tint: string }> = {
  cUSDC: { label: "USD Coin", underlyingSymbol: "USDC", tint: "#2775CA" },
  cWETH: { label: "Ether", underlyingSymbol: "WETH", tint: "#627EEA" },
  cWBTC: { label: "Bitcoin", underlyingSymbol: "WBTC", tint: "#F7931A" },
  cEURC: { label: "Euro Coin", underlyingSymbol: "EURC", tint: "#1C4CE0" },
  cUSTB: { label: "Tokenized Treasury", underlyingSymbol: "USTB", tint: "#1c8f5a" },
};

// per (asset, venue) display: apy, tvl, curator. Keyed "symbol|venueName".
const VENUE_DISPLAY: Record<string, { apy: string; tvl: string; curator?: string }> = {
  "cUSDC|Morpho": { apy: "4.82%", tvl: "$48.2M", curator: "Steakhouse" },
  "cUSDC|Aave": { apy: "3.30%", tvl: "$121.6M" },
  "cWETH|Morpho": { apy: "2.14%", tvl: "$31.5M", curator: "Steakhouse" },
  "cWETH|Aave": { apy: "1.95%", tvl: "$88.9M" },
  "cWBTC|Morpho": { apy: "1.37%", tvl: "$22.8M", curator: "Gauntlet" },
  "cWBTC|Aave": { apy: "0.88%", tvl: "$54.1M" },
  "cEURC|Morpho": { apy: "3.05%", tvl: "$9.4M", curator: "Steakhouse" },
  "cEURC|Aave": { apy: "2.40%", tvl: "$18.2M" },
  "cUSTB|Morpho": { apy: "5.11%", tvl: "$14.7M", curator: "Superstate" },
  "cUSTB|Aave": { apy: "4.60%", tvl: "$6.3M" },
};

const VENUE_URL: Record<string, { url: string; logoKey: "morpho" | "aave" }> = {
  Morpho: { url: "https://morpho.org", logoKey: "morpho" },
  Aave: { url: "https://aave.com", logoKey: "aave" },
};

export const ASSET_LIST: AssetMeta[] = ASSETS.map((a) => {
  const d = ASSET_DISPLAY[a.symbol];
  return {
    ...a,
    label: d.label,
    underlyingSymbol: d.underlyingSymbol,
    tint: d.tint,
    venues: a.venues.map((v) => ({
      ...v,
      url: VENUE_URL[v.name].url,
      logoKey: VENUE_URL[v.name].logoKey,
      apy: VENUE_DISPLAY[`${a.symbol}|${v.name}`].apy,
      tvl: VENUE_DISPLAY[`${a.symbol}|${v.name}`].tvl,
      curator: VENUE_DISPLAY[`${a.symbol}|${v.name}`].curator,
    })),
  };
});

export const assetMeta = (symbol: string): AssetMeta => ASSET_LIST.find((a) => a.symbol === symbol) ?? ASSET_LIST[0];
export const venueMeta = (symbol: string, venueName: string): VenueMeta => {
  const a = assetMeta(symbol);
  return a.venues.find((v) => v.name === venueName) ?? a.venues[0];
};
