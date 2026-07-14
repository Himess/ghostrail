// GhostRail — Arc testnet (chainId 5042002). Multi-asset, multi-venue confidential lending layer.
// Source of truth: deployments/arc-testnet.json. Single swap surface (no env vars).
// Per ASSET: one shared ConfidentialToken. Per (asset, VENUE): its own MockLendingVenue + VaultRouter.

export type Hex = `0x${string}`;

export const CHAIN_ID = 5042002;
export const EXPLORER = "https://testnet.arcscan.app";
export const FAUCET = "https://faucet.circle.com";

export const LEDGER = "0x3957406ca80C8176C557DDCFEE83D482cFB241E1" as Hex;
export const REAL_USDC = "0x3600000000000000000000000000000000000000" as Hex;

export type VenueAddrs = {
  name: string; // "Morpho" | "Aave"
  venue: Hex;
  router: Hex;
  simulated: boolean; // false only for (USDC, Morpho) — the LIVE market
};

export type AssetAddrs = {
  symbol: string; // confidential token symbol, e.g. "cUSDC"
  underlying: Hex;
  cToken: Hex;
  decimals: number;
  live: boolean; // true = real Arc USDC underlying
  venues: VenueAddrs[];
};

export const ASSETS: AssetAddrs[] = [
  {
    symbol: "cUSDC", underlying: REAL_USDC, cToken: "0x5d97184fb174f00EFD938277D405083DCdC9F562", decimals: 6, live: true,
    venues: [
      { name: "Morpho", venue: "0x8D0DAa333c4F3A2d518719f149f68E225137Ef6B", router: "0xCEDA3eE062a10Dd274f4a243a0601E434063d024", simulated: false },
      { name: "Aave", venue: "0xe8CbE53dbDb8bDa07637Cc16C1Bbc11067a2153f", router: "0x4BDC81797936fccB85BA1dF03E0e314ffa7E5EAd", simulated: true },
    ],
  },
  {
    symbol: "cWETH", underlying: "0xf4263199a7cB00f55F02CD4087C9BDE00EdddB79", cToken: "0x34a3eE997333ccf30DAF228F94Fc3d2036e6Ab49", decimals: 18, live: false,
    venues: [
      { name: "Morpho", venue: "0xeD2ab9b3dDc3a4082FB82127bED94a6b13d973bC", router: "0x885E6CB64E4A16f91D9b77a086B93e9e090a9f3a", simulated: true },
      { name: "Aave", venue: "0x7F6618c1B8e44a7C759b2Ea08B855D39FEc9D633", router: "0x876bB8979a108EaA516BC33307e4eCaa11cb5e05", simulated: true },
    ],
  },
  {
    symbol: "cWBTC", underlying: "0xA036928453b7BD49F3309DA144f01c431e1aDE7E", cToken: "0x02847F0C467b4588c363684d5A28746BFeCA0c05", decimals: 8, live: false,
    venues: [
      { name: "Morpho", venue: "0x2f8D83A2c0174218cCC5b80B54455fd792574A88", router: "0xD3A8681Aa4F936B00B13657fFd7531a5e1F41BBE", simulated: true },
      { name: "Aave", venue: "0x9C1E809d0Cd708BB8c4f8E57008ca6F669031682", router: "0x93552184755b25A0e4bd4B1b7E607bAce3d2819A", simulated: true },
    ],
  },
  {
    symbol: "cEURC", underlying: "0x7a8fa1FA0918b948C7913b8Ed26998f4150f03f8", cToken: "0x97e5F35501a10fe74f8393410a21EEf6b7Cf8418", decimals: 6, live: false,
    venues: [
      { name: "Morpho", venue: "0xa4C9d389b25B68b98CCaD54C258259506B9c438d", router: "0xED055a15aC521a56111969963F1Fd7614170D655", simulated: true },
      { name: "Aave", venue: "0xEa484a090d7eD3b6934B94E6EE0464ab447b52a6", router: "0x7B5cDAc513c16e82f3e516D57ca9D8F2766CAaFC", simulated: true },
    ],
  },
  {
    symbol: "cUSTB", underlying: "0x24BfB99875893FF51D2C009BcC6c79A5CDAaBDE9", cToken: "0x0614B7647124961e7442963a5Bf70b55Eec65A1A", decimals: 6, live: false,
    venues: [
      { name: "Morpho", venue: "0x416B5629Ff722c2145D4dD3A4ed8981cCEF43A35", router: "0xaf11A05d58C5696d4F123aeb1624e093ebCf9ac9", simulated: true },
      { name: "Aave", venue: "0x7D7a50e59681DB11Da83FEbC6001621c90EeE770", router: "0xBad9944337f70C797EF23aFa440519348279BAD7", simulated: true },
    ],
  },
];

export const assetBySymbol = (s: string): AssetAddrs => ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];
export const USDC_ASSET = ASSETS[0];
export const venueOf = (assetSymbol: string, venueName: string): VenueAddrs => {
  const a = assetBySymbol(assetSymbol);
  return a.venues.find((v) => v.name === venueName) ?? a.venues[0];
};
