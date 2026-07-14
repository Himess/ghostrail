// Token + venue logos — all inline SVG, fully self-contained (no external URLs / no network).
// Each asset family (USDC, WETH, WBTC, EURC, USTB) gets a clean, recognizable mark; confidential tokens
// (cUSDC / csUSDC …) carry a gold shield-lock badge marking a shielded/private balance.

type Family = "usdc" | "weth" | "wbtc" | "eurc" | "ustb" | "generic";

// Map any token label (underlying "USDC" / confidential "cUSDC" / share "csUSDC") to its asset family.
function familyFor(token: string): Family {
  const t = token.toLowerCase();
  if (t.includes("usdc")) return "usdc";
  if (t.includes("ustb")) return "ustb";
  if (t.includes("eurc") || t.includes("eur")) return "eurc";
  if (t.includes("weth") || t.includes("eth")) return "weth";
  if (t.includes("wbtc") || t.includes("btc")) return "wbtc";
  if (t.includes("usd")) return "usdc";
  return "generic";
}

// A shielded/private token: the vault share (cs-prefix, e.g. csUSDC) or a confidential c-token (cUSDC).
function isConfidential(token: string): boolean {
  if (token.startsWith("cs")) return true; // confidential share (csUSDC)
  return token.length > 1 && token[0] === "c" && token[1] === token[1].toUpperCase() && token[1] !== token[1].toLowerCase();
}

function UsdcLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.5 18.6c0-2.35-1.42-3.16-4.25-3.5-2.02-.27-2.43-.8-2.43-1.74 0-.94.68-1.55 2.02-1.55 1.22 0 1.89.4 2.23 1.42.07.2.27.34.48.34h1.08c.27 0 .48-.2.48-.48v-.07c-.27-1.49-1.49-2.64-3.05-2.78V8.5c0-.27-.2-.48-.54-.54h-1.01c-.27 0-.48.2-.54.54v1.42c-2.02.27-3.31 1.62-3.31 3.3 0 2.23 1.35 3.1 4.18 3.44 1.89.34 2.5.74 2.5 1.82 0 1.08-.94 1.82-2.23 1.82-1.76 0-2.36-.74-2.57-1.76-.07-.27-.27-.4-.48-.4h-1.15c-.27 0-.48.2-.48.48v.07c.27 1.69 1.35 2.9 3.58 3.24v1.42c0 .27.2.48.54.54h1.01c.27 0 .48-.2.54-.54v-1.42c2.02-.34 3.38-1.76 3.38-3.58z"
        fill="#fff"
      />
      <path
        d="M12.6 25.5c-5.25-1.89-7.95-7.75-5.99-12.93 1.01-2.84 3.24-5 5.99-6.01.27-.14.4-.34.4-.68v-.94c0-.27-.13-.47-.4-.54-.07 0-.2 0-.27.07-6.4 2.02-9.9 8.83-7.88 15.23 1.21 3.78 4.11 6.68 7.88 7.89.27.14.54-.07.61-.34.07-.07.07-.13.07-.27v-.94c0-.2-.2-.4-.41-.54zm6.87-20.83c-.27-.14-.54.07-.61.34-.07.07-.07.13-.07.27v.94c0 .27.2.47.41.61 5.25 1.89 7.95 7.75 5.99 12.93-1.01 2.84-3.24 5-5.99 6.01-.27.14-.4.34-.4.68v.94c0 .27.13.47.4.54.07 0 .2 0 .27-.07 6.4-2.02 9.9-8.83 7.88-15.23-1.21-3.85-4.18-6.75-7.88-7.96z"
        fill="#fff"
      />
    </svg>
  );
}

// Ether — the canonical ETH diamond, white on WETH violet.
function WethLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <g fill="#fff">
        <path fillOpacity=".6" d="M16.5 4v8.87l7.5 3.35z" />
        <path d="M16.5 4 9 16.22l7.5-3.35z" />
        <path fillOpacity=".6" d="M16.5 21.97v6.03L24 17.62z" />
        <path d="M16.5 28v-6.03L9 17.62z" />
        <path fillOpacity=".2" d="M16.5 20.57l7.5-4.35-7.5-3.35z" />
        <path fillOpacity=".6" d="M9 16.22l7.5 4.35v-7.7z" />
      </g>
    </svg>
  );
}

// Bitcoin — white ₿ on the WBTC orange.
function WbtcLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        fill="#fff"
        d="M22.5 14.09c.29-1.93-1.18-2.97-3.19-3.66l.65-2.62-1.59-.4-.64 2.55c-.42-.1-.85-.2-1.28-.29l.64-2.57-1.59-.4-.65 2.62c-.35-.08-.69-.16-1.02-.24v-.01l-2.2-.55-.42 1.7s1.18.27 1.16.29c.65.16.76.59.74.93l-.74 2.98c.04.01.1.03.17.05l-.17-.04-1.04 4.18c-.08.2-.28.49-.73.38.02.02-1.16-.29-1.16-.29l-.79 1.82 2.08.52c.39.1.76.2 1.14.29l-.66 2.65 1.59.4.65-2.62c.43.12.86.23 1.27.33l-.65 2.6 1.59.4.66-2.64c2.72.51 4.76.31 5.62-2.15.69-1.98-.03-3.12-1.46-3.87 1.04-.24 1.83-.92 2.04-2.33zm-3.65 5.11c-.49 1.98-3.83.91-4.91.64l.88-3.51c1.08.27 4.55.8 4.03 2.87zm.49-5.14c-.45 1.8-3.22.89-4.12.66l.79-3.19c.9.22 3.8.64 3.33 2.53z"
      />
    </svg>
  );
}

