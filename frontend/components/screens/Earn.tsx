"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { css, cssm } from "@/lib/css";
import { useToast } from "@/components/Toast";
import { TokenIcon, VenueLogo, CuratorChip } from "@/components/TokenIcon";
import { useNav } from "@/lib/nav";
import { useConfToken, useMarket, useBatchCountdown } from "@/lib/hooks";
import { useReveal, RevealNote, REVEAL_HELP } from "@/lib/useReveal";
import { DOTS, fmtUnits, toUnits, mmss, errMsg } from "@/lib/format";
import { assetMeta, ASSET_LIST, venueMeta, type AssetMeta, type VenueMeta } from "@/lib/markets";
import { EXPLORER, type Hex } from "@/lib/addresses";
import { ctokenAbi, routerAbi } from "@/lib/abis";
import { useActivity, marketKey, type ActivityRecord } from "@/lib/activity";
import { ActivityLog } from "@/components/ActivityLog";

// The honest framing for the whole screen: this is a preview of an Arc-mainnet deployment routing into the
// real Morpho / Aave venues. On testnet the venues are mocks.
const HONESTY =
  "Preview · simulating an Arc-mainnet deployment against Morpho/Aave · not affiliated with Morpho, Aave, or Steakhouse";

// One pending/executed batch entry for the connected user: claim shares / underlying, or cancel while open.
function BatchEntry({ asset, router, batchId, refresh, onActivity }: { asset: AssetMeta; router: Hex; batchId: bigint; refresh: () => void; onActivity: (rec: Omit<ActivityRecord, "ts">) => void }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const push = useToast();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const shareSym = `cs${asset.underlyingSymbol}`;

  const { data: shares } = useReadContract({ address: router, abi: routerAbi, functionName: "previewClaimShares", args: [batchId, address as Hex], account: address, query: { enabled: !!address, refetchInterval: 8000 } });
  const { data: cash } = useReadContract({ address: router, abi: routerAbi, functionName: "previewClaim", args: [batchId, address as Hex], account: address, query: { enabled: !!address, refetchInterval: 8000 } });
  const { data: result } = useReadContract({ address: router, abi: routerAbi, functionName: "batchResult", args: [batchId], query: { refetchInterval: 8000 } });

  const executed = ((result as readonly [boolean, number, bigint, bigint] | undefined)?.[0]) ?? false;
  const sh = (shares as bigint | undefined) ?? 0n;
  const cs = (cash as bigint | undefined) ?? 0n;

  async function tx(fn: "claimShares" | "claim" | "cancelDeposit" | "cancelWithdraw", ok: string) {
    setBusy(true);
    try {
      const h = await writeContractAsync({ address: router, abi: routerAbi, functionName: fn, args: fn.startsWith("cancel") ? [] : [batchId] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push(ok, "ok");
      const bid = batchId.toString();
      if (fn === "claimShares") onActivity({ action: "claimShares", amount: sh.toString(), asset: shareSym, txHash: h, batchId: bid });
      else if (fn === "claim") onActivity({ action: "claim", amount: fmtUnits(cs, asset.decimals), asset: asset.symbol, txHash: h, batchId: bid });
      else if (fn === "cancelDeposit") onActivity({ action: "cancelDeposit", amount: "", asset: asset.symbol, txHash: h, batchId: bid });
      else if (fn === "cancelWithdraw") onActivity({ action: "cancelWithdraw", amount: "", asset: shareSym, txHash: h, batchId: bid });
      refresh();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(false);
  }

  const btn = (label: string, on: () => void, dark = true) => {
    const base = dark ? { background: "var(--panel)", color: "#fff" } : { background: "var(--surface)", color: "var(--ink-2)", border: "1px solid var(--line)" };
    return <button onClick={on} disabled={busy} style={cssm("border:none;border-radius:999px;padding:8px 16px;font:700 12.5px var(--display);cursor:pointer", { ...base, ...(busy ? { opacity: 0.6, cursor: "wait" } : {}) })}>{label}</button>;
  };

  return (
    <div style={css("display:flex;align-items:center;gap:12px;padding:13px 4px;border-bottom:1px solid var(--line)")}>
      <span style={cssm(`width:9px;height:9px;border-radius:50%;flex:none;background:${executed ? "var(--green)" : "var(--amber)"}${executed ? "" : ";animation:beat 1.7s ease-in-out infinite"}`)} />
      <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}>
        <span style={css("font:700 13.5px var(--mono);color:var(--ink)")}>Batch #{batchId.toString()}</span>
        <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>{executed ? (sh > 0n ? `${sh.toString()} ${shareSym} shares ready` : cs > 0n ? `${fmtUnits(cs, asset.decimals)} ${asset.symbol} ready` : "settled") : "queued · awaiting execution"}</span>
      </div>
      {executed && sh > 0n && btn("Claim shares", () => tx("claimShares", "Shares claimed"))}
      {executed && cs > 0n && btn(`Claim ${asset.symbol}`, () => tx("claim", `${asset.symbol} claimed`))}
      {!executed && (<>
        {btn("Cancel deposit", () => tx("cancelDeposit", "Deposit cancelled · refunded"), false)}
        {btn("Cancel withdraw", () => tx("cancelWithdraw", "Withdrawal cancelled"), false)}
      </>)}
    </div>
  );
}

// Asset switcher (the confidential assets). Selecting one resets to its default venue and stays on Earn.
function AssetSwitcher({ current }: { current: string }) {
  const { openMarket } = useNav();
  return (
    <div style={css("display:flex;align-items:center;gap:7px;flex-wrap:wrap")}>
      {ASSET_LIST.map((m) => (
        <button
          key={m.symbol}
          onClick={() => openMarket(m.symbol)}
          style={cssm("display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;font:650 12px var(--display);cursor:pointer;border:1px solid var(--line)", m.symbol === current ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}
        >
          <TokenIcon token={m.symbol} size={16} />{m.symbol}
        </button>
      ))}
    </div>
  );
}

// Redacted per-venue user distribution — styled private. Individual rows are dotted; only the aggregate shows.
function RedactedDistribution({ asset, v }: { asset: AssetMeta; v: VenueMeta }) {
  const shareSym = `cs${asset.underlyingSymbol}`;
  return (
    <div style={css("background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px")}>
      <div style={css("display:flex;align-items:center;gap:8px")}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none")}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
        <span style={css("font:700 12px var(--display);color:var(--ink)")}>User distribution</span>
        <span style={css("font:650 9px var(--display);letter-spacing:.06em;text-transform:uppercase;color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:2px 7px")}>Private</span>
      </div>
      <span style={css("font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>Individual deposits hidden — only the aggregate is public.</span>
      <div style={css("display:flex;flex-direction:column")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={css("display:grid;grid-template-columns:1fr 96px 84px;gap:8px;align-items:center;padding:7px 2px;border-top:1px solid var(--line)")}>
            <span style={css("display:inline-flex;align-items:center;gap:8px")}>
              <span style={css("width:18px;height:18px;border-radius:50%;background:var(--line-2);flex:none")} />
              <span style={css("font:700 12px var(--mono);color:var(--ink-3);letter-spacing:.05em")}>0x••••</span>
            </span>
            <span style={css("text-align:right;font:700 12.5px var(--mono);color:var(--ink-3)")}>{DOTS}</span>
            <span style={css("text-align:right;font:600 11.5px var(--mono);color:var(--ink-3)")}>{DOTS} {shareSym}</span>
          </div>
        ))}
      </div>
      <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:8px;border-top:1px solid var(--line)")}>
        <span style={css("font:650 10.5px var(--display);letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3)")}>Aggregate (public)</span>
        <span style={css("font:800 15px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{v.tvl}</span>
      </div>
    </div>
  );
}

// Venue picker for the selected asset. Choosing a venue binds Deposit/Withdraw/claim to that venue's router.
function VenuePicker({ asset, selected, onSelect }: { asset: AssetMeta; selected: string; onSelect: (venueName: string) => void }) {
  const v = venueMeta(asset.symbol, selected);
  return (
    <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
      <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap")}>
        <span style={css("font:750 15px var(--display);color:var(--ink)")}>Choose a venue</span>
        <span style={css("font:400 11px var(--display);color:var(--ink-3)")}>each routes the same private position into a different public venue</span>
      </div>

      {/* venue tabs */}
      <div style={css("display:flex;gap:10px;flex-wrap:wrap")}>
        {asset.venues.map((ven) => {
          const active = ven.name === selected;
          return (
            <button
              key={ven.name}
              onClick={() => onSelect(ven.name)}
              style={cssm("flex:1;min-width:150px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;cursor:pointer;text-align:left;border:1px solid var(--line)", active ? { borderColor: "var(--panel)", background: "var(--surface-2)", boxShadow: "0 0 0 1px var(--panel)" } : { background: "var(--surface)" })}
            >
              <VenueLogo logoKey={ven.logoKey} size={26} />
              <div style={css("display:flex;flex-direction:column;min-width:0;flex:1")}>
                <span style={css("font:750 13.5px var(--display);color:var(--ink)")}>{ven.name}</span>
                <span style={css("font:600 11px var(--mono);color:var(--ink-3)")}>{ven.apy} APY</span>
              </div>
              {!ven.simulated
                ? <span style={css("width:8px;height:8px;border-radius:50%;background:var(--green);flex:none;animation:beat 1.7s ease-in-out infinite")} />
                : <span style={css("width:8px;height:8px;border-radius:50%;background:var(--amber);flex:none")} />}
            </button>
          );
        })}
      </div>

      {/* selected venue detail */}
      <div style={css("display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 14px;background:var(--surface-2);border:1px solid var(--line);border-radius:14px")}>
        <span style={css("display:inline-flex;align-items:baseline;gap:5px")}><span style={css("font:800 20px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{v.apy}</span><span style={css("font:650 9.5px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>Supply APY</span></span>
        <span style={css("width:1px;height:18px;background:var(--line)")} />
        <span style={css("display:inline-flex;align-items:baseline;gap:5px")}><span style={css("font:700 15px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{v.tvl}</span><span style={css("font:650 9.5px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>TVL</span></span>
        <div style={css("flex:1")} />
        {v.curator && <CuratorChip curator={v.curator} />}
        <a href={v.url} target="_blank" rel="noreferrer" style={css("display:inline-flex;align-items:center;gap:5px;font:600 11.5px var(--display);color:var(--ink-2);text-decoration:none")}>
          {v.name}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </a>
      </div>

      <RedactedDistribution asset={asset} v={v} />
    </div>
  );
}

export function Earn() {
  const { address, isConnected } = useAccount();
  const { selectedMarket, selectedVenue, setSelectedVenue, go } = useNav();
  const asset = assetMeta(selectedMarket);
  const venue = venueMeta(selectedMarket, selectedVenue);
  const pub = usePublicClient();
  const push = useToast();
  const conf = useConfToken(asset.cToken);
  const market = useMarket(venue); // binds all reads/writes to the SELECTED venue's router
  const cd = useBatchCountdown(venue.router); // §2.1 live countdown (shared hook)
  const activity = useActivity(marketKey(asset.symbol, venue.name)); // §2.3 client-side history for this market
  const r = useReveal(`${asset.symbol} · ${venue.name}`);
  const { writeContractAsync } = useWriteContract();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);

  const ROUTER = venue.router;
  const CTOKEN = asset.cToken;
  const dec = asset.decimals;
  const shareSym = `cs${asset.underlyingSymbol}`;

  // §2.2 position (positionOf, gated) — deposited / current value / earned.
  const position = market.position;
  const deposited = position?.deposited ?? null;
  const currentValue = position?.currentValue ?? null;
  const posShares = position?.shares ?? null;
  const earned = deposited != null && currentValue != null ? currentValue - deposited : null;
  const earnedColor = earned == null || earned === 0n ? "var(--ink)" : earned > 0n ? "var(--green)" : "var(--red)";
  const earnedText = earned == null ? "—" : `${earned > 0n ? "+" : earned < 0n ? "-" : ""}${fmtUnits(earned < 0n ? -earned : earned, dec)} ${asset.symbol}`;
  const earnedPct = earned != null && deposited != null && deposited > 0n ? (Number(earned) / Number(deposited)) * 100 : null;
  const earnedPctText = earnedPct == null ? "" : `${earnedPct > 0 ? "+" : earnedPct < 0 ? "-" : ""}${Math.abs(earnedPct).toFixed(2)}%`;

  function refreshAll() { market.refetch(); conf.refetch(); }

  async function submit() {
    if (!isConnected) return push("Connect your wallet first", "err");
    setBusy(true);
    try {
      if (tab === "deposit") {
        const units = toUnits(amt, dec);
        if (units <= 0n) throw new Error("Enter an amount");
        const isOp = (await pub!.readContract({ address: CTOKEN, abi: ctokenAbi, functionName: "isOperator", args: [address!, ROUTER] })) as boolean;
        if (!isOp) {
          const oh = await writeContractAsync({ address: CTOKEN, abi: ctokenAbi, functionName: "setOperator", args: [ROUTER, Math.floor(Date.now() / 1000) + 86400] });
          await pub!.waitForTransactionReceipt({ hash: oh });
        }
        const h = await writeContractAsync({ address: ROUTER, abi: routerAbi, functionName: "deposit", args: [units] });
        await pub!.waitForTransactionReceipt({ hash: h });
        push("Deposit queued · claim shares after the batch executes", "ok");
        activity.append({ action: "deposit", amount: amt, asset: asset.symbol, txHash: h, batchId: market.currentBatch.toString() });
      } else {
        const rawShares = amt.trim() === "" ? 0n : BigInt(amt.replace(/[^0-9]/g, "") || "0"); // shares are integers
        if (rawShares <= 0n) throw new Error("Enter a share amount");
        const h = await writeContractAsync({ address: ROUTER, abi: routerAbi, functionName: "requestWithdraw", args: [rawShares] });
        await pub!.waitForTransactionReceipt({ hash: h });
        push(`Withdrawal queued · claim ${asset.symbol} after the batch executes`, "ok");
        activity.append({ action: "requestWithdraw", amount: rawShares.toString(), asset: shareSym, txHash: h, batchId: market.currentBatch.toString() });
      }
      setAmt(""); refreshAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(false);
  }

  async function execute() {
    setBusy(true);
    try {
      const h = await writeContractAsync({ address: ROUTER, abi: routerAbi, functionName: "executeBatch", args: [] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push("Batch executed · net crossed to the venue", "ok"); refreshAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(false);
  }

  return (
    <div style={css("max-width:1080px;width:100%")}>
      {/* back to markets */}
      <button onClick={() => go("markets")} style={css("display:inline-flex;align-items:center;gap:7px;background:none;border:none;cursor:pointer;font:600 12.5px var(--display);color:var(--ink-2);padding:0 0 14px")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
        All markets
      </button>

      {/* header */}
      <div style={css("display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div style={css("display:flex;align-items:center;gap:15px")}>
          <TokenIcon token={asset.symbol} size={46} />
          <div>
            <div style={css("display:flex;align-items:center;gap:11px;flex-wrap:wrap")}>
              <h1 style={css("margin:0;font:800 34px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>{asset.label}</h1>
              {venue.simulated ? (
                <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:#fbf1dc;border:1px solid #f0d97a;color:#8a6d00;font:650 10.5px var(--display)")}>Preview · simulated</span>
              ) : (
                <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:700 10.5px var(--display)")}><span style={css("width:7px;height:7px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />LIVE</span>
              )}
            </div>
            <div style={css("display:flex;align-items:center;gap:10px;margin-top:7px;flex-wrap:wrap")}>
              <span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>{asset.symbol} · {asset.underlyingSymbol}</span>
              <span style={css("color:var(--ink-3)")}>·</span>
              <a href={venue.url} target="_blank" rel="noreferrer" style={css("display:inline-flex;align-items:center;gap:6px;font:600 13px var(--display);color:var(--ink-2);text-decoration:none")}><VenueLogo logoKey={venue.logoKey} size={17} />via {venue.name}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg></a>
              <span style={css("color:var(--ink-3)")}>·</span>
              <span style={css("font:700 13px var(--display);color:var(--ink)")}>{venue.apy} APY</span>
            </div>
          </div>
        </div>
        <AssetSwitcher current={asset.symbol} />
      </div>

      <div style={cssm("border-radius:12px;padding:10px 14px;margin-top:16px;font:400 12px/1.5 var(--display)", venue.simulated ? { background: "#fbf1dc", border: "1px solid #f0d97a", color: "#6b5a2a" } : { background: "var(--green-bg)", border: "1px solid #bfe3cf", color: "#1c6b47" })}>
        {venue.simulated
          ? <>{HONESTY}. A mock {asset.underlyingSymbol} underlying + mock {venue.name}-style venue on Arc testnet. Use the Faucet to mint test {asset.underlyingSymbol}, then shield &amp; deposit. The protocol logic (batching, netting, shares, solvency) is real.</>
          : <>Live market — wraps <b style={css("font-weight:700")}>real</b> Arc testnet USDC, routing into {venue.name}. Deposits pool into a single confidential position; only the batch net crosses to the venue.</>}
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 24px")} />

      {/* venue picker */}
      <VenuePicker asset={asset} selected={selectedVenue} onSelect={setSelectedVenue} />

      {/* metrics — Market TVL + your position (positionOf, behind Sign-to-reveal) */}
      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:16px")}>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:8px")}><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Market TVL</span><span style={css("font:800 28px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{fmtUnits(market.totalAssets, dec, { compact: true })} <span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>{asset.symbol}</span></span></div>

        {/* §2.2 Your position — deposited / current value / earned, gated by Sign-to-reveal */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:13px")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px")}>
            <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Your position</span>
            <button onClick={r.toggle} disabled={r.signing} style={cssm("font:650 10.5px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:3px 9px;cursor:pointer", r.signing ? { opacity: 0.6, cursor: "wait" } : undefined)}>{r.label}</button>
          </div>
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px")}>
            <div style={css("display:flex;flex-direction:column;gap:3px")}>
              <span style={css("font:600 10px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>Deposited</span>
              <span style={css("font:800 21px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{r.revealed ? (deposited != null ? fmtUnits(deposited, dec) : "—") : DOTS}</span>
            </div>
            <div style={css("display:flex;flex-direction:column;gap:3px")}>
              <span style={css("font:600 10px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>Current value</span>
              <span style={css("font:800 21px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{r.revealed ? (currentValue != null ? fmtUnits(currentValue, dec) : "—") : DOTS}</span>
            </div>
            <div style={css("display:flex;flex-direction:column;gap:3px")}>
              <span style={css("font:600 10px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>Earned</span>
              <span style={cssm("font:800 21px var(--mono);font-variant-numeric:tabular-nums", { color: earnedColor })}>{r.revealed ? earnedText : DOTS}</span>
              {r.revealed && earnedPctText && <span style={cssm("font:600 11px var(--mono)", { color: earnedColor })}>{earnedPctText}</span>}
            </div>
          </div>
          <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>Your shares: <b style={css("font-weight:700;font-family:var(--mono);color:var(--ink-2)")}>{r.revealed ? (posShares != null ? posShares.toString() : "—") : DOTS}</b> {shareSym}</span>
          {market.pendingBatches.length > 0 && (
            <button onClick={() => { if (typeof document !== "undefined") document.getElementById("your-batches")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={css("align-self:flex-start;font:600 11.5px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:5px 11px;cursor:pointer;text-align:left")}>
              + {market.pendingBatches.length} pending batch{market.pendingBatches.length > 1 ? "es" : ""} — claim to add them to your position
            </button>
          )}
          {r.revealed
            ? <span style={css("font:400 10.5px/1.45 var(--display);color:var(--ink-3)")}>{REVEAL_HELP} positionOf counts only claimed shares — pending batches are listed separately.</span>
            : <RevealNote r={r} />}
        </div>
      </div>

      {/* batch banner — §2.1 live countdown + progress + §2.4 honesty label */}
      <div style={css("background:var(--accent-soft);border:1px solid #f0d97a;border-radius:16px;padding:14px 18px;margin-top:16px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap")}>
          <span style={css("display:inline-flex;align-items:center;gap:10px;font:600 13px var(--display);color:#6b5a2a")}>
            <span style={css("width:9px;height:9px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />
            {cd.windowClosed
              ? `Batch #${market.currentBatch.toString()} · window closed — ready to execute`
              : <>Batch #{market.currentBatch.toString()} open · executes in <b style={css("font-weight:800;font-family:var(--mono)")}>{mmss(cd.remaining)}</b></>}
          </span>
          <button onClick={execute} disabled={busy || !cd.windowClosed} style={cssm("border:none;border-radius:999px;padding:9px 18px;font:700 12.5px var(--display);cursor:pointer;background:var(--panel);color:#fff", (busy || !cd.windowClosed) ? { opacity: 0.5, cursor: "not-allowed" } : undefined)}>Execute batch</button>
        </div>
        {!cd.windowClosed && (
          <div style={css("height:5px;border-radius:999px;background:#f0e3bd;overflow:hidden")}>
            <div style={cssm("height:100%;border-radius:999px;background:var(--amber);transition:width 1s linear", { width: `${Math.round(cd.progress * 100)}%` })} />
          </div>
        )}
        <span style={css("font:400 11px/1.5 var(--display);color:#6b5a2a")}>60s window on this preview · production targets ~12–24h, so each batch nets enough participants for a meaningful anonymity set.</span>
      </div>

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px")}>
        {/* deposit / withdraw */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;gap:8px;margin-bottom:16px")}>
            {(["deposit", "withdraw"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setAmt(""); }} style={cssm("padding:8px 16px;border-radius:999px;font:650 13px var(--display);cursor:pointer;border:1px solid var(--line)", tab === t ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>{t === "deposit" ? "Deposit" : "Withdraw"}</button>
            ))}
            <div style={css("flex:1")} />
            <span style={css("display:inline-flex;align-items:center;gap:6px;font:600 11.5px var(--display);color:var(--ink-3)")}><VenueLogo logoKey={venue.logoKey} size={15} />routing via {venue.name}</span>
          </div>
          <div style={css("display:flex;align-items:center;gap:9px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:12px 14px;margin-bottom:6px")}>
            <TokenIcon token={tab === "deposit" ? asset.symbol : shareSym} size={26} />
            <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder={tab === "deposit" ? "0.0" : "shares"} style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 20px var(--mono);color:var(--ink)")} />
            <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{tab === "deposit" ? asset.symbol : shareSym}</span>
          </div>
          <div style={css("font:400 11.5px var(--display);color:var(--ink-3);margin:2px 2px 14px")}>{tab === "deposit" ? `Private ${asset.symbol} balance: ${fmtUnits(conf.myBalance, dec)}` : `Your shares: ${market.myShares != null ? market.myShares.toString() : "—"}`}</div>
          <button onClick={submit} disabled={busy} style={cssm("width:100%;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:13px;padding:13px;font:700 14.5px var(--display);cursor:pointer", busy ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy ? "Submitting…" : tab === "deposit" ? "Queue confidential deposit" : "Request confidential withdrawal"}</button>
          <p style={css("margin:12px 2px 0;font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>Queued into the open batch. When the window closes, anyone can execute it; then you pull your {tab === "deposit" ? "shares" : asset.symbol} below. Cancel any time before it executes.</p>
        </div>

        {/* claimable / pending */}
        <div id="your-batches" style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:8px")}><span style={css("font:750 15px var(--display);color:var(--ink)")}>Your batches</span><span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>pull shares / {asset.symbol}</span></div>
          {!isConnected ? (
            <div style={css("padding:26px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>Connect your wallet to see your batches.</div>
          ) : market.pendingBatches.length === 0 ? (
            <div style={css("padding:26px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>No pending batches. Deposit or withdraw to get started.</div>
          ) : (
            market.pendingBatches.map((b) => <BatchEntry key={b.toString()} asset={asset} router={ROUTER} batchId={b} refresh={refreshAll} onActivity={activity.append} />)
          )}
        </div>
      </div>

      {/* §2.3 Activity log — client-side, honest (amounts never on-chain) */}
      <ActivityLog items={activity.items} onClear={activity.clear} />

      <p style={css("margin:18px 2px 0;font:400 11.5px/1.55 var(--display);color:var(--ink-3)")}>
        {HONESTY}. Confidential vault routing into an existing public lending venue (a mock venue on testnet); not for real funds pre-audit. <a href={`${EXPLORER}/address/${ROUTER}`} target="_blank" rel="noreferrer" style={css("color:#8a6d00;text-decoration:none;font-weight:600")}>Router on Arcscan →</a>
      </p>
    </div>
  );
}
