"use client";
import { useState } from "react";
import { css, cssm } from "@/lib/css";
import { timeAgo } from "@/lib/format";
import { EXPLORER } from "@/lib/addresses";
import { ACTION_META, type ActivityRecord } from "@/lib/activity";

// §2.3 required honest caption (verbatim).
const ACTIVITY_NOTE =
  "Your own local records — kept in this browser. Amounts are never emitted on-chain by design, so this history can't be reconstructed from the chain. Under APS the enclave returns your history to your view key.";

const INITIAL = 8; // rows shown before "show more"
const CAP = 50; // rendered cap

function FlowIcon({ flow }: { flow: "in" | "out" | "cancel" }) {
  const stroke = flow === "in" ? "var(--green)" : flow === "cancel" ? "var(--amber)" : "var(--ink-2)";
  return (
    <span style={css("width:28px;height:28px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:var(--surface-2);border:1px solid var(--line)")}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {flow === "cancel" ? (
          <path d="M6 6l12 12M18 6L6 18" />
        ) : flow === "in" ? (
          <path d="M12 5v14M6 13l6 6 6-6" />
        ) : (
          <path d="M12 19V5M6 11l6-6 6 6" />
        )}
      </svg>
    </span>
  );
}

// Client-side activity log for one market. `items` is newest-first; the caller owns persistence.
export function ActivityLog({ items, onClear }: { items: ActivityRecord[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = items.slice(0, expanded ? CAP : INITIAL);
  return (
    <div style={css("background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:20px 22px;margin-top:16px;box-shadow:0 1px 2px rgba(20,18,12,.03)")}>
      <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px")}>
        <span style={css("font:750 15px var(--display);color:var(--ink)")}>Activity</span>
        {items.length > 0 && (
          <button onClick={onClear} style={css("font:600 11.5px var(--display);color:var(--ink-3);background:none;border:none;cursor:pointer;text-decoration:underline")}>Clear activity</button>
        )}
      </div>
      <p style={css("margin:0 0 8px;font:400 11.5px/1.55 var(--display);color:var(--ink-3)")}>{ACTIVITY_NOTE}</p>
      {items.length === 0 ? (
        <div style={css("padding:22px 4px;text-align:center;font:400 13px var(--display);color:var(--ink-3)")}>No activity yet — your shields, deposits, and claims will appear here.</div>
      ) : (
        <>
          {visible.map((it, i) => {
            const m = ACTION_META[it.action];
            return (
              <div key={`${it.ts}-${i}`} style={css("display:flex;align-items:center;gap:12px;padding:11px 2px;border-top:1px solid var(--line)")}>
                <FlowIcon flow={m.flow} />
                <div style={css("display:flex;flex-direction:column;flex:1;min-width:0")}>
                  <span style={css("font:650 13px var(--display);color:var(--ink)")}>{m.label}</span>
                  <span style={css("font:400 11.5px var(--display);color:var(--ink-3)")}>{timeAgo(it.ts)}{it.batchId ? ` · batch #${it.batchId}` : ""}</span>
                </div>
                {it.amount && (
                  <span style={css("font:700 13px var(--mono);color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap")}>{it.amount} {it.asset}</span>
                )}
                {it.txHash && (
                  <a href={`${EXPLORER}/tx/${it.txHash}`} target="_blank" rel="noreferrer" style={css("font:500 11px var(--mono);color:#8a6d00;text-decoration:none;white-space:nowrap")}>{it.txHash.slice(0, 8)}… ↗</a>
                )}
              </div>
            );
          })}
          {items.length > INITIAL && (
            <button onClick={() => setExpanded((v) => !v)} style={css("margin-top:10px;font:600 12px var(--display);color:#8a6d00;background:none;border:none;cursor:pointer")}>
              {expanded ? "Show less" : `Show more (${Math.min(items.length, CAP) - INITIAL})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
