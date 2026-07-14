"use client";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { ctokenAbi, ledgerAbi, routerAbi } from "./abis";
import { ASSETS, LEDGER, type Hex, type VenueAddrs } from "./addresses";

// All reads are plain eth_calls. "Gated" reads (a value only the owner/viewer may read) are issued with the
// connected wallet as `account`, so on-chain msg.sender is the honest owner — the same path the app documents.
// The dots→value reveal is gated in the screens by an EIP-712 ownership signature (see lib/useReveal); nothing
// here decrypts.
//
// The data layer is parameterized by (asset, venue): every hook that touches a router/cToken takes the address.
// A cToken is per ASSET (shielded wrapper), a router is per (asset, VENUE) — Morpho / Aave each have their own.

const LEDGER_C = { address: LEDGER, abi: ledgerAbi } as const;

// The markets were deployed together at this Arc block — bound event scans so getLogs stays cheap.
const FROM_BLOCK = 51515772n;

// ---- shared 1s clock for the batch / withdraw countdowns ----
export function useNowSec(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

// ---- Confidential token (the shielded wrapper over a market's underlying) ----
// Pass the market's cToken address. `myBalance` is gated (issued with the connected wallet as account).
export function useConfToken(cTokenAddr: Hex) {
  const { address } = useAccount();
  const token = { address: cTokenAddr, abi: ctokenAbi } as const;
  const { data: totalShielded, refetch: refetchTotal } = useReadContract({
    ...token, functionName: "totalShielded", query: { refetchInterval: 15000 },
  });
  const { data: myBalance, refetch: refetchBal } = useReadContract({
    ...token, functionName: "confidentialBalanceOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 15000 },
  });
  return {
    totalShielded: (totalShielded as bigint | undefined) ?? null,
    myBalance: (myBalance as bigint | undefined) ?? null,
    refetch: () => { refetchTotal(); refetchBal(); },
  };
}

// ---- Confidential Payment Ledger (secondary payments module — binds to LEDGER + the USDC cToken) ----
export function useLedger() {
  const { address } = useAccount();
  const { data: totalLedgerBalance, refetch: refetchTotal } = useReadContract({
    ...LEDGER_C, functionName: "totalLedgerBalance", query: { refetchInterval: 15000 },
  });
  const { data: solvency } = useReadContract({
    ...LEDGER_C, functionName: "checkSolvency", query: { refetchInterval: 20000 },
  });
  const { data: myBalance, refetch: refetchBal } = useReadContract({
    ...LEDGER_C, functionName: "balanceOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 12000 },
  });
  const { data: pending, refetch: refetchPending } = useReadContract({
    ...LEDGER_C, functionName: "pendingWithdrawOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 8000 },
  });
  const sol = solvency as readonly [bigint, bigint] | undefined;
  const pend = pending as readonly [bigint, bigint] | undefined;
  return {
    totalLedgerBalance: (totalLedgerBalance as bigint | undefined) ?? null,
    solvency: sol ? { internalSum: sol[0], backing: sol[1] } : null,
    myBalance: (myBalance as bigint | undefined) ?? null,
    pendingWithdraw: pend ? { amount: pend[0], claimableAt: Number(pend[1]) } : null,
    refetch: () => { refetchTotal(); refetchBal(); refetchPending(); },
  };
}

// ---- Confidential Vault Router for ONE (asset, venue) market (pull-based) ----
// Pass a venue (VenueAddrs / VenueMeta) — this reads its router.
export function useMarket(m: VenueAddrs) {
  const { address } = useAccount();
  const router = { address: m.router, abi: routerAbi } as const;
  const { data: agg, refetch: refetchAgg } = useReadContracts({
    contracts: [
      { ...router, functionName: "totalShares" },
      { ...router, functionName: "totalAssets" },
      { ...router, functionName: "checkSolvency" },
      { ...router, functionName: "currentBatch" },
      { ...router, functionName: "batchOpenedAt" },
      { ...router, functionName: "batchWindow" },
    ],
    query: { refetchInterval: 10000 },
  });
  const totalShares = (agg?.[0]?.result as bigint | undefined) ?? 0n;
  const totalAssets = (agg?.[1]?.result as bigint | undefined) ?? 0n;
  const solvency = agg?.[2]?.result as readonly [bigint, bigint] | undefined;
  const currentBatch = (agg?.[3]?.result as bigint | undefined) ?? 0n;
  const batchOpenedAt = Number((agg?.[4]?.result as bigint | undefined) ?? 0n);
  const batchWindow = Number((agg?.[5]?.result as bigint | undefined) ?? 0n);

  const { data: myShares, refetch: refetchShares } = useReadContract({
    ...router, functionName: "sharesOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 12000 },
  });
  const { data: myClaimable, refetch: refetchClaimable } = useReadContract({
    ...router, functionName: "claimableOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 10000 },
  });
  const { data: pendingBatches, refetch: refetchPending } = useReadContract({
    ...router, functionName: "pendingBatchesOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 10000 },
  });

  const shares = (myShares as bigint | undefined) ?? null;
  // Share price (6-dec ratio) + position value derived from the public aggregates with the router's virtual
  // offset (VS=1e3, VA=1) — no reverting previewRedeem call on an empty vault.
  const sharePrice6 = totalShares > 0n ? (totalAssets * 1_000_000n) / totalShares : 1_000_000n;
  const positionValue = shares != null ? (shares * (totalAssets + 1n)) / (totalShares + 1000n) : null;

  return {
    market: m,
    totalShares, totalAssets,
    solvency: solvency ? { totalSharesPublic: solvency[0], backingAssets: solvency[1] } : null,
    currentBatch, batchOpenedAt, batchWindow, sharePrice6,
    myShares: shares,
    myClaimable: (myClaimable as bigint | undefined) ?? null,
    pendingBatches: ((pendingBatches as readonly bigint[] | undefined) ?? []) as readonly bigint[],
    positionValue,
    // dispatchableIn = max(0, batchOpenedAt + batchWindow − now); callers pass their ticking clock.
    dispatchableInAt: (now: number) => Math.max(0, batchOpenedAt + batchWindow - now),
    refetch: () => { refetchAgg(); refetchShares(); refetchClaimable(); refetchPending(); },
  };
}

// ---- Every asset at once (Markets grid / Dashboard / Status), keyed by asset symbol ----
// Asset-level aggregate = the asset's primary (live) venue router, venues[0] (Morpho). One batch call.
export type MarketAgg = { totalAssets: bigint; totalShares: bigint };
export function useAllMarkets(): { bySymbol: Record<string, MarketAgg>; refetch: () => void } {
  const { data, refetch } = useReadContracts({
    contracts: ASSETS.flatMap((a) => [
      { address: a.venues[0].router, abi: routerAbi, functionName: "totalAssets" } as const,
      { address: a.venues[0].router, abi: routerAbi, functionName: "totalShares" } as const,
    ]),
    query: { refetchInterval: 15000 },
  });
  const bySymbol: Record<string, MarketAgg> = {};
  ASSETS.forEach((a, i) => {
    bySymbol[a.symbol] = {
      totalAssets: (data?.[i * 2]?.result as bigint | undefined) ?? 0n,
      totalShares: (data?.[i * 2 + 1]?.result as bigint | undefined) ?? 0n,
    };
  });
  return { bySymbol, refetch: () => { refetch(); } };
}

// ---- recent BatchExecuted logs for ONE market router (GhostGate live table) ----
export type BatchRow = {
  batchId: bigint;
  netDirection: number; // +1 deposit-heavy, -1 withdraw-heavy, 0 balanced
  netAmount: bigint;
  sharePrice: bigint;
  blockNumber: bigint;
};

export function useBatchEvents(routerAddr: Hex) {
  const client = usePublicClient();
  const [rows, setRows] = useState<BatchRow[]>([]);
  useEffect(() => {
    if (!client) return;
    let stop = false;
    setRows([]); // clear when the market changes
    const load = async () => {
      const scan = async (fromBlock: bigint) =>
        client.getContractEvents({ address: routerAddr, abi: routerAbi, eventName: "BatchExecuted", fromBlock, toBlock: "latest" });
      try {
        let logs;
        try {
          logs = await scan(FROM_BLOCK);
        } catch {
          // RPC block-range limit fallback — scan a recent window only.
          const latest = await client.getBlockNumber();
          logs = await scan(latest > 9000n ? latest - 9000n : 0n);
        }
        if (stop) return;
        const parsed: BatchRow[] = logs
          .map((l) => {
            const a = (l as any).args ?? {};
            return {
              batchId: a.batchId as bigint,
              netDirection: Number(a.netDirection ?? 0),
              netAmount: (a.netAmount as bigint) ?? 0n,
              sharePrice: (a.sharePrice as bigint) ?? 0n,
              blockNumber: (l.blockNumber as bigint) ?? 0n,
            };
          })
          .filter((r) => r.batchId != null)
          .sort((x, y) => (y.batchId > x.batchId ? 1 : y.batchId < x.batchId ? -1 : 0));
        setRows(parsed);
      } catch {
        /* leave rows as-is; the table renders its empty state */
      }
    };
    load();
    const iv = setInterval(load, 12000);
    return () => { stop = true; clearInterval(iv); };
  }, [client, routerAddr]);
  return rows;
}
