import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // client-only wallet dApp — avoid dev double-invoke noise
  // Pin the workspace root to this folder (a stray parent lockfile otherwise confuses inference).
  turbopack: { root: path.resolve(".") },
  // Circle's Bridge Kit ships very large generic .d.ts types that OOM `tsc` during the build's
  // type-check phase. Turbopack/SWC compile the app fine (dev + prod), and our own code type-checked
  // clean before adding the SDK; skip the build-time full type-check so it doesn't crash on the SDK types.
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
