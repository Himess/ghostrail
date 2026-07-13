# GhostRail SDK — confidential x402 payments

A tiny, viem-based SDK that turns an HTTP `402 Payment Required` into a **confidential** on-chain
payment through the GhostRail Payment Ledger. Amounts and counterparties never appear in an event —
only an opaque `receiptId` crosses the wire, which the service verifies via its own gated view.

- `src/middleware.ts` — `requireConfidentialPayment(...)`: Express middleware. No `X-Payment-Receipt`
  header → `402` + JSON requirements. With a header → on-chain `verifyReceipt(...)` from the service's
  account → `next()` on success.
- `src/client.ts` — `payConfidential(requirements, config, wallet, public)`: shields + funds on demand,
  executes one confidential `pay`, returns the `receiptId`.
- `src/abi.ts` — minimal ABIs.
- `demo/server.ts` — a paid API: `GET /premium-data` behind the middleware.
- `demo/agent.ts` — an agent doing the full round-trip: fetch → 402 → pay → retry → data.

## Run the demo (local anvil)

From the repo root (`ghostrail/`):

```bash
# 1. a local chain
anvil

# 2. deploy the stack + seed the agent with test USDC (writes deployments/local.json)
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# 3. the SDK
cd sdk
npm install

# 4. start the paid API (terminal A)
npm run server      # http://127.0.0.1:4021/premium-data  (price 0.5 USDC)

# 5. run the agent (terminal B)
npm run agent
```

Expected agent output:

```
GET => 402 (payment required)
requirements: { scheme: 'ghostrail-confidential', ledger: 0x…, service: 0x…, amount: '500000', ref: 0x… }
paid. receiptId: 0x…
GET (with receipt) => 200
premium data: { premium: 'GhostRail alpha: …', servedAt: '…' }
402 round-trip complete: amount + counterparty stayed confidential; only an opaque receipt crossed the wire.
```

Env overrides: `RPC_URL`, `API_URL`, `PORT`, `PRICE`, `AGENT_KEY` (defaults use anvil's well-known keys).

## MCP paid-tool mapping

The same gate wraps an MCP paid-tool handler — charge per tool call, keep amounts confidential. Sketch
(the client presents a `receiptId` the same way the HTTP agent does; verification is one gated read):

```ts
import { createPublicClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { ledgerAbi } from "@ghostrail/sdk/src/abi.js";

const publicClient = createPublicClient({ chain: foundry, transport: http() });
const LEDGER = "0x…" as Address;
const SERVICE = "0x…" as Address; // this tool's account
const PRICE = 500_000n; // 0.5 USDC

// Wrap any MCP tool handler: require a verified confidential receipt before doing the work.
function paidTool(name: string, handler: (args: any) => Promise<any>) {
  return async (args: { receiptId?: Hex } & Record<string, unknown>) => {
    const ref = keccak256(toHex(`mcp:${name}`));
    const ok =
      !!args.receiptId &&
      (await publicClient.readContract({
        address: LEDGER,
        abi: ledgerAbi,
        functionName: "verifyReceipt",
        args: [args.receiptId, SERVICE, PRICE, ref],
        account: SERVICE, // gated view — the tool verifies from its own account
      }));
    if (!ok) {
      // Mirror the 402: tell the caller how to pay, then let it retry with a receiptId.
      return { error: "payment_required", scheme: "ghostrail-confidential", ledger: LEDGER, service: SERVICE, amount: PRICE.toString(), ref };
    }
    return handler(args);
  };
}
```

The agent pays with `payConfidential(...)` exactly as in `demo/agent.ts`, then re-invokes the tool with
the returned `receiptId`. No API keys, no accounts — just a confidential USDC micropayment per call.
