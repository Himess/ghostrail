"use client";
import { useState } from "react";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { css, cssm } from "@/lib/css";
import { useToast } from "@/components/Toast";
import { TokenIcon } from "@/components/TokenIcon";
import { useNav } from "@/lib/nav";
import { useConfToken } from "@/lib/hooks";
import { useReveal, RevealNote } from "@/lib/useReveal";
import { DOTS, fmtUnits, toUnits, errMsg } from "@/lib/format";
import { assetMeta, ASSET_LIST, type AssetMeta } from "@/lib/markets";
import { type Hex } from "@/lib/addresses";
import { ctokenAbi, routerAbi, erc20Abi } from "@/lib/abis";

function Row({ token, name, sub, value, mono = true }: { token: string; name: string; sub: string; value: string; mono?: boolean }) {
  return (
    <div style={css("display:flex;align-items:center;gap:13px;padding:14px 4px;border-bottom:1px solid var(--line)")}>
      <TokenIcon token={token} size={34} />
      <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}>
        <span style={css("font:650 14.5px var(--display);color:var(--ink)")}>{name}</span>
        <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>{sub}</span>
      </div>
      <span style={cssm(`font:${mono ? "700 16px var(--mono)" : "700 16px var(--display)"};color:var(--ink);font-variant-numeric:tabular-nums`)}>{value}</span>
    </div>
  );
}

