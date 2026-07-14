"use client";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { useMarket, useBatchEvents, useNowSec, type BatchRow } from "@/lib/hooks";
import { fmtUnits, mmss } from "@/lib/format";
import { assetMeta, ASSET_LIST, venueMeta } from "@/lib/markets";
import { TokenIcon, VenueLogo } from "@/components/TokenIcon";
import { EXPLORER } from "@/lib/addresses";

function dirLabel(d: number): { t: string; c: string; bg: string } {
  if (d > 0) return { t: "Net deposit", c: "#1c7a4f", bg: "var(--green-bg)" };
  if (d < 0) return { t: "Net withdraw", c: "#b06a00", bg: "#fdf3d9" };
  return { t: "Balanced · no crossing", c: "var(--ink-2)", bg: "var(--surface-2)" };
}

function Lane({ title, sub, dark }: { title: string; sub: string; dark?: boolean }) {
  return (
    <div style={cssm("flex:1;min-width:180px;border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;gap:9px", dark ? { background: "var(--panel)", color: "#f3f1ec" } : { background: "var(--surface)", border: "1px solid var(--line)" })}>
      <span style={cssm("font:700 11px var(--display);letter-spacing:.08em;text-transform:uppercase", dark ? { color: "#ffd208" } : { color: "var(--ink-3)" })}>{title}</span>
      <span style={cssm("font:400 12.5px/1.5 var(--display)", dark ? { color: "#b7b2a8" } : { color: "var(--ink-2)" })}>{sub}</span>
    </div>
  );
}

export function GhostGate() {
  const { selectedMarket, setSelectedMarket, selectedVenue } = useNav();
  const asset = assetMeta(selectedMarket);
  const venue = venueMeta(selectedMarket, selectedVenue); // netting is per (asset, venue) router
  const market = useMarket(venue);
  const rows = useBatchEvents(venue.router);
  const now = useNowSec();
  const dispatchIn = market.dispatchableInAt(now);

  return (
    <div style={css("max-width:1100px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>GhostGate</h1>
          <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>Deposits and withdrawals net inside the private zone — only the residual crosses to the public venue.</p>
        </div>
        <span style={css("display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;background:var(--surface);border:1px solid var(--line);color:var(--ink-2);font:650 12px var(--display)")}>GhostGate netting · Arc</span>
      </div>

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

      {/* Explainer */}
      <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:24px 26px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
        <div style={css("display:flex;align-items:center;gap:10px;margin-bottom:18px")}>
          <span style={css("font:750 16px var(--display);color:var(--ink)")}>How netting protects you</span>
          <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>· because the venue lives on the PUBLIC Arc EVM</span>
        </div>
        <div style={css("display:flex;align-items:stretch;gap:12px;flex-wrap:wrap")}>
          <Lane title="Confidential zone" sub={`Many users deposit & withdraw ${asset.symbol} privately. Individual amounts and directions stay hidden.`} dark />
          <div style={css("display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 4px")}>
            <span style={css("font:700 10px var(--display);letter-spacing:.1em;color:var(--ink-3);writing-mode:horizontal-tb")}>NET ONLY</span>
            <svg width="34" height="24" viewBox="0 0 34 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h24M22 5l7 7-7 7"/></svg>
            <span style={css("width:9px;height:9px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />
          </div>
          <Lane title="Public venue · Arc EVM" sub="Only ONE movement per batch crosses: the net direction + amount. Observers never learn who transacted, which way, or for how much." />
        </div>
        <p style={css("margin:16px 2px 0;font:400 12.5px/1.6 var(--display);color:var(--ink-3)")}>On a monolithic private chain there&rsquo;d be nothing to net. Arc&rsquo;s real public/private split is exactly why netting matters — it keeps per-user flow off the public venue.</p>
      </div>

      {/* Live */}
      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:16px")}>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:9px")}>
          <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Current batch</span>
          <div style={css("display:flex;align-items:center;gap:10px")}><span style={css("width:9px;height:9px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} /><span style={css("font:800 28px var(--display);color:var(--ink)")}>#{market.currentBatch.toString()}</span></div>
        </div>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:9px")}>
          <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Dispatch in</span>
          <span style={css("font:800 28px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{mmss(dispatchIn)}</span>
        </div>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:9px")}>
          <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Window</span>
          <span style={css("font:800 28px var(--display);color:var(--ink)")}>{market.batchWindow}s</span>
        </div>
      </div>

      {/* Recent batches table */}
      <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
        <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:12px")}>
          <span style={css("display:inline-flex;align-items:center;gap:9px;font:750 15px var(--display);color:var(--ink)")}><TokenIcon token={asset.symbol} size={20} />Recent batches · {asset.symbol}<span style={css("display:inline-flex;align-items:center;gap:5px;font:600 11px var(--display);color:var(--ink-3)")}><VenueLogo logoKey={venue.logoKey} size={15} />{venue.name}</span></span>
          <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>read from BatchExecuted on Arc — your real batch state</span>
        </div>
        <div style={css("display:grid;grid-template-columns:70px 1fr 130px 110px;gap:8px;padding:0 4px 10px;border-bottom:1px solid var(--line);font:650 10.5px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>
          <span>Batch</span><span>Direction</span><span style={css("text-align:right")}>Net crossed</span><span style={css("text-align:right")}>Share price</span>
        </div>
        {rows.length === 0 ? (
          <div style={css("padding:26px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>Batches appear here as the keeper dispatches them.</div>
        ) : (
          rows.slice(0, 8).map((r: BatchRow) => {
            const d = dirLabel(r.netDirection);
            return (
              <div key={r.batchId.toString()} style={css("display:grid;grid-template-columns:70px 1fr 130px 110px;gap:8px;padding:12px 4px;border-bottom:1px solid var(--line);align-items:center")}>
                <span style={css("font:700 13px var(--mono);color:var(--ink)")}>#{r.batchId.toString()}</span>
                <span style={cssm(`justify-self:start;font:650 11.5px var(--display);padding:3px 10px;border-radius:999px;color:${d.c};background:${d.bg}`)}>{d.t}</span>
                <span style={css("text-align:right;font:700 13.5px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{r.netDirection === 0 ? "—" : fmtUnits(r.netAmount, asset.decimals)}</span>
                <span style={css("text-align:right;font:600 13px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{(Number(r.sharePrice) / 1e6).toFixed(4)}</span>
              </div>
            );
          })
        )}
        <a href={`${EXPLORER}/address/${venue.router}`} target="_blank" rel="noreferrer" style={css("display:inline-block;margin-top:12px;font:600 12px var(--display);color:#8a6d00;text-decoration:none")}>View all batches on Arcscan →</a>
      </div>
    </div>
  );
}
