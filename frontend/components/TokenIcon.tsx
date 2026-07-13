// Token logos (inline SVG, self-contained — no external assets) + a gold "private" shield badge for the
// shielded tokens (cUSDC, and the vault share csGHR). GhostRail tokens: USDC · cUSDC · csGHR.

type Base = "usdc" | "generic";

function baseFor(token: string): Base {
  const t = token.toLowerCase();
  if (t.includes("usdc") || t.includes("usd")) return "usdc";
  return "generic";
}

// A shielded/private token: the vault share (cs-prefix, e.g. csGHR) or a confidential c-token (cUSDC).
function isConfidential(token: string): boolean {
  if (token.startsWith("cs")) return true; // confidential share (csGHR)
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

// GhostRail vault share (csGHR) + any other non-USDC token — a dark chip with the accent initial.
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
  const base = baseFor(token);
  const conf = isConfidential(token);
  return (
    <span style={{ position: "relative", width: size, height: size, display: "inline-flex", flex: "none", lineHeight: 0 }}>
      {base === "usdc" ? <UsdcLogo s={size} /> : <GenericLogo s={size} token={token} />}
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