// Euro Coin — a clean € on the EURC blue.
function EurcLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#1C4CE0" />
      <g stroke="#fff" strokeWidth="2.15" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.4 11.6 A7 7 0 1 0 20.4 20.4" />
        <path d="M8.8 14.4 H17.6" />
        <path d="M8.4 17.8 H17.2" />
      </g>
    </svg>
  );
}

// Tokenized Treasury — a classical treasury / bank building, white on treasury green.
function UstbLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#1C8F5A" />
      <g fill="#fff">
        <path d="M16 6.4 26.4 12.2 H5.6 z" />
        <rect x="5.8" y="12.3" width="20.4" height="1.7" rx="0.4" />
        <rect x="7.4" y="14.4" width="2.4" height="6.6" rx="0.3" />
        <rect x="12.2" y="14.4" width="2.4" height="6.6" rx="0.3" />
        <rect x="17.4" y="14.4" width="2.4" height="6.6" rx="0.3" />
        <rect x="22.2" y="14.4" width="2.4" height="6.6" rx="0.3" />
        <rect x="5.6" y="21.3" width="20.8" height="2.3" rx="0.6" />
      </g>
    </svg>
  );
}

// Fallback — a dark chip with the token's accent initial (unknown asset).
function GenericLogo({ s, token }: { s: number; token: string }) {
  const letter = token.replace(/^cs?/, "").charAt(0).toUpperCase() || "?";
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#171512" />
      <text x="16" y="21" fontSize="14" fontWeight="800" fill="#ffd208" textAnchor="middle" fontFamily="ui-monospace, monospace">
        {letter}
      </text>
    </svg>
  );
}

function AssetLogo({ family, token, s }: { family: Family; token: string; s: number }) {
  switch (family) {
    case "usdc": return <UsdcLogo s={s} />;
    case "weth": return <WethLogo s={s} />;
    case "wbtc": return <WbtcLogo s={s} />;
    case "eurc": return <EurcLogo s={s} />;
    case "ustb": return <UstbLogo s={s} />;
    default: return <GenericLogo s={s} token={token} />;
  }
}

// Small private badge (bottom-right): a shield-lock, marking a shielded/private balance.
function ConfBadge({ s }: { s: number }) {
  const b = Math.max(9, Math.round(s * 0.44));
  return (
    <span
      style={{
        position: "absolute",
        right: -Math.round(b * 0.18),
        bottom: -Math.round(b * 0.18),
        width: b,
        height: b,
        borderRadius: "50%",
        background: "#1b1712",
        border: `${Math.max(1, Math.round(s / 16))}px solid var(--surface)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title="Private balance — readable only by the owner (shielded on-chain under APS once live)"
    >
      <svg width={Math.round(b * 0.58)} height={Math.round(b * 0.58)} viewBox="0 0 24 24" fill="none" stroke="#ffd208" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="11" width="14" height="9" rx="2.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
}

export function TokenIcon({ token, size = 24 }: { token: string; size?: number }) {
  const family = familyFor(token);
  const conf = isConfidential(token);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", flex: "none", lineHeight: 0 }}>
      <AssetLogo family={family} token={token} s={size} />
      {conf && <ConfBadge s={size} />}
    </span>
  );
}

// Overlapping pair (in-token over out-token).
export function TokenDuo({ coll, borrow, size = 34 }: { coll: string; borrow: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flex: "none" }}>
      <span style={{ position: "relative", zIndex: 2 }}>
        <TokenIcon token={coll} size={size} />
      </span>
      <span style={{ marginLeft: -Math.round(size * 0.32) }}>
        <TokenIcon token={borrow} size={size} />
      </span>
    </span>
  );
}

// ---- Venue logos (public lending venue a market routes into) ----
// Self-contained inline SVG, selected by `logoKey`. Morpho → blue monogram badge; Aave → purple ghost badge.

function MorphoLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect width="24" height="24" rx="6.5" fill="#2C64F6" />
      <path fill="#fff" d="M6 17.4V9.5c0-1 1.15-1.5 1.85-.82L12 11.9l4.15-3.22c.7-.68 1.85-.18 1.85.82v7.9h-2.3v-5.2L12 14.85 8.3 12.2v5.2H6z" />
    </svg>
  );
}

function AaveLogo({ s }: { s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect width="24" height="24" rx="6.5" fill="#9457C9" />
      <g transform="translate(4.8 3.6) scale(0.6)">
        <path d="M12 2C6.48 2 2 6.48 2 12v11.4c0 1.3 1.5 2 2.5 1.1L6.6 22c.5-.5 1.4-.5 2 0l1.4 1.3c.6.5 1.4.5 2 0l1.4-1.3c.5-.5 1.4-.5 2 0l2.1 1.5c1 .9 2.5.2 2.5-1.1V12C22 6.48 17.52 2 12 2Z" fill="#fff" />
        <circle cx="9" cy="12" r="1.55" fill="#9457C9" />
        <circle cx="15" cy="12" r="1.55" fill="#9457C9" />
      </g>
    </svg>
  );
}

export function VenueLogo({ logoKey, size = 20 }: { logoKey: "morpho" | "aave"; size?: number }) {
  return (
    <span style={{ display: "inline-flex", flex: "none", lineHeight: 0 }}>
      {logoKey === "morpho" ? <MorphoLogo s={size} /> : <AaveLogo s={size} />}
    </span>
  );
}

// A small chip shown where a venue is curated (e.g. a Morpho vault curated by Steakhouse).
export function CuratorChip({ curator }: { curator: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "999px",
      background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-2)",
      font: "600 10.5px var(--display)", whiteSpace: "nowrap",
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
        <path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 7.7l5.4-.8z" />
      </svg>
      Curated · {curator}
    </span>
  );
}
