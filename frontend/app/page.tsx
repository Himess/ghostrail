"use client";
import { useEffect, useState } from "react";
import App from "@/components/App";

// The whole shell is a browser-only dApp (injected wallet). Render it only after mount, so it never
// runs during SSR / static prerender — without pulling next/dynamic's ssr:false path (which trips a
// work-async-storage prerender invariant on the error pages in this Next version).
export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <App />;
}
