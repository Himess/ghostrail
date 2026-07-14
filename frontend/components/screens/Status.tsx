"use client";
import { css, cssm } from "@/lib/css";
import { useConfToken, useLedger, useMarket, useAllMarkets, useNowSec } from "@/lib/hooks";
import { compact, fmtUnits, mmss } from "@/lib/format";
import { TokenIcon } from "@/components/TokenIcon";
import { ASSET_LIST } from "@/lib/markets";
import { EXPLORER, USDC_ASSET } from "@/lib/addresses";

const USDC_VENUE = USDC_ASSET.venues[0]; // live (USDC, Morpho) — the market whose keeper/solvency Status shows

function Card({ children }: { children: React.ReactNode }) {
  return <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>{children}</div>;
}
const Label = ({ t }: { t: string }) => <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>{t}</span>;

function Node({ state, label, sub }: { state: "done" | "active" | "todo"; label: string; sub?: string }) {
  const c = state === "done" ? "var(--green)" : state === "active" ? "var(--amber)" : "var(--ink-3)";
  const bg = state === "done" ? "var(--green-bg)" : state === "active" ? "#fdf3d9" : "var(--surface-2)";
  return (
    <div style={css("display:flex;align-items:center;gap:12px")}>
      <span style={css(`width:11px;height:11px;border-radius:50%;flex:none;background:${c}${state === "active" ? ";animation:beat 1.7s ease-in-out infinite" : ""}`)} />
      <span style={css("display:flex;flex-direction:column;gap:1px;flex:1")}>
        <span style={css("font:600 13.5px var(--display);color:var(--ink)")}>{label}</span>
        {sub && <span style={css("font:400 12px var(--display);color:var(--ink-3)")}>{sub}</span>}
      </span>
      <span style={css(`font:650 10.5px var(--display);letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:${c};background:${bg}`)}>{state}</span>
    </div>
  );
}

