"use client";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { TokenIcon } from "@/components/TokenIcon";
import { WhatsPrivate } from "@/components/Privacy";
import { useAllMarkets } from "@/lib/hooks";
import { MARKET_LIST, type MarketMeta } from "@/lib/markets";
import { fmtUnits } from "@/lib/format";

function Badge({ simulated }: { simulated: boolean }) {
  if (!simulated)
    return (
      <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:700 10.5px var(--display);letter-spacing:.04em")}>
        <span style={css("width:7px;height:7px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />LIVE
      </span>
    );
  return (
    <span style={css("display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:#fbf1dc;border:1px solid #f0d97a;color:#8a6d00;font:650 10.5px var(--display);letter-spacing:.02em")}>
      Preview · simulated
    </span>
  );
}

function MarketCard({ m, tvl }: { m: MarketMeta; tvl: bigint }) {
  const { openMarket } = useNav();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openMarket(m.symbol)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openMarket(m.symbol); } }}
      style={css("position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px 22px 18px;display:flex;flex-direction:column;gap:18px;cursor:pointer;box-shadow:0 1px 2px rgba(20,18,12,.04),0 10px 30px rgba(20,18,12,.03);transition:transform .12s ease")}
    >
      {/* category tint strip */}
      <span style={cssm(`position:absolute;left:0;top:0;height:3px;width:100%`, { background: m.tint })} />

      {/* header */}
      <div style={css("display:flex;align-items:center;gap:13px")}>
        <TokenIcon token={m.symbol} size={40} />
        <div style={css("display:flex;flex-direction:column;min-width:0")}>
          <span style={css("font:750 16px var(--display);color:var(--ink);letter-spacing:-.01em")}>{m.label}</span>
          <span style={css("font:600 12px var(--mono);color:var(--ink-3)")}>{m.symbol} · {m.underlyingSymbol}</span>
        </div>
        <div style={css("flex:1")} />
        <Badge simulated={m.simulated} />
      </div>

      {/* metrics */}
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:14px")}>
        <div style={css("display:flex;flex-direction:column;gap:4px")}>
          <span style={css("font:650 10.5px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Supply APY</span>
          <span style={css("font:800 32px var(--display);letter-spacing:-.02em;color:var(--ink);line-height:1;font-variant-numeric:tabular-nums")}>{m.apy}</span>
        </div>
        <div style={css("display:flex;flex-direction:column;gap:4px;align-items:flex-end")}>
          <span style={css("font:650 10.5px var(--display);letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)")}>Confidential TVL</span>
          <span style={css("font:700 16px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{fmtUnits(tvl, m.decimals, { compact: true })} <span style={css("font:600 11px var(--display);color:var(--ink-3)")}>{m.underlyingSymbol}</span></span>
        </div>
      </div>

      {/* footer */}
      <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:14px;border-top:1px solid var(--line)")}>
        <a
          href={m.venueUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={css("display:inline-flex;align-items:center;gap:6px;font:600 12px var(--display);color:var(--ink-2);text-decoration:none")}
        >
          via {m.venueName}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
        </a>
        <span style={css("display:inline-flex;align-items:center;gap:6px;font:700 12.5px var(--display);color:#8a6d00")}>
          Open market
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </div>
    </div>
  );
}

export function Markets() {
  const { bySymbol } = useAllMarkets();
  const liveCount = MARKET_LIST.filter((m) => !m.simulated).length;

  return (
    <div style={css("max-width:1200px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div style={css("max-width:640px")}>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Markets</h1>
          <p style={css("margin:11px 0 0;font:400 16.5px/1.5 var(--display);color:var(--ink-2)")}>Earn the same yield as public lending venues, but keep your position private. One confidential layer, {MARKET_LIST.length} asset markets — deposits pool and net before they ever touch the public venue.</p>
        </div>
        <WhatsPrivate />
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px")}>
        {MARKET_LIST.map((m) => (
          <MarketCard key={m.symbol} m={m} tvl={bySymbol[m.symbol]?.totalAssets ?? 0n} />
        ))}
      </div>

      <div style={css("display:flex;align-items:flex-start;gap:11px;background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-top:20px")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none;margin-top:1px")}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        <p style={css("margin:0;font:400 12.5px/1.6 var(--display);color:var(--ink-3)")}>
          <b style={css("color:var(--ink-2);font-weight:700")}>Preview.</b> This simulates an Arc-mainnet deployment routing into Morpho / Aave — GhostRail is not affiliated with either. On Arc testnet the venues are mocks and APYs are illustrative. Only the <b style={css("color:var(--ink-2);font-weight:700")}>USDC market</b> wraps <b style={css("color:var(--ink-2);font-weight:700")}>real</b> Arc testnet USDC ({liveCount} live · {MARKET_LIST.length - liveCount} simulated).
        </p>
      </div>
    </div>
  );
}
