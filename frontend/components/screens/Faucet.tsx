"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { TokenIcon } from "@/components/TokenIcon";
import { useConfToken } from "@/lib/hooks";
import { fmtUnits, toUnits, errMsg } from "@/lib/format";
import { FAUCET, type Hex } from "@/lib/addresses";
import { assetMeta, ASSET_LIST } from "@/lib/markets";
import { ctokenAbi, erc20Abi } from "@/lib/abis";

function StepNum({ n }: { n: number }) {
  return <span style={css("width:30px;height:30px;flex:none;border-radius:50%;background:var(--panel);color:#ffd208;display:flex;align-items:center;justify-content:center;font:800 14px var(--mono)")}>{n}</span>;
}
const Amber = ({ children }: { children: React.ReactNode }) => (
  <div style={css("display:flex;align-items:flex-start;gap:10px;background:#fbf1dc;border:1px solid #f0d97a;border-radius:12px;padding:11px 14px;font:400 12.5px/1.5 var(--display);color:#6b5a2a")}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none;margin-top:1px")}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>
    <span>{children}</span>
  </div>
);

export function Faucet() {
  const { address, isConnected } = useAccount();
  const { selectedMarket, setSelectedMarket, openMarket, go } = useNav();
  const meta = assetMeta(selectedMarket); // shield/unshield is venue-agnostic — Faucet works at the asset level
  const push = useToast();
  const pub = usePublicClient();
  const conf = useConfToken(meta.cToken);
  const { writeContractAsync } = useWriteContract();
  const [mintAmt, setMintAmt] = useState("1000");
  const [amt, setAmt] = useState("100");
  const [busy, setBusy] = useState<null | "mint" | "shield">(null);
  const dec = meta.decimals;

  const { data: underlyingBal, refetch: refetchUnderlying } = useReadContract({
    address: meta.underlying, abi: erc20Abi, functionName: "balanceOf", args: [address as Hex],
    query: { enabled: !!address, refetchInterval: 12000 },
  });

  async function mint() {
    if (!isConnected) return push("Connect your wallet first", "err");
    const units = toUnits(mintAmt, dec);
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy("mint");
    try {
      const h = await writeContractAsync({ address: meta.underlying, abi: erc20Abi, functionName: "mint", args: [address!, units] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push(`Minted ${mintAmt} test ${meta.underlyingSymbol}`, "ok");
      refetchUnderlying();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  async function shield() {
    if (!isConnected) return push("Connect your wallet first", "err");
    const units = toUnits(amt, dec);
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy("shield");
    try {
      const allowance = (await pub!.readContract({ address: meta.underlying, abi: erc20Abi, functionName: "allowance", args: [address!, meta.cToken] })) as bigint;
      if (allowance < units) {
        const ah = await writeContractAsync({ address: meta.underlying, abi: erc20Abi, functionName: "approve", args: [meta.cToken, units] });
        await pub!.waitForTransactionReceipt({ hash: ah });
      }
      const sh = await writeContractAsync({ address: meta.cToken, abi: ctokenAbi, functionName: "shield", args: [units] });
      await pub!.waitForTransactionReceipt({ hash: sh });
      push(`Shielded ${amt} ${meta.underlyingSymbol} → ${meta.symbol} · now private`, "ok");
      conf.refetch(); refetchUnderlying();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  return (
    <div style={css("max-width:840px;width:100%")}>
      <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Faucet</h1>
      <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>Get a market&rsquo;s underlying, shield it into a private balance, then deposit &amp; earn.</p>

      {/* market switcher */}
      <div style={css("display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:18px")}>
        <span style={css("font:650 11px var(--display);color:var(--ink-3);margin-right:2px")}>Market</span>
        {ASSET_LIST.map((m) => (
          <button key={m.symbol} onClick={() => setSelectedMarket(m.symbol)} style={cssm("display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:999px;font:650 12px var(--display);cursor:pointer;border:1px solid var(--line)", m.symbol === selectedMarket ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>
            <TokenIcon token={m.symbol} size={16} />{m.symbol}
          </button>
        ))}
      </div>
      <div style={css("height:1px;background:var(--line);margin:20px 0 26px")} />

      <div style={css("display:flex;flex-direction:column;gap:16px")}>
        {/* Step 1 — get (USDC) or mint (simulated) */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:14px")}>
          <div style={css("display:flex;align-items:center;gap:13px")}><StepNum n={1} /><div style={css("display:flex;flex-direction:column")}><span style={css("font:750 16px var(--display);color:var(--ink)")}>{!meta.live ? `Mint test ${meta.underlyingSymbol}` : "Get testnet USDC"}</span><span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>{!meta.live ? `${meta.label} is a simulated market — mint the mock underlying` : "Arc testnet USDC is real — grab it from Circle's faucet"}</span></div></div>
          <Amber>This is a <b style={css("font-weight:700")}>PUBLIC STEP.</b> {!meta.live ? `Minting and holding ${meta.underlyingSymbol} is transparent on Arc` : "Getting and holding USDC is transparent on Arc"} — shield it in step 2 to convert into a private balance. Gas on Arc is paid in USDC.</Amber>
          {!meta.live ? (
            <div style={css("display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
              <div style={css("display:flex;align-items:center;gap:9px;flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:11px 14px")}>
                <TokenIcon token={meta.underlyingSymbol} size={26} />
                <input value={mintAmt} onChange={(e) => setMintAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 20px var(--mono);color:var(--ink)")} />
                <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{meta.underlyingSymbol}</span>
              </div>
              <button onClick={mint} disabled={busy === "mint"} style={cssm("background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:999px;padding:11px 20px;font:700 13.5px var(--display);cursor:pointer;white-space:nowrap", busy === "mint" ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy === "mint" ? "Minting…" : `Mint ${meta.underlyingSymbol}`}</button>
              <span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>your {meta.underlyingSymbol}: <b style={css("color:var(--ink);font-weight:700;font-family:var(--mono)")}>{fmtUnits(underlyingBal as bigint | undefined, dec)}</b></span>
            </div>
          ) : (
            <div style={css("display:flex;align-items:center;gap:12px;flex-wrap:wrap")}>
              <a href={FAUCET} target="_blank" rel="noreferrer" style={css("display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:999px;padding:11px 18px;font:700 13.5px var(--display);text-decoration:none")}>Open faucet.circle.com →</a>
              <span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>select <b style={css("color:var(--ink-2);font-weight:600")}>Arc Testnet</b> · your USDC: <b style={css("color:var(--ink);font-weight:700;font-family:var(--mono)")}>{fmtUnits(underlyingBal as bigint | undefined, dec)}</b></span>
            </div>
          )}
        </div>

        {/* Step 2 — shield */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:16px")}>
          <div style={css("display:flex;align-items:center;gap:13px")}><StepNum n={2} /><div style={css("display:flex;flex-direction:column")}><span style={css("font:750 16px var(--display);color:var(--ink)")}>Shield into a private balance</span><span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>wrap {meta.underlyingSymbol} 1:1 into confidential {meta.symbol}</span></div></div>
          <div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
            <div style={css("display:flex;align-items:center;gap:9px;flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:11px 14px")}>
              <TokenIcon token={meta.underlyingSymbol} size={26} />
              <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 20px var(--mono);color:var(--ink)")} />
              <button onClick={() => setAmt(underlyingBal ? fmtUnits(underlyingBal as bigint, dec).replace(/,/g, "") : "0")} style={css("font:650 11px var(--display);color:#8a6d00;background:var(--accent-soft);border:1px solid #f0e08f;border-radius:999px;padding:4px 10px;cursor:pointer")}>MAX</button>
            </div>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            <div style={css("display:flex;align-items:center;gap:9px;flex:1;min-width:200px;background:#faf7ee;border:1px solid #f0e3bd;border-radius:13px;padding:11px 14px")}>
              <TokenIcon token={meta.symbol} size={26} />
              <span style={css("flex:1;font:700 20px var(--mono);color:var(--ink)")}>{amt || "0"}</span>
              <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>{meta.symbol}</span>
            </div>
          </div>
          <button onClick={shield} disabled={busy === "shield"} style={cssm("align-self:flex-start;background:var(--panel);color:#fff;border:none;border-radius:999px;padding:12px 22px;font:700 14px var(--display);cursor:pointer", busy === "shield" ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy === "shield" ? "Shielding…" : `Shield into ${meta.symbol}`}</button>
        </div>

        {/* Step 3 — ready */}
        <div style={css("background:var(--panel);border-radius:20px;padding:24px 26px;display:flex;flex-direction:column;gap:12px;color:#f3f1ec")}>
          <div style={css("display:flex;align-items:center;gap:13px")}><span style={css("width:30px;height:30px;flex:none;border-radius:50%;background:rgba(255,255,255,.1);color:#ffd208;display:flex;align-items:center;justify-content:center;font:800 14px var(--mono)")}>3</span><span style={css("font:750 16px var(--display)")}>You&rsquo;re ready to earn</span></div>
          <p style={css("margin:0;font:400 13.5px/1.6 var(--display);color:#b7b2a8")}>Your private {meta.symbol} balance: <b style={css("color:#fff;font-weight:700;font-family:var(--mono)")}>{fmtUnits(conf.myBalance, dec)}</b>. Head to the {meta.label} market to deposit and earn — privately.</p>
          <div style={css("display:flex;gap:10px;flex-wrap:wrap")}>
            <button onClick={() => openMarket(meta.symbol)} style={css("background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:none;border-radius:999px;padding:11px 20px;font:700 13.5px var(--display);cursor:pointer")}>Earn on {meta.symbol} →</button>
            <button onClick={() => go("markets")} style={css("background:rgba(255,255,255,.08);color:#e9e6df;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:11px 20px;font:600 13.5px var(--display);cursor:pointer")}>All markets</button>
          </div>
        </div>
      </div>
    </div>
  );
}
