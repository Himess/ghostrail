"use client";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

// §2.3 Activity log — client-side, HONEST by design.
// GhostRail's contracts deliberately emit amount-free events (that's the privacy design), so a
// miktar-carrying history can't be reconstructed from chain. This is the correct pattern for a confidential
// system, not a workaround: we keep the user's own records locally, keyed by chainId + account + market.
// Under APS the enclave would return this history to the owner's view key.

export type ActivityAction =
  | "shield"
  | "unshield"
  | "deposit"
  | "cancelDeposit"
  | "claimShares"
  | "requestWithdraw"
  | "cancelWithdraw"
  | "claim"
  | "bridge";

export type ActivityRecord = {
  ts: number; // epoch ms
  action: ActivityAction;
  amount: string; // human-readable amount (already formatted); "" when not meaningful (e.g. a cancel)
  asset: string; // unit label, e.g. "cUSDC" / "csUSDC" / "USDC"
  txHash?: string;
  batchId?: string;
};

// The market key mirrors the (asset, venue) binding of the Earn screen — e.g. "cUSDC-Morpho".
export const marketKey = (assetSymbol: string, venueName: string) => `${assetSymbol}-${venueName}`;

// Label + flow direction (drives the small icon in the log).
export const ACTION_META: Record<ActivityAction, { label: string; flow: "in" | "out" | "cancel" }> = {
  shield: { label: "Shield", flow: "in" },
  unshield: { label: "Unshield", flow: "out" },
  deposit: { label: "Deposit", flow: "in" },
  cancelDeposit: { label: "Cancel deposit", flow: "cancel" },
  claimShares: { label: "Claim shares", flow: "in" },
  requestWithdraw: { label: "Request withdraw", flow: "out" },
  cancelWithdraw: { label: "Cancel withdraw", flow: "cancel" },
  claim: { label: "Claim", flow: "out" },
  bridge: { label: "Bridge in", flow: "in" },
};

const PREFIX = "ghostrail:activity";
const MAX = 200; // cap stored records per market so localStorage can't grow unbounded

// Fallback store for when localStorage is unavailable (private mode / SSR) — never crash, degrade silently.
const mem = new Map<string, ActivityRecord[]>();

function storageKey(chainId: number, account: string, market: string): string {
  return `${PREFIX}:${chainId}:${account.toLowerCase()}:${market}`;
}

function readStore(key: string): ActivityRecord[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (raw) return JSON.parse(raw) as ActivityRecord[];
  } catch {
    /* fall through to the in-memory mirror */
  }
  return mem.get(key) ?? [];
}

function writeStore(key: string, items: ActivityRecord[]): void {
  mem.set(key, items); // always keep an in-memory mirror
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    /* private mode — the memory mirror already holds it */
  }
}

export function loadActivity(chainId: number, account: string, market: string): ActivityRecord[] {
  return readStore(storageKey(chainId, account, market));
}

export function appendActivity(
  chainId: number,
  account: string,
  market: string,
  rec: Omit<ActivityRecord, "ts"> & { ts?: number },
): ActivityRecord[] {
  const key = storageKey(chainId, account, market);
  const full: ActivityRecord = {
    ts: rec.ts ?? Date.now(),
    action: rec.action,
    amount: rec.amount,
    asset: rec.asset,
    txHash: rec.txHash,
    batchId: rec.batchId,
  };
  const next = [full, ...readStore(key)].slice(0, MAX); // newest first
  writeStore(key, next);
  return next;
}

export function clearActivity(chainId: number, account: string, market: string): void {
  const key = storageKey(chainId, account, market);
  mem.delete(key);
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

// Reactive wrapper: load once per (account, chain, market); append/clear update local state AND persist.
export function useActivity(market: string) {
  const { address, chainId } = useAccount();
  const [items, setItems] = useState<ActivityRecord[]>([]);
  useEffect(() => {
    if (!address || !chainId) {
      setItems([]);
      return;
    }
    setItems(loadActivity(chainId, address, market));
  }, [address, chainId, market]);
  const append = useCallback(
    (rec: Omit<ActivityRecord, "ts">) => {
      if (!address || !chainId) return;
      setItems(appendActivity(chainId, address, market, rec));
    },
    [address, chainId, market],
  );
  const clear = useCallback(() => {
    if (!address || !chainId) return;
    clearActivity(chainId, address, market);
    setItems([]);
  }, [address, chainId, market]);
  return { items, append, clear };
}
