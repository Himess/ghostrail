// Demo agent: GET the paid resource → 402 → payConfidential → retry with the receipt → print the data.
// A full HTTP 402 round-trip against a local anvil.

import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync } from "node:fs";
import { payConfidential, type PaymentRequirements } from "../src/client.js";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const API = process.env.API_URL ?? "http://127.0.0.1:4021/premium-data";
// anvil key1 (public test key) unless overridden.
const AGENT_KEY = (process.env.AGENT_KEY ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as Hex;
const dep = JSON.parse(readFileSync(new URL("../../deployments/local.json", import.meta.url), "utf8"));

const account = privateKeyToAccount(AGENT_KEY);
const walletClient = createWalletClient({ account, chain: foundry, transport: http(RPC) });
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });

async function main() {
  console.log(`agent ${account.address} requesting ${API}`);

  // 1) First request — expect a 402 challenge.
  let r = await fetch(API);
  console.log("  GET =>", r.status, r.status === 402 ? "(payment required)" : "");
  if (r.status !== 402) throw new Error(`expected 402, got ${r.status}`);
  const requirements = (await r.json()) as PaymentRequirements;
  console.log("  requirements:", requirements);

  // 2) Pay confidentially on-chain; get an opaque receiptId.
  const receiptId = await payConfidential(
    requirements,
    { cusdc: dep.cUSDC as Address, usdc: dep.usdc as Address },
    walletClient,
    publicClient,
  );
  console.log("  paid. receiptId:", receiptId);

  // 3) Retry with the receipt header — expect 200 + the premium data.
  r = await fetch(API, { headers: { "X-Payment-Receipt": receiptId } });
  console.log("  GET (with receipt) =>", r.status);
  if (!r.ok) throw new Error(`expected 200, got ${r.status}: ${await r.text()}`);
  const data = await r.json();
  console.log("  premium data:", data);
  console.log("\n402 round-trip complete: amount + counterparty stayed confidential; only an opaque receipt crossed the wire.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
