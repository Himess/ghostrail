// wagmi config — Arc testnet (the app's home) + the CCTP source testnets users bridge USDC FROM.
// Injected wallet only (MetaMask / EIP-6963). No env vars.
import { createConfig, http } from "wagmi";
import { arcTestnet, baseSepolia, sepolia, arbitrumSepolia } from "viem/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [arcTestnet, baseSepolia, sepolia, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
  ssr: false,
});
