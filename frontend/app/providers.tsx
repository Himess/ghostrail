"use client";

import { ReactNode, useEffect, useState } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Provider tree is just WagmiProvider → QueryClientProvider. GhostRail is a plain-EVM dApp on Arc — no
// extra crypto/relayer layer. The wagmi config (createConfig + injected connector) is imported LAZILY, on the
// client only, so its module never enters the root layout's server chunk — that keeps the static prerender
// of Next's /_not-found and /_global-error clean on this Next version.
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [config, setConfig] = useState<Config | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let alive = true;
    setMounted(true);
    import("@/lib/wagmi").then((m) => alive && setConfig(m.config));
    return () => { alive = false; };
  }, []);

  // Server + first client paint (hydration-safe, identical output): render bare children. `app/page.tsx`
  // returns null until its own mount, so nothing wagmi-dependent renders here.
  if (!mounted) return <>{children}</>;
  // Client, mounted but the wagmi config hasn't resolved yet: hold rendering for the (sub-frame) dynamic
  // import so no component ever calls useAccount/useConfig outside WagmiProvider.
  if (!config) return null;
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