export function Status() {
  const usdc = useConfToken(USDC_ASSET.cToken);
  const ledger = useLedger();
  const market = useMarket(USDC_VENUE);
  const { bySymbol } = useAllMarkets();
  const now = useNowSec();
  const dispatchIn = market.dispatchableInAt(now);
  const routerSolvent = market.solvency ? market.solvency.backingAssets >= (market.totalShares > 0n ? market.totalAssets : 0n) : true;
  const ledgerSolvent = ledger.solvency ? ledger.solvency.backing >= ledger.solvency.internalSum : true;

  return (
    <div style={css("max-width:1100px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Status</h1>
          <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>The machinery, made visible — keeper, batch execution and solvency, on Arc.</p>
        </div>
        <span style={css("display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:650 12px var(--display)")}><span style={css("width:8px;height:8px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />Live on Arc testnet</span>
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px")}>
        <Card>
          <Label t="GhostGate batch · USDC" />
          <div style={css("display:flex;align-items:baseline;gap:8px")}><span style={css("font:800 30px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>#{market.currentBatch.toString()}</span></div>
          <span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>dispatch in {mmss(dispatchIn)} · window {market.batchWindow}s</span>
        </Card>
        <Card>
          <Label t="cUSDC supply" />
          <div style={css("display:flex;align-items:baseline;gap:7px")}><span style={css("font:800 30px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{usdc.totalShielded != null ? compact(Number(usdc.totalShielded) / 1e6) : "—"}</span><span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>cUSDC</span></div>
          <span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>total shielded (public aggregate)</span>
        </Card>
        <Card>
          <Label t="USDC vault solvency" />
          <div style={css("display:flex;align-items:baseline;gap:7px")}><span style={css("font:750 24px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{fmtUnits(market.totalAssets, USDC_ASSET.decimals, { compact: true })}</span><span style={css("font:600 12px var(--mono);color:var(--ink-3)")}>backing</span></div>
          <span style={css(`display:inline-flex;align-items:center;gap:6px;font:400 12.5px var(--display);color:var(--ink-3)`)}><span style={css(`width:7px;height:7px;border-radius:50%;background:${routerSolvent ? "var(--green)" : "var(--red)"}`)} />{market.totalShares.toString()} shares · {routerSolvent ? "solvent" : "review"}</span>
        </Card>
        <Card>
          <Label t="Ledger solvency" />
          <div style={css("display:flex;align-items:baseline;gap:7px")}><span style={css("font:750 24px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{ledger.solvency ? fmtUnits(ledger.solvency.internalSum, 6, { compact: true }) : "—"}</span><span style={css("font:600 12px var(--mono);color:var(--ink-3)")}>internal</span></div>
          <span style={css(`display:inline-flex;align-items:center;gap:6px;font:400 12.5px var(--display);color:var(--ink-3)`)}><span style={css(`width:7px;height:7px;border-radius:50%;background:${ledgerSolvent ? "var(--green)" : "var(--red)"}`)} />{ledger.solvency ? fmtUnits(ledger.solvency.backing, 6, { compact: true }) : "—"} backing · {ledgerSolvent ? "solvent" : "review"}</span>
        </Card>
      </div>

      {/* per-market solvency strip */}
      <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
        <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:6px")}>
          <span style={css("font:750 15px var(--display);color:var(--ink)")}>Markets solvency</span>
          <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>public aggregates — per market, no individual position revealed</span>
        </div>
        <div style={css("display:grid;grid-template-columns:1fr 120px 120px 90px;gap:8px;padding:0 4px 10px;border-bottom:1px solid var(--line);font:650 10.5px var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)")}>
          <span>Market</span><span style={css("text-align:right")}>Backing (TVL)</span><span style={css("text-align:right")}>Shares</span><span style={css("text-align:right")}>State</span>
        </div>
        {ASSET_LIST.map((a) => {
          const agg = bySymbol[a.symbol] ?? { totalAssets: 0n, totalShares: 0n };
          return (
            <div key={a.symbol} style={css("display:grid;grid-template-columns:1fr 120px 120px 90px;gap:8px;padding:12px 4px;border-bottom:1px solid var(--line);align-items:center")}>
              <span style={css("display:inline-flex;align-items:center;gap:9px;font:650 13px var(--display);color:var(--ink)")}><TokenIcon token={a.symbol} size={22} />{a.symbol}</span>
              <span style={css("text-align:right;font:700 13px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums")}>{fmtUnits(agg.totalAssets, a.decimals, { compact: true })}</span>
              <span style={css("text-align:right;font:600 13px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{agg.totalShares.toString()}</span>
              <span style={cssm("justify-self:end;font:650 10.5px var(--display);padding:3px 9px;border-radius:999px", a.live ? { color: "#1c7a4f", background: "var(--green-bg)" } : { color: "#8a6d00", background: "#fbf1dc" })}>{a.live ? "live" : "sim"}</span>
            </div>
          );
        })}
      </div>

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px")}>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;flex-direction:column;gap:2px")}><h3 style={css("margin:0;font:750 17px var(--display);color:var(--ink)")}>Batch pipeline</h3><span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>how a market batch settles</span></div>
          <div style={css("display:flex;flex-direction:column;gap:15px")}>
            <Node state="done" label="Queue" sub="deposits & withdrawals join the open batch (confidential)" />
            <Node state={dispatchIn > 0 ? "active" : "done"} label="Window" sub={dispatchIn > 0 ? `open · dispatch in ${mmss(dispatchIn)}` : "closed · ready to execute"} />
            <Node state="todo" label="Execute → net crosses" sub="permissionless keeper; only the NET touches the public venue" />
            <Node state="todo" label="Pull" sub="users claim their own shares / underlying" />
          </div>
        </div>
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;flex-direction:column;gap:2px")}><h3 style={css("margin:0;font:750 17px var(--display);color:var(--ink)")}>Confidentiality substrate</h3><span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>what enforces privacy — honestly</span></div>
          <div style={css("display:flex;flex-direction:column;gap:15px")}>
            <Node state="done" label="Protocol logic" sub="markets, vault, netting, solvency — live on Arc" />
            <Node state="done" label="USDC integration" sub="real Arc testnet USDC (0x3600…0000)" />
            <Node state="active" label="APS enclave" sub="Arc Privacy Sector not yet live — privacy is notional on this preview" />
            <Node state="todo" label="Remote attestation" sub="enclave measurement + view-key enforcement (arrives with APS)" />
          </div>
          <a href={`${EXPLORER}/address/${USDC_VENUE.router}`} target="_blank" rel="noreferrer" style={css("font:600 12.5px var(--display);color:#8a6d00;text-decoration:none")}>View the USDC router on Arcscan →</a>
        </div>
      </div>
    </div>
  );
}