// One row of the all-markets confidential balances list — each calls its own gated reads.
// Shares are read from the asset's primary (live) venue router.
function AssetConfRow({ m, reveal }: { m: AssetMeta; reveal: boolean }) {
  const { address } = useAccount();
  const conf = useConfToken(m.cToken);
  const { data: shares } = useReadContract({
    address: m.venues[0].router, abi: routerAbi, functionName: "sharesOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 15000 },
  });
  const sh = shares as bigint | undefined;
  return (
    <div style={css("display:grid;grid-template-columns:1fr 130px 110px;gap:8px;padding:12px 4px;border-bottom:1px solid var(--line);align-items:center")}>
      <span style={css("display:inline-flex;align-items:center;gap:10px;font:650 13.5px var(--display);color:var(--ink)")}><TokenIcon token={m.symbol} size={24} />{m.symbol}</span>
      <span style={css("text-align:right;font:700 13.5px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{reveal ? fmtUnits(conf.myBalance, m.decimals) : DOTS}</span>
      <span style={css("text-align:right;font:600 13px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{reveal ? (sh != null ? sh.toString() : "—") : DOTS}</span>
    </div>
  );
}

export function Balances() {
  const { address, isConnected } = useAccount();
  const { selectedMarket, setSelectedMarket } = useNav();
  const meta = assetMeta(selectedMarket);
  const push = useToast();
  const pub = usePublicClient();
  const conf = useConfToken(meta.cToken);
  const { writeContractAsync } = useWriteContract();
  const r = useReveal("all confidential balances");
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [busy, setBusy] = useState(false);
  const dec = meta.decimals;

  const { data: native } = useBalance({ address, query: { enabled: !!address, refetchInterval: 15000 } });
  const { data: underlyingBal, refetch: refetchUnderlying } = useReadContract({
    address: meta.underlying, abi: erc20Abi, functionName: "balanceOf", args: [address as Hex],
    query: { enabled: !!address, refetchInterval: 12000 },
  });
  const { data: shares } = useReadContract({
    address: meta.venues[0].router, abi: routerAbi, functionName: "sharesOf", args: [address as Hex],
    account: address, query: { enabled: !!address, refetchInterval: 12000 },
  });
  const shareSym = `cs${meta.underlyingSymbol}`;

  async function run() {
    if (!isConnected) return push("Connect your wallet first", "err");
    const units = toUnits(amt, dec);
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy(true);
    try {
      if (mode === "shield") {
        const allowance = (await pub!.readContract({ address: meta.underlying, abi: erc20Abi, functionName: "allowance", args: [address!, meta.cToken] })) as bigint;
        if (allowance < units) {
          const ah = await writeContractAsync({ address: meta.underlying, abi: erc20Abi, functionName: "approve", args: [meta.cToken, units] });
          await pub!.waitForTransactionReceipt({ hash: ah });
        }
        const h = await writeContractAsync({ address: meta.cToken, abi: ctokenAbi, functionName: "shield", args: [units] });
        await pub!.waitForTransactionReceipt({ hash: h });
        push(`Shielded ${amt} ${meta.underlyingSymbol} → ${meta.symbol}`, "ok");
      } else {
        const h = await writeContractAsync({ address: meta.cToken, abi: ctokenAbi, functionName: "unshield", args: [units] });
        await pub!.waitForTransactionReceipt({ hash: h });
        push(`Unshielded ${amt} ${meta.symbol} → ${meta.underlyingSymbol} · now public`, "ok");
      }
      setAmt(""); conf.refetch(); refetchUnderlying();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(false);
  }

  return (
    <div style={css("max-width:960px;width:100%")}>
      <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Balances</h1>
      <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>Public tokens are visible on-chain; private (c-) balances are readable only by you.</p>

      {/* market switcher */}
      <div style={css("display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:18px")}>
        <span style={css("font:650 11px var(--display);color:var(--ink-3);margin-right:2px")}>Asset</span>
        {ASSET_LIST.map((m) => (
          <button key={m.symbol} onClick={() => { setSelectedMarket(m.symbol); setAmt(""); }} style={cssm("display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;font:650 12px var(--display);cursor:pointer;border:1px solid var(--line)", m.symbol === selectedMarket ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>
            <TokenIcon token={m.symbol} size={16} />{m.symbol}
          </button>
        ))}
      </div>
      <div style={css("height:1px;background:var(--line);margin:20px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px")}>
        {/* Public */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:6px")}>
            <span style={css("font:750 15px var(--display);color:var(--ink)")}>Public tokens</span>
            <span style={css("font:600 11px var(--display);color:var(--ink-3)")}>Arc testnet · visible on-chain</span>
          </div>
          <Row token="USDC" name="USDC (gas)" sub="native Arc gas token" value={native ? Number(native.value / 10n ** 12n / 1000n) / 1000 + "" : "—"} />
          <Row token={meta.underlyingSymbol} name={meta.underlyingSymbol} sub={`ERC-20 · ${meta.label} underlying`} value={fmtUnits(underlyingBal as bigint | undefined, dec)} />
          <p style={css("margin:12px 2px 0;font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>On Arc, gas is paid in USDC — no separate ETH needed.</p>
        </div>

        {/* Confidential */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:6px")}>
            <span style={css("display:inline-flex;align-items:center;gap:7px;font:750 15px var(--display);color:var(--ink)")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
              Private balances · {meta.symbol}
            </span>
            <button onClick={r.toggle} disabled={r.signing} style={cssm("font:650 11.5px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:5px 12px;cursor:pointer", r.signing ? { opacity: 0.6, cursor: "wait" } : undefined)}>{r.label}</button>
          </div>
          {!r.revealed && <div style={css("margin:0 2px 8px")}><RevealNote r={r} /></div>}
          <Row token={meta.symbol} name={meta.symbol} sub={`private ${meta.underlyingSymbol} balance`} value={r.revealed ? fmtUnits(conf.myBalance, dec) : DOTS} />
          <Row token={shareSym} name={shareSym} sub="private vault share" value={r.revealed ? ((shares as bigint | undefined) != null ? (shares as bigint).toString() : "—") : DOTS} />
          <p style={css("margin:12px 2px 0;font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>Revealed to you in-app for this session — nobody else can read them. Shielded on-chain under APS once live.</p>
        </div>
      </div>

      {/* Shield / unshield */}
      <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
        <div style={css("display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap")}>
          {(["shield", "unshield"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={cssm("padding:8px 16px;border-radius:999px;font:650 13px var(--display);cursor:pointer;border:1px solid var(--line)", mode === m ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>{m === "shield" ? "Shield" : "Unshield"}</button>
          ))}
          <span style={css("font:400 12px var(--display);color:var(--ink-3);margin-left:4px")}>{mode === "shield" ? `${meta.underlyingSymbol} → private ${meta.symbol}` : `${meta.symbol} → public ${meta.underlyingSymbol}`}</span>
        </div>
        <div style={css("display:flex;gap:12px;flex-wrap:wrap")}>
          <div style={css("display:flex;align-items:center;gap:9px;flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:11px 14px")}>
            <TokenIcon token={mode === "shield" ? meta.underlyingSymbol : meta.symbol} size={26} />
            <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 19px var(--mono);color:var(--ink)")} />
          </div>
          <button onClick={run} disabled={busy} style={cssm("background:var(--panel);color:#fff;border:none;border-radius:13px;padding:0 24px;font:700 14px var(--display);cursor:pointer", busy ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy ? "Working…" : mode === "shield" ? "Shield" : "Unshield"}</button>
        </div>
      </div>

      {/* All markets confidential balances */}
      <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
        <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:6px")}>
          <span style={css("font:750 15px var(--display);color:var(--ink)")}>All markets · your private balances</span>
          <button onClick={r.toggle} disabled={r.signing} style={cssm("font:650 11.5px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:5px 12px;cursor:pointer", r.signing ? { opacity: 0.6, cursor: "wait" } : undefined)}>{r.label}</button>
        </div>
        {!r.revealed && <div style={css("margin:0 2px 8px")}><RevealNote r={r} /></div>}
        <div style={css("display:grid;grid-template-columns:1fr 130px 110px;gap:8px;padding:0 4px 10px;border-bottom:1px solid var(--line);font:650 10.5px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>
          <span>Token</span><span style={css("text-align:right")}>Balance</span><span style={css("text-align:right")}>Shares</span>
        </div>
        {!isConnected ? (
          <div style={css("padding:24px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>Connect your wallet to see your private balances.</div>
        ) : (
          ASSET_LIST.map((m) => <AssetConfRow key={m.symbol} m={m} reveal={r.revealed} />)
        )}
      </div>
    </div>
  );
}
