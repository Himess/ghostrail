// GhostRail SDK — server side. `requireConfidentialPayment` gates an Express route behind a confidential
// x402 payment: no receipt → 402 with the requirements; a receipt that verifies on-chain → next().

import type { Request, Response, NextFunction } from "express";
import type { Address, Hex, PublicClient } from "viem";
import { ledgerAbi } from "./abi.js";

export interface RequirePaymentOptions {
  publicClient: PublicClient;
  ledger: Address;
  service: Address; // the paid service's account (the server wallet's address)
  amount: bigint; // minimum required, 6-dec USDC
  ref: Hex; // bytes32 tag identifying this resource/invoice
  scheme?: string;
}

/**
 * Express middleware implementing the GhostRail confidential-402 handshake.
 *  - No `X-Payment-Receipt` header → HTTP 402 + JSON requirements.
 *  - With a header → read-call `verifyReceipt(receiptId, service, amount, ref)` FROM the service's
 *    account (so the ledger's owner-gated view authorizes it). Verified → next(); otherwise 402.
 */
export function requireConfidentialPayment(opts: RequirePaymentOptions) {
  const scheme = opts.scheme ?? "ghostrail-confidential";
  const requirements = {
    scheme,
    ledger: opts.ledger,
    service: opts.service,
    amount: opts.amount.toString(),
    ref: opts.ref,
  };

  return async function (req: Request, res: Response, next: NextFunction) {
    const receiptId = req.header("X-Payment-Receipt") as Hex | undefined;
    if (!receiptId) {
      res.status(402).json(requirements);
      return;
    }
    try {
      const ok = (await opts.publicClient.readContract({
        address: opts.ledger,
        abi: ledgerAbi,
        functionName: "verifyReceipt",
        args: [receiptId, opts.service, opts.amount, opts.ref],
        account: opts.service, // the service verifies from its own account (gated view)
      })) as boolean;
      if (ok) {
        next();
      } else {
        res.status(402).json({ ...requirements, error: "receipt did not verify" });
      }
    } catch (e) {
      res.status(402).json({ ...requirements, error: "receipt not found or not viewable" });
    }
  };
}
