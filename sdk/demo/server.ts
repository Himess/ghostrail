// Demo paid API: GET /premium-data is gated behind a GhostRail confidential 402 payment.
// Run against a local anvil after `forge script script/DeployLocal.s.sol ... --broadcast`.

import express from "express";
import { createPublicClient, http, keccak256, toHex, type Address } from "viem";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { requireConfidentialPayment } from "../src/middleware.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT ?? 4021);
const dep = JSON.parse(readFileSync(new URL("../../deployments/local.json", import.meta.url), "utf8"));

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });

const AMOUNT = BigInt(process.env.PRICE ?? "500000"); // 0.5 USDC (6 dec)
const REF = keccak256(toHex("premium-data")); // resource tag (bytes32)

const app = express();

app.get(
  "/premium-data",
  requireConfidentialPayment({
    publicClient,
    ledger: dep.ledger as Address,
    service: dep.service as Address,
    amount: AMOUNT,
    ref: REF,
  }),
  (_req, res) => {
    res.json({
      premium: "GhostRail alpha: confidential agent payments settle on Arc; amounts stay in the enclave.",
      servedAt: new Date().toISOString(),
    });
  },
);

app.listen(PORT, () => {
  console.log(`GhostRail paid API on http://127.0.0.1:${PORT}/premium-data`);
  console.log(`  price: ${AMOUNT} (6-dec USDC)  ledger: ${dep.ledger}  service: ${dep.service}`);
});
