"use client";
import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import { css, cssm } from "@/lib/css";
import { useToast } from "@/components/Toast";
import { WhatsPrivate } from "@/components/Privacy";
import { useConfToken, useLedger, useNowSec } from "@/lib/hooks";
import { DOTS, fmtUnits6, toUnits6, mmss, shortAddr, errMsg } from "@/lib/format";
import { LEDGER, USDC_ASSET } from "@/lib/addresses";
import { useReveal, RevealNote } from "@/lib/useReveal";
import { cusdcAbi, ledgerAbi } from "@/lib/abis";

const CUSDC = USDC_ASSET.cToken; // the payments module settles in the live USDC asset's confidential token
const PAY_EXECUTED_SIG = keccak256(toBytes("PaymentExecuted(bytes32)"));

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
      <div style={css("display:flex;flex-direction:column;gap:2px")}><span style={css("font:750 15.5px var(--display);color:var(--ink)")}>{title}</span>{sub && <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>{sub}</span>}</div>
      {children}
    </div>
  );
}
const inputStyle = css("width:100%;box-sizing:border-box;border:1px solid var(--line);background:var(--surface-2);border-radius:11px;padding:11px 13px;font:600 14px var(--mono);color:var(--ink);outline:none");
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={css("display:flex;flex-direction:column;gap:6px")}><span style={css("font:600 11.5px var(--display);color:var(--ink-3)")}>{label}</span>{children}</label>;
}
function Primary({ children, onClick, busy }: { children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return <button onClick={onClick} disabled={busy} style={cssm("align-self:flex-start;background:var(--panel);color:#fff;border:none;border-radius:999px;padding:11px 20px;font:700 13.5px var(--display);cursor:pointer", busy ? { opacity: 0.6, cursor: "wait" } : undefined)}>{children}</button>;
}

export function Payments() {
  const { address, isConnected } = useAccount();
  const pub = usePublicClient();
  const push = useToast();
  const cusdc = useConfToken(CUSDC);
  const ledger = useLedger();
  const now = useNowSec();
  const { writeContractAsync } = useWriteContract();

  const r = useReveal("payment ledger balance");
  const [fundAmt, setFundAmt] = useState("");
  const [payTo, setPayTo] = useState("");
  const [payAmt, setPayAmt] = useState("");
  const [payRef, setPayRef] = useState("invoice-001");
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);
  const [vId, setVId] = useState("");
  const [vAmt, setVAmt] = useState("");
  const [vRef, setVRef] = useState("invoice-001");
  const [vResult, setVResult] = useState<null | boolean>(null);
  const [viewer, setViewer] = useState("");
  const [wAmt, setWAmt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: statement, refetch: refetchStmt } = useReadContract({
    address: LEDGER, abi: ledgerAbi, functionName: "exportStatement", args: [address as `0x${string}`, 0n, 20n],
    account: address, query: { enabled: !!address, refetchInterval: 15000 },
  });
  type Receipt = { payer: string; service: string; amount: bigint; timestamp: bigint; ref: string };
  const receipts = ((statement as readonly Receipt[] | undefined) ?? []).slice().reverse();

  const refetchAll = () => { ledger.refetch(); cusdc.refetch(); refetchStmt(); };
  const guard = () => { if (!isConnected) { push("Connect your wallet first", "err"); return false; } return true; };

  async function fund() {
    if (!guard()) return;
    const units = toUnits6(fundAmt);
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy("fund");
    try {
      const isOp = (await pub!.readContract({ address: CUSDC, abi: cusdcAbi, functionName: "isOperator", args: [address!, LEDGER] })) as boolean;
      if (!isOp) {
        const oh = await writeContractAsync({ address: CUSDC, abi: cusdcAbi, functionName: "setOperator", args: [LEDGER, Math.floor(Date.now() / 1000) + 86400] });
        await pub!.waitForTransactionReceipt({ hash: oh });
      }
      const h = await writeContractAsync({ address: LEDGER, abi: ledgerAbi, functionName: "fund", args: [units] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push("Account funded · private balance loaded", "ok"); setFundAmt(""); refetchAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  async function pay() {
    if (!guard()) return;
    const units = toUnits6(payAmt);
    if (!payTo.startsWith("0x") || payTo.length !== 42) return push("Enter a valid service address", "err");
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy("pay");
    try {
      const ref = keccak256(toBytes(payRef || "ref"));
      const h = await writeContractAsync({ address: LEDGER, abi: ledgerAbi, functionName: "pay", args: [payTo as `0x${string}`, units, ref] });
      const rcpt = await pub!.waitForTransactionReceipt({ hash: h });
      const log = rcpt.logs.find((l) => l.address.toLowerCase() === LEDGER.toLowerCase() && l.topics[0] === PAY_EXECUTED_SIG);
      const receiptId = log?.topics[1] ?? null;
      setLastReceipt(receiptId);
      push("Paid · only an opaque receipt crossed the wire", "ok"); setPayAmt(""); refetchAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  async function verify() {
    if (!guard()) return;
    if (!vId.startsWith("0x")) return push("Paste a receiptId", "err");
    setBusy("verify"); setVResult(null);
    try {
      const ok = (await pub!.readContract({ address: LEDGER, abi: ledgerAbi, functionName: "verifyReceipt", args: [vId as `0x${string}`, address!, toUnits6(vAmt), keccak256(toBytes(vRef || "ref"))], account: address })) as boolean;
      setVResult(ok);
    } catch (e) { push(errMsg(e), "err"); setVResult(false); }
    setBusy(null);
  }

  async function grant(revoke = false) {
    if (!guard()) return;
    const v = revoke ? "0x0000000000000000000000000000000000000000" : viewer;
    if (!revoke && (!v.startsWith("0x") || v.length !== 42)) return push("Enter a viewer address", "err");
    setBusy("grant");
    try {
      const h = await writeContractAsync({ address: LEDGER, abi: ledgerAbi, functionName: "grantViewKey", args: [v as `0x${string}`] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push(revoke ? "View key revoked" : `View key granted to ${shortAddr(v)}`, "ok"); if (revoke) setViewer("");
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  async function cashout() {
    if (!guard()) return;
    const units = toUnits6(wAmt);
    if (units <= 0n) return push("Enter an amount", "err");
    setBusy("cashout");
    try {
      const h = await writeContractAsync({ address: LEDGER, abi: ledgerAbi, functionName: "requestWithdraw", args: [units] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push("Withdrawal queued · claimable after the decorrelation window", "ok"); setWAmt(""); refetchAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  async function claimWithdraw() {
    setBusy("claim");
    try {
      const h = await writeContractAsync({ address: LEDGER, abi: ledgerAbi, functionName: "claimWithdraw", args: [] });
      await pub!.waitForTransactionReceipt({ hash: h });
      push("Withdrawal claimed", "ok"); refetchAll();
    } catch (e) { push(errMsg(e), "err"); }
    setBusy(null);
  }

  const pend = ledger.pendingWithdraw;
  const claimIn = pend && pend.amount > 0n ? Math.max(0, pend.claimableAt - now) : 0;

  return (
    <div style={css("max-width:1160px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Payments</h1>
          <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>A private account for the x402 / agent economy. Fund once, pay many services — amounts &amp; counterparties stay private.</p>
        </div>
        <WhatsPrivate />
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px")}>
        {/* Account */}
        <Card title="Your account" sub="a private balance in the payment ledger">
          <div style={css("display:flex;align-items:center;justify-content:space-between;background:var(--panel);border-radius:14px;padding:16px 18px")}>
            <div style={css("display:flex;flex-direction:column;gap:3px")}><span style={css("font:600 11px var(--display);color:#b7b2a8")}>Ledger balance</span><span style={css("font:800 26px var(--mono);color:#fff;font-variant-numeric:tabular-nums")}>{r.revealed ? fmtUnits6(ledger.myBalance) : DOTS}</span></div>
            <button onClick={r.toggle} disabled={r.signing} style={cssm("font:650 11.5px var(--display);color:#1a1a1a;background:#ffd208;border:none;border-radius:999px;padding:7px 14px;cursor:pointer", r.signing ? { opacity: 0.6, cursor: "wait" } : undefined)}>{r.label}</button>
          </div>
          <RevealNote r={r} />
          {cusdc.myBalance != null && cusdc.myBalance === 0n && <span style={css("font:400 12px var(--display);color:var(--amber)")}>You have 0 cUSDC — shield some on the Faucet first.</span>}
          <Field label="Fund amount (cUSDC)"><input value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={inputStyle} /></Field>
          <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>Private cUSDC available: {fmtUnits6(cusdc.myBalance)}</span>
          <Primary onClick={fund} busy={busy === "fund"}>{busy === "fund" ? "Funding…" : "Fund account"}</Primary>
        </Card>

        {/* Pay */}
        <Card title="Pay a service" sub="the x402 agent payment, made tangible">
          <Field label="Service address"><input value={payTo} onChange={(e) => setPayTo(e.target.value)} placeholder="0x…" style={inputStyle} /></Field>
          <div style={css("display:flex;gap:10px")}>
            <div style={css("flex:1")}><Field label="Amount (cUSDC)"><input value={payAmt} onChange={(e) => setPayAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={inputStyle} /></Field></div>
            <div style={css("flex:1")}><Field label="Ref (label)"><input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="invoice-001" style={inputStyle} /></Field></div>
          </div>
          <Primary onClick={pay} busy={busy === "pay"}>{busy === "pay" ? "Paying…" : "Pay privately"}</Primary>
          {lastReceipt && (
            <div style={css("background:var(--green-bg);border:1px solid #bfe3cf;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px")}>
              <span style={css("font:600 11px var(--display);color:#1c7a4f")}>Opaque receiptId — only this crossed the wire (no amount, no counterparty)</span>
              <span style={css("font:600 11.5px var(--mono);color:var(--ink);word-break:break-all")}>{lastReceipt}</span>
            </div>
          )}
        </Card>

        {/* Receipts */}
        <Card title="Receipts" sub="your statement — readable only by you (or a granted viewer)">
          {receipts.length === 0 ? (
            <div style={css("padding:18px 4px;text-align:center;font:400 12.5px var(--display);color:var(--ink-3)")}>No receipts yet. Pay a service to create one.</div>
          ) : (
            <div style={css("display:flex;flex-direction:column;max-height:280px;overflow:auto")}>
              {receipts.map((r, i) => {
                const outgoing = r.payer.toLowerCase() === (address || "").toLowerCase();
                return (
                  <div key={i} style={css("display:flex;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid var(--line)")}>
                    <span style={cssm(`width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font:700 12px var(--display)`, outgoing ? { background: "#fbecec", color: "#c0392b" } : { background: "var(--green-bg)", color: "#1c7a4f" })}>{outgoing ? "↑" : "↓"}</span>
                    <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}><span style={css("font:650 12.5px var(--display);color:var(--ink)")}>{outgoing ? "Paid" : "Received"} {shortAddr(outgoing ? r.service : r.payer)}</span><span style={css("font:400 11px var(--mono);color:var(--ink-3)")}>{new Date(Number(r.timestamp) * 1000).toLocaleString()}</span></div>
                    <span style={cssm(`font:700 13.5px var(--mono);font-variant-numeric:tabular-nums`, outgoing ? { color: "#c0392b" } : { color: "#1c7a4f" })}>{outgoing ? "-" : "+"}{fmtUnits6(r.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Verify */}
        <Card title="Verify a receipt" sub="a service checks a payment from its own wallet">
          <Field label="receiptId"><input value={vId} onChange={(e) => setVId(e.target.value)} placeholder="0x…" style={inputStyle} /></Field>
          <div style={css("display:flex;gap:10px")}>
            <div style={css("flex:1")}><Field label="Min amount"><input value={vAmt} onChange={(e) => setVAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={inputStyle} /></Field></div>
            <div style={css("flex:1")}><Field label="Ref"><input value={vRef} onChange={(e) => setVRef(e.target.value)} placeholder="invoice-001" style={inputStyle} /></Field></div>
          </div>
          <div style={css("display:flex;align-items:center;gap:12px")}>
            <Primary onClick={verify} busy={busy === "verify"}>{busy === "verify" ? "Verifying…" : "Verify"}</Primary>
            {vResult !== null && <span style={cssm(`font:700 13px var(--display);display:inline-flex;align-items:center;gap:6px`, vResult ? { color: "#1c7a4f" } : { color: "#c0392b" })}>{vResult ? "✓ Valid receipt" : "✗ Does not match"}</span>}
          </div>
        </Card>

        {/* Auditor / view key */}
        <Card title="Auditor access" sub="compliance-native selective disclosure">
          <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
            {[["Owner", "sees all", "var(--green)"], ["Viewer", "granted → sees", "var(--amber)"], ["Stranger", "blocked", "var(--red)"]].map(([a, b, c]) => (
              <span key={a} style={css(`display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font:600 11px var(--display);color:var(--ink-2)`)}><span style={css(`width:7px;height:7px;border-radius:50%;background:${c}`)} />{a}: {b}</span>
            ))}
          </div>
          <Field label="Grant a viewer (auditor) address"><input value={viewer} onChange={(e) => setViewer(e.target.value)} placeholder="0x…" style={inputStyle} /></Field>
          <div style={css("display:flex;gap:10px")}>
            <Primary onClick={() => grant(false)} busy={busy === "grant"}>Grant view key</Primary>
            <button onClick={() => grant(true)} disabled={busy === "grant"} style={css("align-self:flex-start;background:var(--surface);color:var(--ink-2);border:1px solid var(--line);border-radius:999px;padding:11px 18px;font:600 13px var(--display);cursor:pointer")}>Revoke</button>
          </div>
        </Card>

        {/* Cash out */}
        <Card title="Cash out" sub="timing-decorrelated — your payout can't be linked to specific payments">
          <Field label="Withdraw amount (cUSDC)"><input value={wAmt} onChange={(e) => setWAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={inputStyle} /></Field>
          <Primary onClick={cashout} busy={busy === "cashout"}>{busy === "cashout" ? "Queuing…" : "Request withdrawal"}</Primary>
          {pend && pend.amount > 0n && (
            <div style={css("background:var(--accent-soft);border:1px solid #f0d97a;border-radius:12px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px")}>
              <span style={css("font:600 12px var(--display);color:#6b5a2a")}>Pending {fmtUnits6(pend.amount)} cUSDC · {claimIn > 0 ? `claim in ${mmss(claimIn)}` : "ready to claim"}</span>
              <button onClick={claimWithdraw} disabled={claimIn > 0 || busy === "claim"} style={cssm("border:none;border-radius:999px;padding:8px 15px;font:700 12px var(--display);cursor:pointer;background:var(--panel);color:#fff", (claimIn > 0 || busy === "claim") ? { opacity: 0.5, cursor: "not-allowed" } : undefined)}>Claim</button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
