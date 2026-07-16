// GhostRail — Arc testnet (chainId 5042002). Multi-asset, multi-venue confidential lending layer.
// Source of truth: deployments/arc-testnet.json. Single swap surface (no env vars).
// Per ASSET: one shared ConfidentialToken. Per (asset, VENUE): its own MockLendingVenue + VaultRouter.

export type Hex = `0x${string}`;

export const CHAIN_ID = 5042002;
export const EXPLORER = "https://testnet.arcscan.app";
export const FAUCET = "https://faucet.circle.com";

export const LEDGER = "0x32f2fb56D586606904Fc24C5f9056Aba3f28888A" as Hex;
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
    symbol: "cUSDC", underlying: REAL_USDC, cToken: "0xB0e195dcB60f5f8179aef7c57722318CC83Bd419", decimals: 6, live: true,
    venues: [
      { name: "Morpho", venue: "0x57182F32382EbcD6c2dEA8c50040D8c458A22fb7", router: "0x568c85e2956b666B6B1E82607d9CC853A1134F9D", simulated: false },
      { name: "Aave", venue: "0x50865E010e4286852bBb0cF1B4479385770B3C3F", router: "0xc9Bf118F3eaE3E5cdfB08F7F3f35Ac6d0B9B567a", simulated: true },
    ],
  },
  {
    symbol: "cWETH", underlying: "0x7ba5456C0d1D17bE3bD905b829E1Dc4d6306CB10", cToken: "0x770A249d8426f983F2Ce87f2924D1208E7d2b0F8", decimals: 18, live: false,
    venues: [
      { name: "Morpho", venue: "0x3563E8483afCAC8e434ADd43F0Bd967Fef845170", router: "0xaDE19dAc699aEBA4E439a1271A7F6cF675cD7D2D", simulated: true },
      { name: "Aave", venue: "0x78ceD065ca2f862a641Cf52c33734928d15BffdE", router: "0x1acAE8eE69d2D1C7235627b066ED5AF8FeEa8229", simulated: true },
    ],
  },
  {
    symbol: "cWBTC", underlying: "0xF46FeefB93FAD5a3A0291c9892b923d29FA9d141", cToken: "0xf67A876A04A70D3102601EA36089fe1fe408d2e0", decimals: 8, live: false,
    venues: [
      { name: "Morpho", venue: "0xb0180d3Bb42A7cF5d0a35755f1577F47b233E2B9", router: "0xDdb728634efa60df83B45982F02aC535Cb6d66E6", simulated: true },
      { name: "Aave", venue: "0x8a97d3CE0242379163E0d9184E56F02067dC8b21", router: "0xCBde6308C4Df3D4Da9F0e8Cba7755c491C1175bE", simulated: true },
    ],
  },
  {
    symbol: "cEURC", underlying: "0x8a9080f818d608202f979A55668513d837c5e353", cToken: "0x6D7Eb94B4c00E913fB5Ac1718667090AcCC65A01", decimals: 6, live: false,
    venues: [
      { name: "Morpho", venue: "0x5165aA5ac7b69e3bA039d6Dac3B9d896FB37C529", router: "0xF84510443504DAC16F436F35CaD47b1CdBFa476F", simulated: true },
      { name: "Aave", venue: "0x464Ae2E9Da73673A060bD8C1DaA3C5f947f41Cf5", router: "0x8D2C6Db9bD407EC931c4fd40e6bEdFD1A0B4273C", simulated: true },
    ],
  },
  {
    symbol: "cUSTB", underlying: "0xdaE18d4AAD75d2B1A451BC090e4c329E3f67E456", cToken: "0x60361943d66EbcC36Eb093c6Cb53aca7E1D9DD68", decimals: 6, live: false,
    venues: [
      { name: "Morpho", venue: "0x6560BE043a2DE4b263A6D73e91e238938E127742", router: "0x35B773DC2DB37B531BDD7Fe6aFCa28Ec95b041fc", simulated: true },
      { name: "Aave", venue: "0x59a26b076DBec3E81907dF5498a30edbB31E052d", router: "0x77D335EFaD3B6d6099b697F216E863D7afc32B5A", simulated: true },
    ],
  },
];

export const assetBySymbol = (s: string): AssetAddrs => ASSETS.find((a) => a.symbol === s) ?? ASSETS[0];
export const USDC_ASSET = ASSETS[0];
export const venueOf = (assetSymbol: string, venueName: string): VenueAddrs => {
  const a = assetBySymbol(assetSymbol);
  return a.venues.find((v) => v.name === venueName) ?? a.venues[0];
};
