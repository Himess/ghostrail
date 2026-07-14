"use client";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { useConfToken, useLedger, useMarket, useAllMarkets, useNowSec } from "@/lib/hooks";
import { compact, fmtUnits, mmss } from "@/lib/format";
import { WhatsPrivate } from "@/components/Privacy";
import { TokenIcon } from "@/components/TokenIcon";
import { ASSET_LIST } from "@/lib/markets";
import { USDC_ASSET } from "@/lib/addresses";

const PrivateBadge = () => (
  <span style={css("display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;background:#f5f3ec;border:1px solid var(--line);color:var(--ink-2);font:600 11.5px var(--display)")}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
    Private by design
  </span>
);

function Card({ children }: { children: React.ReactNode }) {
  return <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>{children}</div>;
}
const Label = ({ t }: { t: string }) => <span style={css("font:650 11px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>{t}</span>;

export function Dashboard() {
  const { go, openMarket } = useNav();
  const usdc = useConfToken(USDC_ASSET.cToken);
  const market = useMarket(USDC_ASSET.venues[0]);
  const ledger = useLedger();
  const { bySymbol } = useAllMarkets();
  const now = useNowSec();
  const dispatchIn = market.dispatchableInAt(now);
  const solvent = ledger.solvency ? ledger.solvency.backing >= ledger.solvency.internalSum : true;

  // TVL across assets normalized to whole underlying units (assets have different decimals + underlyings).
  const tvlNorm = ASSET_LIST.reduce((acc, a) => acc + Number(bySymbol[a.symbol]?.totalAssets ?? 0n) / 10 ** a.decimals, 0);
  const liveCount = ASSET_LIST.filter((a) => a.live).length;
  const simCount = ASSET_LIST.length - liveCount;

  return (
    <div style={css("max-width:1200px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Dashboard</h1>
          <p style={css("margin:9px 0 0;font:400 16px var(--display);color:var(--ink-2)")}>Private lending on Arc — earn venue yield, keep your position private.</p>
        </div>
        <PrivateBadge />
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px")}>
        <Card>
          <div style={css("display:flex;align-items:center;justify-content:space-between")}>
            <Label t="Confidential TVL" />
            <span style={css("width:26px;height:26px;border-radius:50%;background:#f5f3ec;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--ink-2)")}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg></span>
          </div>
          <div style={css("display:flex;align-items:baseline;gap:7px;min-width:0")}>
            <span style={css("font:800 31px var(--display);letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums")}>{compact(tvlNorm)}</span>
            <span style={css("font:600 13px var(--display);color:var(--ink-3)")}>units</span>
          </div>
          <span style={css("font:400 12px/1.45 var(--display);color:var(--ink-3)")}>pooled across {ASSET_LIST.length} assets · normalized to whole underlying units</span>
        </Card>
        <Card>
          <Label t="Markets" />
          <div style={css("display:flex;align-items:baseline;gap:7px")}>
            <span style={css("font:750 32px var(--display);letter-spacing:-.02em;color:var(--ink);line-height:1;font-variant-numeric:tabular-nums")}>{ASSET_LIST.length}</span>
            <span style={css("font:600 13px var(--display);color:var(--ink-3)")}>assets</span>
          </div>
          <span style={css("display:inline-flex;align-items:center;gap:9px;font:400 12.5px var(--display);color:var(--ink-3)")}>
            <span style={css("display:inline-flex;align-items:center;gap:5px")}><span style={css("width:7px;height:7px;border-radius:50%;background:var(--green)")} />{liveCount} live</span>
            <span style={css("display:inline-flex;align-items:center;gap:5px")}><span style={css("width:7px;height:7px;border-radius:50%;background:var(--amber)")} />{simCount} simulated</span>
          </span>
        </Card>
        <Card>
          <Label t="GhostGate · USDC" />
          <div style={css("display:flex;align-items:center;gap:11px")}>
            <span style={css("width:10px;height:10px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />
            <span style={css("font:750 26px var(--display);letter-spacing:-.02em;color:var(--ink);line-height:1")}>#{market.currentBatch.toString()}</span>
          </div>
          <span style={css("font:400 12.5px var(--display);color:var(--ink-3)")}>batch open · dispatch in {mmss(dispatchIn)}</span>
        </Card>
        <Card>
          <Label t="Payment ledger" />
          <div style={css("display:flex;align-items:baseline;gap:7px")}>
            <span style={css("font:750 32px var(--display);letter-spacing:-.01em;color:var(--ink);line-height:1;font-variant-numeric:tabular-nums")}>{ledger.totalLedgerBalance != null ? compact(Number(ledger.totalLedgerBalance) / 1e6) : "—"}</span>
            <span style={css("font:600 13px var(--mono);color:var(--ink-3)")}>cUSDC</span>
          </div>
          <span style={css("display:inline-flex;align-items:center;gap:6px;font:400 12.5px var(--display);color:var(--ink-3)")}><span style={css(`width:7px;height:7px;border-radius:50%;background:${solvent ? "var(--green)" : "var(--red)"}`)} />secondary module · {solvent ? "fully backed" : "under review"}</span>
        </Card>
      </div>

      <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px")}>
        <div style={css("position:relative;overflow:hidden;background:var(--panel);border:1px solid #2a2621;border-radius:22px;padding:32px 34px;color:#f3f1ec;display:flex;flex-direction:column;gap:16px")}>
          <svg width="230" height="250" viewBox="0 0 24 26" fill="none" style={css("position:absolute;right:-30px;bottom:-52px;opacity:.05;animation:floaty 6s ease-in-out infinite")}><path d="M12 2C6.48 2 2 6.48 2 12v11.4c0 1.3 1.5 2 2.5 1.1L6.6 22c.5-.5 1.4-.5 2 0l1.4 1.3c.6.5 1.4.5 2 0l1.4-1.3c.5-.5 1.4-.5 2 0l2.1 1.5c1 .9 2.5.2 2.5-1.1V12C22 6.48 17.52 2 12 2Z" fill="#fff"/></svg>
          <span style={css("display:inline-flex;align-items:center;gap:7px;align-self:flex-start;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#e9e6df;font:600 11px var(--display);letter-spacing:.02em")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
            Private by design
          </span>
          <h2 style={css("margin:2px 0 0;font:800 27px/1.14 var(--display);letter-spacing:-.02em;max-width:20ch")}>Earn the same yield as public lending venues — privately.</h2>
          <p style={css("margin:0;font:400 15px/1.6 var(--display);color:#b7b2a8;max-width:46ch")}>Your position size and activity are private by design — enforced by Arc&rsquo;s Privacy Sector (APS). Deposits pool and net before they ever touch the public venue. On this testnet preview, only you can read your own values in-app.</p>
          <div style={css("display:flex;gap:10px;margin-top:6px;flex-wrap:wrap")}>
            <button onClick={() => go("markets")} style={css("display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,#ffdf5c,#ffd208);color:#1a1a1a;border:1px solid rgba(0,0,0,.06);border-radius:999px;padding:12px 20px;font:700 14px var(--display);cursor:pointer;box-shadow:0 5px 16px rgba(255,210,8,.32)")}>Explore markets →</button>
            <button onClick={() => go("ghostgate")} style={css("background:rgba(255,255,255,.06);color:#e9e6df;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:12px 18px;font:600 14px var(--display);cursor:pointer")}>See how netting works</button>
          </div>
          <div style={css("margin-top:4px")}><WhatsPrivate /></div>
        </div>

        {/* per-market APY list */}
        <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px 22px;display:flex;flex-direction:column;gap:4px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
          <div style={css("display:flex;align-items:center;justify-content:space-between;margin-bottom:8px")}>
            <h3 style={css("margin:0;font:750 17px var(--display);letter-spacing:-.01em;color:var(--ink)")}>Markets</h3>
            <button onClick={() => go("markets")} style={css("font:600 12px var(--display);color:#8a6d00;background:none;border:none;cursor:pointer")}>View all →</button>
          </div>
          {ASSET_LIST.map((a) => {
            const v = a.venues[0]; // primary venue (Morpho) represents the asset in this compact list
            return (
              <button key={a.symbol} onClick={() => openMarket(a.symbol)} style={css("display:flex;align-items:center;gap:12px;background:none;border:none;text-align:left;cursor:pointer;padding:10px 8px;border-radius:12px;border-bottom:1px solid var(--line)")}>
                <TokenIcon token={a.symbol} size={30} />
                <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}>
                  <span style={css("font:650 13.5px var(--display);color:var(--ink)")}>{a.label}</span>
                  <span style={css("font:400 11.5px var(--mono);color:var(--ink-3)")}>{fmtUnits(bySymbol[a.symbol]?.totalAssets ?? 0n, a.decimals, { compact: true })} {a.underlyingSymbol} · via {v.name}</span>
                </div>
                <div style={css("display:flex;flex-direction:column;align-items:flex-end;gap:3px")}>
                  <span style={css("font:750 15px var(--display);color:var(--ink);font-variant-numeric:tabular-nums")}>{v.apy}</span>
                  <span style={cssm("font:600 9.5px var(--display);letter-spacing:.04em;padding:2px 7px;border-radius:999px", a.live ? { color: "#1c7a4f", background: "var(--green-bg)" } : { color: "#8a6d00", background: "#fbf1dc" })}>{a.live ? "LIVE" : "SIM"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
