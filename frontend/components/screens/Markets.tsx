"use client";
import { css, cssm } from "@/lib/css";
import { useNav } from "@/lib/nav";
import { TokenIcon, VenueLogo, CuratorChip } from "@/components/TokenIcon";
import { WhatsPrivate } from "@/components/Privacy";
import { useAllMarkets } from "@/lib/hooks";
import { ASSET_LIST, type AssetMeta, type VenueMeta } from "@/lib/markets";
import { fmtUnits } from "@/lib/format";

function Badge({ simulated }: { simulated: boolean }) {
  if (!simulated)
    return (
      <span style={css("display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:var(--green-bg);border:1px solid #bfe3cf;color:#1c7a4f;font:700 10px var(--display);letter-spacing:.04em")}>
        <span style={css("width:6px;height:6px;border-radius:50%;background:var(--green);animation:beat 1.7s ease-in-out infinite")} />LIVE
      </span>
    );
  return (
    <span style={css("display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#fbf1dc;border:1px solid #f0d97a;color:#8a6d00;font:650 10px var(--display);letter-spacing:.02em")}>
      Preview · simulated
    </span>
  );
}

const ExternalArrow = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
);

// One venue a given asset routes into (Morpho / Aave). Clicking routes to Earn with this (asset, venue) bound.
function VenueRow({ symbol, v }: { symbol: string; v: VenueMeta }) {
  const { openVenue } = useNav();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openVenue(symbol, v.name)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openVenue(symbol, v.name); } }}
      style={css("display:flex;flex-direction:column;gap:9px;padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2);cursor:pointer")}
    >
      <div style={css("display:flex;align-items:center;gap:9px")}>
        <VenueLogo logoKey={v.logoKey} size={22} />
        <span style={css("font:700 13px var(--display);color:var(--ink)")}>{v.name}</span>
        <div style={css("flex:1")} />
        <Badge simulated={v.simulated} />
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`Open ${v.name}`}
          style={css("display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink-2);flex:none")}
        >
          <ExternalArrow />
        </a>
      </div>
      <div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
        <span style={css("display:inline-flex;align-items:baseline;gap:5px")}>
          <span style={css("font:800 18px var(--display);letter-spacing:-.01em;color:var(--ink);font-variant-numeric:tabular-nums")}>{v.apy}</span>
          <span style={css("font:650 9.5px var(--display);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)")}>Supply APY</span>
        </span>
        <span style={css("width:1px;height:16px;background:var(--line)")} />
        <span style={css("display:inline-flex;align-items:baseline;gap:5px")}>
          <span style={css("font:700 13.5px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{v.tvl}</span>
          <span style={css("font:650 9.5px var(--display);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)")}>TVL</span>
        </span>
        <div style={css("flex:1")} />
        {v.curator && <CuratorChip curator={v.curator} />}
      </div>
    </div>
  );
}

function AssetCard({ m, tvl }: { m: AssetMeta; tvl: bigint }) {
  return (
    <div style={css("position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:22px 22px 18px;display:flex;flex-direction:column;gap:16px;box-shadow:0 1px 2px rgba(20,18,12,.04),0 10px 30px rgba(20,18,12,.03)")}>
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
        <div style={css("display:flex;flex-direction:column;align-items:flex-end;gap:3px")}>
          <span style={css("font:650 9.5px var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)")}>Confidential TVL</span>
          <span style={css("font:700 15px var(--mono);color:var(--ink-2);font-variant-numeric:tabular-nums")}>{fmtUnits(tvl, m.decimals, { compact: true })} <span style={css("font:600 10.5px var(--display);color:var(--ink-3)")}>{m.underlyingSymbol}</span></span>
        </div>
      </div>

      {/* venues */}
      <div style={css("display:flex;align-items:center;gap:8px")}>
        <span style={css("font:650 10px var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)")}>Route via</span>
        <span style={css("height:1px;flex:1;background:var(--line)")} />
      </div>
      <div style={css("display:flex;flex-direction:column;gap:10px")}>
        {m.venues.map((v) => <VenueRow key={v.name} symbol={m.symbol} v={v} />)}
      </div>
    </div>
  );
}

export function Markets() {
  const { bySymbol } = useAllMarkets();
  const venues = ASSET_LIST.flatMap((a) => a.venues);
  const liveCount = venues.filter((v) => !v.simulated).length;
  const simCount = venues.length - liveCount;

  return (
    <div style={css("max-width:1200px;width:100%")}>
      <div style={css("display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap")}>
        <div style={css("max-width:660px")}>
          <h1 style={css("margin:0;font:800 40px/1.02 var(--display);letter-spacing:-.03em;color:var(--ink)")}>Markets</h1>
          <p style={css("margin:11px 0 0;font:400 16.5px/1.5 var(--display);color:var(--ink-2)")}>Earn the same yield as public lending venues, but keep your position private. One confidential layer over {ASSET_LIST.length} assets — each routes to Morpho and Aave, and deposits pool &amp; net before they ever touch the public venue.</p>
        </div>
        <WhatsPrivate />
      </div>
      <div style={css("height:1px;background:var(--line);margin:22px 0 26px")} />

      <div style={css("display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px")}>
        {ASSET_LIST.map((m) => (
          <AssetCard key={m.symbol} m={m} tvl={bySymbol[m.symbol]?.totalAssets ?? 0n} />
        ))}
      </div>

      <div style={css("display:flex;align-items:flex-start;gap:11px;background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-top:20px")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none;margin-top:1px")}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        <p style={css("margin:0;font:400 12.5px/1.6 var(--display);color:var(--ink-3)")}>
          <b style={css("color:var(--ink-2);font-weight:700")}>Preview · simulating an Arc-mainnet deployment against Morpho / Aave — not affiliated with Morpho, Aave, or Steakhouse.</b> On Arc testnet the venues are mocks and APYs are illustrative. Only the <b style={css("color:var(--ink-2);font-weight:700")}>USDC · Morpho</b> market wraps <b style={css("color:var(--ink-2);font-weight:700")}>real</b> Arc testnet USDC ({liveCount} live · {simCount} simulated).
        </p>
      </div>
    </div>
  );
}
