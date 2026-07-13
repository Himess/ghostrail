import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // client-only wallet dApp — avoid dev double-invoke noise
  // Pin the workspace root to this folder (a stray parent lockfile otherwise confuses inference).
  turbopack: { root: path.resolve(".") },
};
export default nextConfig;
