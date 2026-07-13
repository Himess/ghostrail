"use client";
import { useState } from "react";
import { css } from "@/lib/css";

// The honest APS-preview disclosure (spec §4). GhostRail's confidentiality is enforced by Arc's Privacy
// Sector (APS), which is not yet live on Arc testnet — so today the app reveals your OWN values to you
// in-app and does not yet cryptographically shield on-chain data. We never claim otherwise.

const EyeIcon = ({ c = "currentColor" }: { c?: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
);
const LockIcon = ({ c = "currentColor" }: { c?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>
);

const PRIVATE = ["Individual balances", "Per-payment amount & counterparty", "Per-user vault shares", "Payment receipts (owner-only)"];
const PUBLIC = ["Shield / unshield amounts", "Aggregates (total shielded, total shares, venue position)", "The per-batch NET (direction + size)", "Your address & transaction timing"];

export function PrivacyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={css("position:fixed;inset:0;z-index:70;background:rgba(20,18,12,.44);display:flex;align-items:center;justify-content:center;padding:24px;animation:toastin .2s ease")}
    >
      <div onClick={(e) => e.stopPropagation()} style={css("background:var(--surface);border-radius:22px;max-width:600px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden")}>
        <div style={css("padding:22px 26px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between")}>
          <h3 style={css("margin:0;font:750 18px var(--display);letter-spacing:-.01em")}>What&rsquo;s private vs public?</h3>
          <button onClick={onClose} style={css("width:31px;height:31px;border-radius:50%;border:1px solid var(--line);background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--ink-2)")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div style={css("padding:24px 26px;display:grid;grid-template-columns:1fr 1fr;gap:0")}>
          <div style={css("padding-right:22px;border-right:1px solid var(--line)")}>
            <div style={css("display:inline-flex;align-items:center;gap:8px;margin-bottom:15px")}>
              <span style={css("width:24px;height:24px;border-radius:7px;background:var(--panel);color:#f3f1ec;display:flex;align-items:center;justify-content:center")}><LockIcon c="#ffd208" /></span>
              <span style={css("font:750 12px var(--display);letter-spacing:.05em;text-transform:uppercase;color:var(--ink)")}>Private under APS</span>
            </div>
            <div style={css("display:flex;flex-direction:column;gap:12px")}>
              {PRIVATE.map((t) => <span key={t} style={css("font:600 13px/1.35 var(--display);color:var(--ink-2)")}>{t}</span>)}
            </div>
          </div>
          <div style={css("padding-left:22px")}>
            <div style={css("display:inline-flex;align-items:center;gap:8px;margin-bottom:15px")}>
              <span style={css("width:24px;height:24px;border-radius:7px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2);display:flex;align-items:center;justify-content:center")}><EyeIcon /></span>
              <span style={css("font:750 12px var(--display);letter-spacing:.05em;text-transform:uppercase;color:var(--ink)")}>Public on-chain</span>
            </div>
            <div style={css("display:flex;flex-direction:column;gap:12px")}>
              {PUBLIC.map((t) => <span key={t} style={css("font:600 13px/1.35 var(--display);color:var(--ink-2)")}>{t}</span>)}
            </div>
          </div>
        </div>
        <div style={css("padding:16px 26px;background:#fbf1dc;border-top:1px solid #f0d97a;font:400 12px/1.55 var(--display);color:#6b5a2a")}>
          <b style={css("color:#8a6d00;font-weight:700")}>Testnet preview.</b> APS is not yet live on Arc, so on this preview the boundary above is <b style={css("font-weight:700")}>notional</b>: the app reveals your own values to you in-app, and on-chain data is not yet cryptographically shielded. The protocol logic and the USDC integration are live. Netting genuinely limits what crosses to the public venue &mdash; only the batch <b style={css("font-weight:700")}>net</b> ever does.
        </div>
      </div>
    </div>
  );
}

// A drop-in pill for a screen header — opens the "what's private vs public" modal.
export function WhatsPrivate() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={css("display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:999px;background:var(--surface);border:1px solid var(--line-2);font:600 12.5px var(--display);color:var(--ink-2);cursor:pointer")}>
        <EyeIcon />What&rsquo;s private vs public?
      </button>
      <PrivacyModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// A persistent, always-visible chip for the shell status strip — opens the modal.
export function PreviewChip() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Testnet preview — APS not yet live"
        style={css("display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:#fbf1dc;border:1px solid #f0d97a;font:650 12px var(--display);color:#8a6d00;cursor:pointer")}
      >
        <EyeIcon c="#c68a00" />Preview · APS not live
      </button>
      <PrivacyModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// The dismissible-per-session disclosure banner rendered once in the shell.
export function TestnetPreviewBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={css("display:flex;align-items:flex-start;gap:12px;background:#fbf1dc;border:1px solid #f0d97a;border-radius:14px;padding:12px 16px;margin-bottom:14px")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none;margin-top:1px")}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/></svg>
      <p style={css("margin:0;flex:1;font:400 12.5px/1.55 var(--display);color:var(--ink-2)")}>
        <b style={css("color:#8a6d00;font-weight:700")}>Testnet preview.</b> GhostRail&rsquo;s confidentiality is enforced by Arc&rsquo;s Privacy Sector (APS). APS is not yet live on Arc, so on this testnet the app shows your own values in-app and on-chain data is not yet cryptographically shielded. The protocol logic and USDC integration are live.
      </p>
      <button onClick={() => setDismissed(true)} style={css("flex:none;width:26px;height:26px;border-radius:50%;border:1px solid #f0d97a;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#8a6d00")}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
