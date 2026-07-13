// wagmi config — Arc testnet only, injected wallet only (MetaMask / EIP-6963). No env vars.
import { createConfig, http } from "wagmi";
import { arcTestnet } from "viem/chains";
import { injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
  },
  ssr: false,
});
