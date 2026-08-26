// Circle CCTP (Crosschain Transfer Protocol) config for the Bridge screen. This is a GENUINE, live
// integration on Arc testnet (unlike the simulated lending venues): CCTP burns USDC on a source chain
// and mints NATIVE USDC on Arc (burn → Circle attestation → mint), via Circle's Bridge Kit SDK.
//
// The CCTP contract addresses + domain for each chain (incl. Arc's TokenMessenger/MessageTransmitter and
// Arc's CCTP domain) are carried INSIDE Bridge Kit's chain definitions (`ArcTestnet` etc.) — we do NOT
// hardcode them. If you ever hand-roll the flow, VERIFY the config against developers.circle.com (CCTP)
// and docs.arc.network/references — one older source listed Arc's CCTP domain as 7 rather than 26.

import { BridgeKit, ArcTestnet, BaseSepolia, EthereumSepolia, ArbitrumSepolia, type ChainDefinition } from "@circle-fin/bridge-kit";

export const bridgeKit = new BridgeKit();

// Destination is always Arc testnet — bring your USDC here, make it private, earn.
export const DEST = ArcTestnet;

export type SourceChain = {
  key: string;
  label: string;
  chain: ChainDefinition;
  chainId: number;
  explorer: string;
  logoTint: string;
};

// Testnet source chains a user can bring USDC from (all CCTP-supported by Bridge Kit).
export const SOURCE_CHAINS: SourceChain[] = [
  { key: "base", label: "Base Sepolia", chain: BaseSepolia, chainId: BaseSepolia.chainId, explorer: "https://sepolia.basescan.org", logoTint: "#0052FF" },
  { key: "eth", label: "Ethereum Sepolia", chain: EthereumSepolia, chainId: EthereumSepolia.chainId, explorer: "https://sepolia.etherscan.io", logoTint: "#627EEA" },
  { key: "arb", label: "Arbitrum Sepolia", chain: ArbitrumSepolia, chainId: ArbitrumSepolia.chainId, explorer: "https://sepolia.arbiscan.io", logoTint: "#28A0F0" },
];

// The four CCTP lifecycle steps, in order, for the staged progress UI.
export const CCTP_STEPS = [
  { key: "approve", label: "Approve USDC" },
  { key: "burn", label: "Burn on source" },
  { key: "fetchAttestation", label: "Awaiting Circle attestation" },
  { key: "mint", label: "Mint on Arc" },
] as const;
export type CctpStepKey = (typeof CCTP_STEPS)[number]["key"];
