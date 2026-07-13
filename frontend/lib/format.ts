// Formatting helpers shared across screens.

export const DOTS = "••••••";

// 6-dec base-unit amounts (USDC / cUSDC / shares) → human string.
export function fmtUnits6(v: bigint | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v == null) return "—";
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  if (opts.compact) return compact(Number(v) / 1e6);
  const s = whole.toLocaleString("en-US");
  if (frac === 0n) return s;
  const f = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${s}.${f}`;
}

// Decimals-aware variant for the multi-market UI (each market stores its underlying's decimals).
// USDC-family markets are 6-dec; cWETH is 18-dec, cWBTC 8-dec. Displayed fraction is capped at 6 places
// so 18-dec amounts don't spray noise.
export function fmtUnits(v: bigint | null | undefined, decimals: number, opts: { compact?: boolean } = {}): string {
  if (v == null) return "—";
  const base = 10n ** BigInt(decimals);
  if (opts.compact) return compact(Number(v) / Number(base));
  const whole = v / base;
  const frac = v % base;
  const s = whole.toLocaleString("en-US");
  if (frac === 0n) return s;
  const f = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const capped = f.slice(0, Math.min(6, decimals));
  return capped ? `${s}.${capped}` : s;
}

// Parse a human decimal string into base units for the given decimals. Tolerant of commas/blank.
export function toUnits(s: string, decimals: number): bigint {
  if (!s) return 0n;
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return 0n;
  const [w, f = ""] = cleaned.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  } catch {
    return 0n;
  }
}

// compact 2.41M / 320 style used across the dashboard + payments.
export function compact(n: number): string {
  if (!isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  return Math.round(n).toLocaleString("en-US");
}

export function shortAddr(a?: string): string {
  if (!a) return "";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

// mm:ss countdown from a seconds value.
export function mmss(sec: number): string {
  if (sec <= 0 || !isFinite(sec)) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function pct(n: number, digits = 1): string {
  if (!isFinite(n)) return "0%";
  return n.toFixed(digits) + "%";
}

// Parse a human decimal string ("12.5") into 6-dec base units (12500000n). Tolerant of commas/blank.
export function toUnits6(s: string): bigint {
  if (!s) return 0n;
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned || cleaned === ".") return 0n;
  const [w, f = ""] = cleaned.split(".");
  const frac = (f + "000000").slice(0, 6);
  try {
    return BigInt(w || "0") * 1_000_000n + BigInt(frac || "0");
  } catch {
    return 0n;
  }
}

// Pull a readable reason out of a wagmi/viem write error (walks the common shapes).
export function errMsg(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; cause?: { shortMessage?: string } } | undefined;
  const m = any?.shortMessage || any?.cause?.shortMessage || any?.message || "Transaction failed";
  return m.length > 140 ? m.slice(0, 140) + "…" : m;
}
