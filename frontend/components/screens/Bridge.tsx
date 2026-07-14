"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { useToast } from "@/components/Toast";
import { TokenIcon } from "@/components/TokenIcon";
import { fmtUnits, errMsg } from "@/lib/format";
import { CHAIN_ID, EXPLORER, type Hex } from "@/lib/addresses";
import { erc20Abi } from "@/lib/abis";
import { bridgeKit, DEST, SOURCE_CHAINS, CCTP_STEPS, type SourceChain, type CctpStepKey } from "@/lib/cctp";

type StepState = { state: "idle" | "pending" | "success" | "error"; txHash?: string; explorerUrl?: string };
type Steps = Record<CctpStepKey, StepState>;
const FRESH: Steps = { approve: { state: "idle" }, burn: { state: "idle" }, fetchAttestation: { state: "idle" }, mint: { state: "idle" } };

const CircleMark = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="10" fill="#3B8BF4" /><path d="M12 6.5a5.5 5.5 0 1 0 4.9 8" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
);

export function Bridge() {
  const { address, isConnected, connector, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { go } = useNav();
  const push = useToast();

  const [source, setSource] = useState<SourceChain>(SOURCE_CHAINS[0]);
  const [amt, setAmt] = useState("1");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Steps>(FRESH);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false); // whether a bridge has been attempted (to reveal the stepper)

  // arrived native USDC on Arc (read from Arc regardless of the wallet's current chain)
  const { data: arcUsdc, refetch: refetchArc } = useReadContract({
    address: "0x3600000000000000000000000000000000000000", abi: erc20Abi, functionName: "balanceOf",
    args: [address as Hex], chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 8000 },
  });

  // Subscribe once to Bridge Kit lifecycle events; callbacks update the stepper live.
  useEffect(() => {
    const upd = (k: CctpStepKey) => (p: { values?: { state?: string; txHash?: string; explorerUrl?: string } }) => {
      const v = p?.values ?? {};
      setSteps((s) => ({ ...s, [k]: { state: (v.state as StepState["state"]) ?? "success", txHash: v.txHash, explorerUrl: v.explorerUrl } }));
    };
    // Bridge Kit events (no "bridge." prefix)
    bridgeKit.on("approve", upd("approve"));
    bridgeKit.on("burn", upd("burn"));
    bridgeKit.on("fetchAttestation", upd("fetchAttestation"));
    bridgeKit.on("mint", upd("mint"));
  }, []);

  async function bridge() {
    if (!isConnected || !connector) return push("Connect your wallet first", "err");
    const n = Number(amt);
    if (!(n > 0)) return push("Enter an amount", "err");
    setErr(null);
    setDone(false);
    setSteps(FRESH);
    started.current = true;
    setBusy(true);
    try {
      if (chainId !== source.chainId) await switchChainAsync({ chainId: source.chainId });
      const provider = await connector.getProvider();
      const adapter = await createViemAdapterFromProvider({ provider: provider as never });
      // mark approve active immediately for responsiveness
      setSteps((s) => ({ ...s, approve: { state: "pending" } }));
      const result: { state?: string; steps?: { name: string; state: string; error?: string; txHash?: string; explorerUrl?: string }[] } =
        await bridgeKit.bridge({
          from: { adapter, chain: source.chain },
          to: { adapter, chain: DEST, useForwarder: true },
          amount: amt,
        });
      // reconcile with the final result
      (result.steps ?? []).forEach((st) => {
        if (CCTP_STEPS.some((c) => c.key === st.name)) {
          setSteps((s) => ({ ...s, [st.name as CctpStepKey]: { state: st.state as StepState["state"], txHash: st.txHash, explorerUrl: st.explorerUrl } }));
        }
      });
      if (result.state === "success") {
        setDone(true);
        push(`Bridged ${amt} USDC to Arc`, "ok");
        refetchArc();
      } else {
        const failed = (result.steps ?? []).find((s) => s.state === "error");
        setErr(failed?.error || "Bridge did not complete");
      }
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  const arrived = fmtUnits(arcUsdc as bigint | undefined, 6);

  return (
    <div style={css("max-width:900px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Bridge</h1>
          <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>Bring your USDC to Arc, make it private, earn yield.</p>
        </div>
        <span style={css("display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:650 12px var(--display)")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />Live · real Circle CCTP
        </span>
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px")}>
        {/* form */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>From (source chain)</span></div>
          <div style={css("display:flex;gap:8px;flex-wrap:wrap")}>
            {SOURCE_CHAINS.map((c) => (
              <button key={c.key} onClick={() => setSource(c)} style={cssm("display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:12px;font:650 13px var(--display);cursor:pointer;border:1px solid var(--line)", c.key === source.key ? { background: "var(--panel)", color: "#fff", borderColor: "var(--panel)" } : { background: "var(--surface)", color: "var(--ink-2)" })}>
                <span style={css(`width:9px;height:9px;border-radius:50%;background:${c.logoTint}`)} />{c.label}
              </button>
            ))}
          </div>

          <div style={css("display:flex;align-items:center;justify-content:center;gap:10px;color:var(--ink-3)")}>
            <span style={css("font:600 12px var(--display)")}>{source.label}</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span style={css("display:inline-flex;align-items:center;gap:6px;font:700 12px var(--display);color:var(--ink)")}><TokenIcon token="USDC" size={16} />Arc Testnet</span>
          </div>

          <div><span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Amount (USDC)</span></div>
          <div style={css("display:flex;align-items:center;gap:9px;background:var(--surface-2);border:1px solid var(--line);border-radius:13px;padding:12px 14px")}>
            <TokenIcon token="USDC" size={26} />
            <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="0.0" style={css("flex:1;min-width:0;border:none;background:none;outline:none;font:700 20px var(--mono);color:var(--ink)")} />
            <span style={css("font:600 12px var(--display);color:var(--ink-3)")}>USDC</span>
          </div>
          <span style={css("font:400 11.5px/1.5 var(--display);color:var(--ink-3)")}>You need testnet USDC on {source.label} (from faucet.circle.com). CCTP burns it there and mints native USDC on Arc.</span>

          <button onClick={bridge} disabled={busy} style={cssm("width:100%;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:13px;padding:13px;font:700 14.5px var(--display);cursor:pointer", busy ? { opacity: 0.6, cursor: "wait" } : undefined)}>{busy ? "Bridging…" : `Bridge to Arc`}</button>
          <div style={css("display:inline-flex;align-items:center;gap:7px;align-self:center")}><CircleMark /><a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer" style={css("font:600 11.5px var(--display);color:var(--ink-3);text-decoration:none")}>Powered by Circle CCTP</a></div>
        </div>

        {/* lifecycle */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <span style={css("font:750 15px var(--display);color:var(--ink)")}>Transfer lifecycle</span>
          {!started.current ? (
            <div style={css("padding:22px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>Pick a source chain + amount and bridge — the CCTP steps appear here.</div>
          ) : (
            <div style={css("display:flex;flex-direction:column;gap:13px")}>
              {CCTP_STEPS.map((c, i) => {
                const st = steps[c.key];
                const active = busy && st.state !== "success" && st.state !== "error" && (i === 0 || steps[CCTP_STEPS[i - 1].key].state === "success");
                const color = st.state === "success" ? "var(--green)" : st.state === "error" ? "var(--red)" : active || st.state === "pending" ? "var(--amber)" : "var(--ink-3)";
                const label = c.key === "burn" ? `Burn on ${source.label}` : c.label;
                return (
                  <div key={c.key} style={css("display:flex;align-items:center;gap:12px")}>
                    <span style={cssm(`width:11px;height:11px;border-radius:50%;flex:none;background:${color}`, active || st.state === "pending" ? { animation: "beat 1.4s ease-in-out infinite" } : undefined)} />
                    <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}>
                      <span style={css("font:600 13.5px var(--display);color:var(--ink)")}>{label}</span>
                      {c.key === "fetchAttestation" && (active || st.state === "pending") && <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>Circle is signing the burn proof (~seconds on Arc fast mode)…</span>}
                      {st.txHash && <a href={st.explorerUrl || `${EXPLORER}/tx/${st.txHash}`} target="_blank" rel="noreferrer" style={css("font:500 11px var(--mono);color:#8a6d00;text-decoration:none;word-break:break-all")}>{st.txHash.slice(0, 14)}… ↗</a>}
                    </div>
                    <span style={cssm(`font:650 10px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:999px;color:${color}`, st.state === "success" ? { background: "var(--green-bg)" } : st.state === "error" ? { background: "var(--red-bg)" } : (active || st.state === "pending") ? { background: "#fdf3d9" } : { background: "var(--surface-2)" })}>{st.state === "success" ? "done" : st.state === "error" ? "error" : active || st.state === "pending" ? "…" : "queued"}</span>
                  </div>
                );
              })}
            </div>
          )}

          {err && (
            <div style={css("background:var(--red-bg);border:1px solid #f0b5ad;border-radius:12px;padding:11px 14px;display:flex;flex-direction:column;gap:8px")}>
              <span style={css("font:600 12px var(--display);color:#8a2a1c")}>{err}</span>
              <button onClick={bridge} disabled={busy} style={css("align-self:flex-start;background:var(--panel);color:#fff;border:none;border-radius:999px;padding:7px 15px;font:700 12px var(--display);cursor:pointer")}>Retry</button>
            </div>
          )}

          {done && (
            <div style={css("background:var(--panel);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;color:#f3f1ec")}>
              <span style={css("font:700 13px var(--display)")}>✓ Native USDC arrived on Arc</span>
              <span style={css("font:400 12.5px var(--display);color:#b7b2a8")}>Your Arc USDC balance: <b style={css("color:#fff;font-weight:700;font-family:var(--mono)")}>{arrived}</b>. Shield it into a private cUSDC balance next.</span>
              <button onClick={() => go("faucet")} style={css("align-self:flex-start;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:none;border-radius:999px;padding:10px 18px;font:700 13px var(--display);cursor:pointer")}>Shield it →</button>
            </div>
          )}
        </div>
      </div>

      <p style={css("margin:18px 2px 0;font:400 11.5px/1.55 var(--display);color:var(--ink-3)")}>
        <b style={css("color:#1c7a4f;font-weight:700")}>This bridge is real.</b> CCTP + USDC are a genuine, live Circle integration on Arc testnet — distinct from the app&rsquo;s simulated lending venues. (Privacy is still notional until Arc&rsquo;s APS ships; bridging and USDC are live, confidentiality is not — the two are separate.)
      </p>
    </div>
  );
}
