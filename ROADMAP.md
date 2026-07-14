# GhostRail — Roadmap

> What's live today and what comes next, honestly. The order is deliberate: each phase builds on the
> previous phase's trust + audit foundation; custody risk grows only from a proven base.

## v1 — live on Arc testnet (today)

**Confidential deposit / yield.** A confidentiality layer over existing public lending venues:
deposit an asset, earn the *same* yield the underlying venue pays, keep your position private.

- Generic architecture: one confidential-token wrapper (any ERC-20) + one generic vault router
  (any venue). Multiple asset markets (USDC, ETH, BTC, EURC, tokenized treasury) on one design.
- GhostGate netting: deposits/withdrawals net inside the confidential zone; only the batch **net**
  crosses to the public venue.
- Zero-admin, immutable contracts; public solvency invariant (aggregates public, positions
  private); per-account view keys for selective disclosure.
- Live on Arc testnet with **real testnet USDC** (USDC market wraps real Arc USDC; other markets use
  mock venues, clearly labelled). Deployed, tested, fuzz-checked.

**Honest status:** Arc's Privacy Sector (APS) is not live yet, so on-chain confidentiality is
**notional** today (protocol logic + USDC integration are live; cryptographic shielding activates
when APS ships). We never claim privacy is live before APS.

## Circle-product integration

- **USDC — live.** The USDC market wraps real Arc testnet USDC; the whole system is built on it.
- **CCTP — live.** Bring USDC from another chain to Arc via Circle's CCTP (burn → attestation →
  native mint on Arc), then shield and earn. Uses Circle's own Bridge Kit.
- **EURC — via the Euro market.**
- **Gateway, Paymaster — planned** (unified cross-chain USDC deposits; USDC-as-gas, no ETH needed).

## v2 — after v1 ships + an independent audit (custody-grade)

Holds real funds, so it ships only **after an independent security audit** — the grant funds a safe
build; the audit completes **before** mainnet real funds, never the other way around.

- **Real venue adapters** — replace the mock venue with live Morpho / Aave adapters once they deploy
  on Arc mainnet (Aave V4 is already in Arc governance, USDC/EURC/cirBTC scope — GhostRail is built
  to integrate day one).
- **Same-asset leverage** — loop a vault-share position (a share-looping pattern): collateral and
  debt are the same asset family, so **no cross-asset price-gap risk**, monotone share price, high
  LLTV viable. The leverage ratio itself stays private. The clean, low-tail-risk way to add
  leverage.
- **Institutional compliance tier** (revenue layer) — an auditor/regulator disclosure product on top
  of Arc's view-key primitive (audit-log, report export, selective-disclosure flows). Retail stays
  near-free; institutions pay for the compliance layer. Fee: a small yield-share performance fee
  (never on principal / on shielding), weighted to institutional access.

## v3 — research / demand-gated (documented honestly, not promised)

Real but hard; each carries a tension we state openly:

- **Confidential borrowing (cross-asset)** — deferred: pooled cross-asset collateral has an
  irreducible tail risk (price gaps faster than internal liquidation → venue liquidates the
  aggregate → safe users share the loss). Ships only with demand evidence + a liquidation-race
  design that stays ahead of the external venue.
- **Confidential yield aggregator** — auto-route to the best confidential yield across venues.
  Deferred: it **conflicts with the privacy model** (aggregation splits liquidity, shrinking each
  pool's anonymity set). Requires resolving the pool-liquidity vs privacy-strength tension first.

## Design principles we do NOT break (all phases)

- **Layer, not venue** — never run our own pool; inherit incumbent liquidity.
- **Operational privacy, not a mixer** — hide a user's own amounts/positions/breakdown; aggregates
  public for solvency. No unlinkability claims.
- **Pooling is the only mechanism for amount privacy on a public venue** — start with a few large
  markets (deep pools = strong privacy), expand only as liquidity allows.
- **Zero admin keys** — immutable, no privileged fund path.
- **Never overclaim** — notional-vs-live privacy always stated honestly; APS-swap points marked in
  code.
