"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { css, cssm } from "@/lib/css";
import { useToast } from "@/components/Toast";
import { TokenIcon } from "@/components/TokenIcon";
import { useNav } from "@/lib/nav";
import { useConfToken, useMarket, useNowSec } from "@/lib/hooks";
import { DOTS, fmtUnits, toUnits, mmss, errMsg } from "@/lib/format";
import { marketMeta, MARKET_LIST, type MarketMeta } from "@/lib/markets";
import { EXPLORER } from "@/lib/addresses";
import { ctokenAbi, routerAbi } from "@/lib/abis";

// One pending/executed batch entry for the connected user: claim shares / underlying, or cancel while open.
function BatchEntry({ meta, batchId, refresh }: { meta: MarketMeta; batchId: bigint; refresh: () => void }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const push = useToast();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const ROUTER = meta.router;
  const shareSym = `cs${meta.underlyingSymbol}`;

  const { data: shares } = useReadContract({ address: ROUTER, abi: routerAbi, functionName: "previewClaimShares", args: [batchId, address as `0x${string}`], account: address, query: { enabled: !!address, refetchInterval: 8000 } });
  const { data: cash } = useReadContract({ address: ROUTER, abi: routerAbi, functionName: "previewClaim", args: [batchId, address as `0x${string}`], account: address, query: { enabled: !!address, refetchInterval: 8000 } });
  const { data: result } = useReadContract({ address: ROUTER, abi: routerAbi, functionName: "batchResult", args: [batchId], query: { refetchInterval: 8000 } });

  const executed = ((result as readonly [boolean, number, bigint, bigint] | undefined)?.[0]) ?? false;
  const sh = (shares as bigint | undefined) ?? 0n;
  const cs = (cash as bigint | undefined) ?? 0n;

  async function tx(fn: "claimShares" | "claim" | "cancelDeposit" | "cancelWithdraw", ok: string) {
    setBusy(true);
    try {
      const h = await writeContractAsync({ address: ROUTER, abi: routerAbi, functionName: fn, args: fn.startsWith("cancel") ? [] : [batchId] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push(ok, "ok"); refresh();
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
        <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>{executed ? (sh > 0n ? `${sh.toString()} ${shareSym} shares ready` : cs > 0n ? `${fmtUnits(cs, meta.decimals)} ${meta.symbol} ready` : "settled") : "queued · awaiting execution"}</span>
      </div>
      {executed && sh > 0n && btn("Claim shares", () => tx("claimShares", "Shares claimed"))}
      {executed && cs > 0n && btn(`Claim ${meta.symbol}`, () => tx("claim", `${meta.symbol} claimed`))}
      {!executed && (<>
        {btn("Cancel deposit", () => tx("cancelDeposit", "Deposit cancelled · refunded"), false)}
        {btn("Cancel withdraw", () => tx("cancelWithdraw", "Withdrawal cancelled"), false)}
      </>)}
    </div>
  );
}

function MarketSwitcher({ current }: { current: string }) {
  const { openMarket } = useNav();
  return (
    <div style={css("display:flex;align-items:center;gap:7px;flex-wrap:wrap")}>
      {MARKET_LIST.map((m) => (
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

export function Earn() {
  const { address, isConnected } = useAccount();
  const { selectedMarket, go } = useNav();
  const meta = marketMeta(selectedMarket);
  const pub = usePublicClient();
  const push = useToast();
  const conf = useConfToken(meta.cToken);
  const market = useMarket(meta);
  const now = useNowSec();
  const { writeContractAsync } = useWriteContract();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amt, setAmt] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const ROUTER = meta.router;
  const CTOKEN = meta.cToken;
  const dec = meta.decimals;
  const shareSym = `cs${meta.underlyingSymbol}`;
  const dispatchIn = market.dispatchableInAt(now);
  const canExecute = dispatchIn <= 0;

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
      } else {
        const rawShares = amt.trim() === "" ? 0n : BigInt(amt.replace(/[^0-9]/g, "") || "0"); // shares are integers
        if (rawShares <= 0n) throw new Error("Enter a share amount");
        const h = await writeContractAsync({ address: ROUTER, abi: routerAbi, functionName: "requestWithdraw", args: [rawShares] });
        await pub!.waitForTransactionReceipt({ hash: h });
        push(`Withdrawal queued · claim ${meta.symbol} after the batch executes`, "ok");
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
          <TokenIcon token={meta.symbol} size={46} />
          <div>
            <div style={css("display:flex;align-items:center;gap:11px;flex-wrap:wrap")}>
              <h1 style={css("margin:0;font:800 34px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>{meta.label}</h1>
              {meta.simulated ? (
                <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:#fbf1dc;border:1px solid #f0d97a;color:#8a6d00;font:650 10.5px var(--display)")}>Preview · simulated</span>
              ) : (
                <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:700 10.5px var(--display)")}><span style={css("width:7px;height:7px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />LIVE</span>
              )}
            </div>
            <div style={css("display:flex;align-items:center;gap:10px;margin-top:7px;flex-wrap:wrap")}>
              <span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>{meta.symbol} · {meta.underlyingSymbol}</span>
              <span style={css("color:var(--ink-3)")}>·</span>
              <a href={meta.venueUrl} target="_blank" rel="noreferrer" style={css("display:inline-flex;align-items:center;gap:5px;font:600 13px var(--display);color:var(--ink-2);text-decoration:none")}>via {meta.venueName}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg></a>
              <span style={css("color:var(--ink-3)")}>·</span>
              <span style={css("font:700 13px var(--display);color:var(--ink)")}>{meta.apy} APY</span>
            </div>
          </div>
        </div>
        <MarketSwitcher current={meta.symbol} />
      </div>

      <div style={cssm("border-radius:12px;padding:10px 14px;margin-top:16px;font:400 12px/1.5 var(--display)", meta.simulated ? { background: "#fbf1dc", border: "1px solid #f0d97a", color: "#6b5a2a" } : { background: "var(--green-bg)", border: "1px solid #bfe3cf", color: "#1c6b47" })}>
        {meta.simulated
          ? <>Simulated market — a mock {meta.underlyingSymbol} underlying + mock {meta.venueName}-style venue on Arc testnet. Use the Faucet to mint test {meta.underlyingSymbol}, then shield &amp; deposit. The protocol logic (batching, netting, shares, solvency) is real.</>
          : <>Live market — wraps <b style={css("font-weight:700")}>real</b> Arc testnet USDC. Deposits pool into a single confidential position; only the batch net crosses to the venue.</>}
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 24px")} />

      {/* metrics */}
      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px")}>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:8px")}><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Market TVL</span><span style={css("font:800 28px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{fmtUnits(market.totalAssets, dec, { compact: true })} <span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>{meta.symbol}</span></span></div>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:8px")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between")}><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Your position</span><button onClick={() => setReveal((r) => !r)} style={css("font:650 10.5px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:3px 9px;cursor:pointer")}>{reveal ? "Hide" : "Reveal"}</button></div>
          <span style={css("font:800 28px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{reveal ? (market.positionValue != null ? fmtUnits(market.positionValue, dec) : "—") : DOTS} <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{meta.symbol}</span></span>
        </div>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:8px")}><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Your shares</span><span style={css("font:800 28px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{reveal ? (market.myShares != null ? market.myShares.toString() : "—") : DOTS} <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{shareSym}</span></span></div>
      </div>

      {/* batch banner */}
      <div style={css("display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:var(--accent-soft);border:1px solid #f0d97a;border-radius:16px;padding:14px 18px;margin-top:16px")}>
        <span style={css("display:inline-flex;align-items:center;gap:10px;font:600 13px var(--display);color:#6b5a2a")}><span style={css("width:9px;height:9px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />Batch #{market.currentBatch.toString()} open · {canExecute ? "window closed — ready to execute" : `dispatch in ${mmss(dispatchIn)}`}</span>
        <button onClick={execute} disabled={busy || !canExecute} style={cssm("border:none;border-radius:999px;padding:9px 18px;font:700 12.5px var(--display);cursor:pointer;background:var(--panel);color:#fff", (busy || !canExecute) ? { opacity: 0.5, cursor: "not-allowed" } : undefined)}>Execute batch</button>
      </div>

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px")}>
        {/* deposit / withdraw */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;gap:8px;margin-bottom:16px")}>
            {(["deposit", "withdraw"] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setAmt(""); }} style={cssm("padding:8px 16px;border-radius:999px;font:650 13px var(--display);cursor:pointer;border:1px solid var(--line)", tab === t ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>{t === "deposit" ? "Deposit" : "Withdraw"}</button>
            ))}
          </div>
          <div style={css("display:flex;align-items:center;gap:9px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:12px 14px;margin-bottom:6px")}>
            <TokenIcon token={tab === "deposit" ? meta.symbol : shareSym} size={26} />
            <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder={tab === "deposit" ? "0.0" : "shares"} style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 20px var(--mono);color:var(--ink)")} />
            <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{tab === "deposit" ? meta.symbol : shareSym}</span>
          </div>
          <div style={css("font:400 11.5px var(--display);color:var(--ink-3);margin:2px 2px 14px")}>{tab === "deposit" ? `Private ${meta.symbol} balance: ${fmtUnits(conf.myBalance, dec)}` : `Your shares: ${market.myShares != null ? market.myShares.toString() : "—"}`}</div>
          <button onClick={submit} disabled={busy} style={cssm("width:100%;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:13px;padding:13px;font:700 14.5px var(--display);cursor:pointer", busy ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy ? "Submitting…" : tab === "deposit" ? "Queue confidential deposit" : "Request confidential withdrawal"}</button>
          <p style={css("margin:12px 2px 0;font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>Queued into the open batch. When the window closes, anyone can execute it; then you pull your {tab === "deposit" ? "shares" : meta.symbol} below. Cancel any time before it executes.</p>
        </div>

        {/* claimable / pending */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:8px")}><span style={css("font:750 15px var(--display);color:var(--ink)")}>Your batches</span><span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>pull shares / {meta.symbol}</span></div>
          {!isConnected ? (
            <div style={css("padding:26px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>Connect your wallet to see your batches.</div>
          ) : market.pendingBatches.length === 0 ? (
            <div style={css("padding:26px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>No pending batches. Deposit or withdraw to get started.</div>
          ) : (
            market.pendingBatches.map((b) => <BatchEntry key={b.toString()} meta={meta} batchId={b} refresh={refreshAll} />)
          )}
        </div>
      </div>

      <p style={css("margin:18px 2px 0;font:400 11.5px/1.55 var(--display);color:var(--ink-3)")}>
        Confidential vault routing into an existing public lending venue ({meta.simulated ? "a mock here" : "a mock venue on testnet"}). Not affiliated with {meta.venueName}; not for real funds pre-audit. <a href={`${EXPLORER}/address/${ROUTER}`} target="_blank" rel="noreferrer" style={css("color:#8a6d00;text-decoration:none;font-weight:600")}>Router on Arcscan →</a>
      </p>
    </div>
  );
}
