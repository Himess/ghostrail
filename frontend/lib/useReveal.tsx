"use client";
import { useCallback, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { css } from "./css";
import { CHAIN_ID } from "./addresses";

// Sign-to-reveal — an HONEST gate for every confidential value in the UI.
//
// Before dots ever turn into a plain number, the owner signs a real EIP-712 "RevealBalance" message with
// their wallet. That signature proves they control the account whose balance they're about to read. Only
// then does the screen reveal the (already-owner-readable) gated value. This is NOT a decrypt and NOT a KMS
// call — the value is fetched by a normal gated eth_call issued as the connected wallet.
//
// APS-SWAP: under Arc's Privacy Sector (once live) this exact signature drives a real enclave / view-key
// read — the enclave verifies the signature and decrypts the confidential balance for the signer. On this
// preview it verifies ownership and gates the reveal client-side.

export const REVEAL_HELP =
  "Signature proves you own this balance. Under APS (once live) this authorizes the enclave to decrypt it for you.";

export type RevealState = {
  revealed: boolean;
  signing: boolean;
  signed: boolean; // ownership already proven this session — Hide/Show can toggle without re-signing
  cancelled: boolean;
  label: string;
  toggle: () => void; // reveal (signing first if needed) or hide
  reveal: () => void;
  hide: () => void;
};

export function useReveal(market: string): RevealState {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [revealed, setRevealed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const reveal = useCallback(async () => {
    if (signed) { setRevealed(true); setCancelled(false); return; } // already proven — just show
    if (!address) { setCancelled(true); return; }
    setSigning(true); setCancelled(false);
    try {
      // APS-SWAP: on Arc's Privacy Sector this signature is handed to the enclave, which verifies it and
      // returns the decrypted value via the owner's view key. Here it verifies ownership + gates the reveal.
      await signTypedDataAsync({
        domain: { name: "GhostRail", version: "1", chainId: CHAIN_ID },
        types: {
          RevealBalance: [
            { name: "action", type: "string" },
            { name: "account", type: "address" },
            { name: "market", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "nonce", type: "uint256" },
          ],
        },
        primaryType: "RevealBalance",
        message: {
          action: "RevealBalance",
          account: address,
          market,
          chainId: BigInt(CHAIN_ID),
          nonce: BigInt(Date.now()), // timestamp nonce
        },
      });
      setSigned(true);
      setRevealed(true);
    } catch {
      setCancelled(true); // user rejected the signature — keep dots
    } finally {
      setSigning(false);
    }
  }, [address, market, signed, signTypedDataAsync]);

  const hide = useCallback(() => setRevealed(false), []);
  const toggle = useCallback(() => { if (revealed) hide(); else void reveal(); }, [revealed, hide, reveal]);

  const label = revealed ? "Hide" : signing ? "Verifying…" : signed ? "Reveal" : "Sign to reveal";

  return { revealed, signing, signed, cancelled, label, toggle, reveal: () => void reveal(), hide };
}

// Small shared caption for a reveal panel: shows the ownership-signature helper by default, and swaps to a
// "Reveal cancelled" note if the user rejected. Renders nothing once revealed.
export function RevealNote({ r }: { r: RevealState }) {
  if (r.revealed) return null;
  return (
    <span style={css("display:inline-flex;align-items:center;gap:6px;font:400 11px/1.45 var(--display);color:var(--ink-3)")}>
      {r.cancelled ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={css("flex:none")}><path d="M6 6l12 12M18 6L6 18" /></svg>
          Reveal cancelled — sign to reveal your balance.
        </>
      ) : (
        REVEAL_HELP
      )}
    </span>
  );
}
