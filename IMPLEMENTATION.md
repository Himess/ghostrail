# GhostRail — Implementation Report

*A confidential-finance layer for Circle's Arc blockchain: private agent payments + private lending
routing, one SDK. Proof-of-concept, built for the Circle Developer Grants / Arc Builders positioning.*

---

## 1. Overview

GhostRail is a confidential-finance layer for **Arc**, Circle's USDC-native blockchain. It gives two
things a public chain cannot on its own: **confidential agent payments** (Module A, a full working PoC)
and **confidential deposits into existing public lending venues** (Module B, a functional deposit-only
skeleton, audit-gated). Both sit on one shared primitive — a confidential USDC wrapper with selective
disclosure and a *public solvency invariant* (aggregates public, individual breakdown private). The
one-liner: *"Morpho/Aave liquidity and rate, but private — and a private account for the x402 economy,
one SDK."* GhostRail applies proven confidential-DeFi patterns (netting, the two-speed public/private
boundary, honest boundary tables) on Arc's TEE substrate.

The design turns on one **architectural fact about Arc: it is a *dual* environment** — a **public Arc
EVM** plus a **private APS pEVM** (Arc Privacy Sector, a TEE-based private EVM), with a native
shield/unshield bridge between them and atomic same-block composability. This is *not* a monolithic
"everything private" chain. External venues (lending) live on the **public** EVM; confidential accounting
lives in the **private** pEVM; value crosses via shield/unshield. That is why a **netting boundary**
(GhostGate) matters: only the *net* of each batch ever crosses to the public venue, so per-user amounts
never appear publicly even though the venue itself is public. **Honest caveat, stated everywhere: APS is
not live yet.** Locally (Foundry/anvil) and on public Arc testnet, "confidential" storage is physically
readable via `eth_getStorageAt`, and `msg.sender`-gating is not enforceable against `eth_call`
`from`-spoofing. Privacy here is **notional** (interface semantics only); it becomes real on APS, where
the enclave + view-key mechanism enforces reads. What *is* genuinely live: the protocol logic and a real
USDC integration. **We never claim the privacy is live.**

---

## 2. Architecture

```
                          ┌─────────────────────────── GhostRail ───────────────────────────┐
                          │                                                                  │
   plain USDC  ──shield──▶│  ConfidentialUSDC (cUSDC)   core primitive, immutable, no owner  │
   (public)   ◀─unshield──│   • 1:1 wrapper   • confidentialTransfer(From)                   │
                          │   • operator model   • observer/view-key   • totalShielded (pub) │
                          │            ▲                         ▲                            │
                          │            │ operator-pull           │ operator-pull              │
                          │   ┌────────┴─────────┐      ┌────────┴──────────────┐            │
                          │   │ PaymentLedger    │      │ VaultRouter           │            │
                          │   │ (Module A, full) │      │ (Module B, skeleton,  │            │
                          │   │  fund/pay/verify │      │  audit-gated)         │            │
                          │   │  receipts+viewkey│      │  shares + GhostGate    │            │
                          │   │  withdraw batch  │      │  netting              │            │
                          │   └──────────────────┘      └───────────┬───────────┘            │
                          └───────────────────────────────── net only ──┼──────────────────┘
                                                        CONFIDENTIAL │ PUBLIC
                                                                     ▼
                                                       ILendingVenue (public Arc EVM)
                                                       Morpho/Aave adapter · here: MockLendingVenue

   SDK (sdk/): payConfidential() + requireConfidentialPayment() ── HTTP 402 ── AI agent ⇄ paid API / MCP tool
```

**Per-contract responsibility.**
- **`ConfidentialUSDC`** — the shared core primitive. Wraps plain USDC 1:1 (`shield`/`unshield` at the
  public boundary), moves value privately inside the confidential zone (`confidentialTransfer`,
  `confidentialTransferFrom` via a 7984-style operator), exposes a per-account observer (view key), and
  publishes `totalShielded` for the public solvency invariant. Immutable, no owner.
- **`ConfidentialPaymentLedger` (Module A)** — confidential payment accounts. `fund` once, `pay` many
  services, each emitting only an opaque receipt id; services `verifyReceipt` via a gated view; auditors
  `exportStatement` under a granted view key; cash-outs go through a timing-decorrelation window. Public
  aggregate `totalLedgerBalance` + `checkSolvency`.
- **`ConfidentialVaultRouter` (Module B)** — pools confidential deposits into a *single* public venue
  position; users hold confidential shares (virtual-offset math); per batch, deposits net against
  withdrawals and only the **net** crosses the public boundary (GhostGate). Read-only auditor, no admin,
  no privileged fund path.
- **`ILendingVenue` / `MockLendingVenue`** — the generic venue interface the router plugs into; the mock
  simulates yield accrual. A production adapter maps it to a real Morpho vault or Aave pool.
- **SDK (`sdk/`)** — `payConfidential()` (client) turns an HTTP `402` into a confidential on-chain payment
  and returns a receipt id; `requireConfidentialPayment()` (Express middleware) gates a paid API on an
  on-chain `verifyReceipt`. Demo agent + server complete a full 402 round-trip; an MCP paid-tool mapping
  is documented.

---

## 3. Design rationale & rejected alternatives

**Locked decisions (D1–D11).** Layer, not venue (D1): never run our own pool — inherit incumbent
liquidity and rate, just private. One primitive, two modules (D2). Payments first (D3): Module A is the
full demo (minimal custody, no liquidation risk); Module B ships real but deposit-only, labeled *not for
mainnet funds pre-audit*. Operational privacy, **not a mixer** (D4): hide amounts, counterparties,
internal breakdowns, and the timing of an entity's own activity; do *not* claim unlinkability. Zero admin
keys (D5): every contract is immutable with no owner and no privileged fund path; batches are
permissionless. Public solvency invariant (D6). GhostGate netting at the **public boundary only** (D7).
ERC-7984 interface *shape*, not the FHE implementation (D8): no `euint`, no proofs, no coprocessor. Units
are raw 6-dec integers (D10). Plain reverts (D11): APS provides constant-time gas + sanitized revert
reasons, so we use normal reverts — no "clamp-to-encrypted-max / no-revert / lastError" gymnastics.

**Rejected, and why (the repo tells its own story):**
- **Mixer-grade unlinkability** — needs a large anonymity set we won't have at launch (cold-start) and is
  regulatory poison for a compliance-native, Circle-adjacent product. Operational privacy is what
  institutions actually buy.
- **Running our own lending pool** — two-sided liquidity cold-start; users pick incumbents' liquidity.
- **Cross-asset borrowing (v1/v2)** — pooled collateral on an external venue carries an irreducible tail
  risk: if price gaps faster than internal liquidation executes, the venue liquidates the router's
  aggregate and safe users share the loss. Conservative buffers shrink but can't eliminate it. Parked
  until demand evidence.
- **Per-user proxy positions ("private amounts per user on the venue")** — impossible by first principles:
  a position in a public contract has public amounts. On a public venue only two privacy moves exist —
  hide ownership (proxy) or hide the breakdown (aggregation/pooling). Proxy + private-amounts collapses
  back into pooling; splitting one user across many proxies is statistically clusterable and constitutes
  **structuring/smurfing** (compliance-toxic). **Hence pooling is not a preference — it is the only
  mechanism for amount privacy on a public venue.**
- **Private swap / confidential AMM** — liquidity bootstrap + leaky interface (slippage reveals depth).
  Deferred to v3 as a separate mechanism, not a router pattern.
- **Copying the FHE implementation** — fhEVM-coprocessor-specific; doesn't port to a TEE. We port the
  *patterns* (netting, two-speed boundary, honest privacy-boundary tables), not the ciphertext code.
- **Competing with payment standards** (x402/AP2) — owned by Coinbase/Stripe/Google-scale players; we
  implement an x402 flavor, we don't invent a standard. **Custodial operations** — never (D5).

---

## 4. Privacy model

**The boundary (state the boundary explicitly).**

| Surface | Visibility | Where |
|---|---|---|
| `shield` / `unshield` amounts | **PUBLIC** (by APS design — value crossing the boundary) | cUSDC |
| `totalShielded`, `totalLedgerBalance`, `totalShares`, venue position | **PUBLIC** aggregates (solvency, D6) | all |
| Per-batch **net** direction + amount (`BatchExecuted`) | **PUBLIC** (the one crossing per batch) | router |
| Account existence, operator/view-key *identities*, timings | **PUBLIC** | all |
| Individual confidential balance, per-payment amount/counterparty/ref, per-user shares | **PRIVATE** (gated view; owner/observer only) | all |
| Any confidential *amount* in an event | **never emitted** | all |

**Notional-privacy caveat (local *and* Arc testnet).** APS is not live, so off-APS the "confidential"
state is physically readable via `eth_getStorageAt`, and `msg.sender`-gating on a view is not enforceable
against `eth_call` `from`-spoofing. Privacy is therefore **interface-semantic only** until APS. What is
genuinely live: the protocol logic and a real USDC integration. We say "protocol live on Arc testnet,
USDC-integrated, architected for APS; confidentiality activates when APS ships."

**`// APS-SWAP:` sites (16 markers across the code) — each with its production note.**
- `ConfidentialUSDC` (contract header + `shield`/`unshield`/`confidentialTransfer`/`confidentialBalanceOf`):
  → on Arc these are the native confidential asset + shield/unshield precompiles; balances are
  pEVM-encrypted; reads are enclave + view-key enforced.
- `ConfidentialPaymentLedger` (header + `fund` + gated views): → the pay graph is sealed calldata + sealed
  storage; even calldata is enclave-encrypted; balances/receipts are enclave-read-gated.
- `ConfidentialVaultRouter` (header + `sharesOf` + queues): → per-user shares and batch queues are
  pEVM-encrypted; only `totalShares`, `totalAssets`, and the net batch flow are public.

**Why the dual-EVM point makes netting matter.** Because the lending venue lives on the *public* Arc EVM,
the router's position there is plain public USDC. Netting is what keeps individual deposits/withdrawals
from being visible at that public boundary: deposits net against withdrawals inside the confidential zone,
and only the residual crosses. On a monolithic "all-private" chain there'd be nothing to net; on Arc's
real public/private split, netting is the mechanism that preserves amount privacy end-to-end.

---

## 5. Module A mechanics — Confidential Payment Ledger

**Accounts & receipts.** An agent grants the ledger a cUSDC operator, then `fund`s a private balance once.
Each `pay(service, amount, ref)` is a pure internal-balance move (payer → service) — **no cUSDC leaves the
ledger**, so payments are unobservable at the token layer. It stores a `Receipt {payer, service, amount,
timestamp, ref}` keyed by `receiptId = keccak256(payer, service, amount, ref, nonce)` and emits only
`PaymentExecuted(receiptId)` — an opaque id, no amount, no counterparty, no ref.

**Verification (chosen default).** The service verifies via its own gated view:
`verifyReceipt(receiptId, expectedService, minAmount, expectedRef)` returns true only when called by the
service (or its viewer). A facilitator-mints-receipts alternative is a documented swap — deliberately not
built.

**Selective disclosure.** `balanceOf`, `receiptOf`, `exportStatement` are gated to the account owner or a
viewer the owner authorized via `grantViewKey` (compliance-native: an auditor reads, then the key is
revoked). Verified in tests three ways (owner ✓, viewer ✓, stranger revert).

**x402 mapping.** The SDK middleware answers an un-paid request with `402 {scheme, ledger, service,
amount, ref}`; the agent `payConfidential`s and re-requests with `X-Payment-Receipt: <receiptId>`; the
middleware calls `verifyReceipt` from the service's account and serves on success. (Full round-trip in §8.)

**Withdraw batching = timing decorrelation.** `requestWithdraw` moves the amount out of the spendable
balance immediately (no double-spend) but the cUSDC only leaves on `claimWithdraw`, which reverts until
`withdrawWindow` seconds pass. A service's outbound cUSDC can't be timing-correlated with the specific
payments that funded it. `fund` needs no batching. `nonReentrant` on `fund`/`claimWithdraw`, CEI
throughout. Public `checkSolvency()` proves `totalLedgerBalance == cusdc.confidentialBalanceOf(ledger)`.

---

## 6. Module B mechanics — Confidential Vault Router

**Model.** Users deposit cUSDC; the router keeps a **single** position in a public venue; users hold
**confidential shares** (`totalShares` public). The venue leg is plain public USDC — the private→public
boundary — so per batch, deposits net against withdrawals and **only the net crosses** (GhostGate).

**Share math + inflation defense.** Shares use a virtual offset to kill first-depositor inflation:
`VIRTUAL_SHARES = 1e3`, `VIRTUAL_ASSETS = 1`. With `A = totalAssets()` (the venue position, incl. yield)
and `S = totalShares` snapshotted at batch execution:
`sharesOut = amount · (S + 1e3) / (A + 1)` (floor), and `assetsOut = shares · (A + 1) / (S + 1e3)` (floor),
both at the same snapshot. Crucially, `totalAssets()` reads the **venue** balance — never the router's
idle USDC — so a raw donation to the router cannot move the price (the classic ERC-4626 inflation vector
is structurally closed; the virtual offset is a second line). A dedicated test donates 100,000 USDC before
a victim's deposit and shows the victim keeps ~full redeemable value while the attacker's stake stays dust.

**Batch / netting algorithm (pull-based, DoS-resistant).** `executeBatch()` is a permissionless keeper
call, allowed once the window closes, and does **O(1) work — it never loops over participants** (so it
cannot be griefed into out-of-gas by many small deposits). It (1) snapshots `(A+Vₐ, S+Vₛ)` for the batch;
(2) updates the *aggregate* supply `totalShares += mint(depositTotal) − withdrawShares`; (3) computes `net
= depositValue − withdrawValue` and stores the batch snapshot; (4) advances the batch (all effects) then
does the **single** boundary movement (net>0: `unshield(net)`→`venue.deposit(net)`; net<0:
`venue.withdraw(−net)`→`shield(−net)`; net==0: **no public movement**); (5) emits `BatchExecuted(batchId,
netDirection, netAmount, sharePrice)` — net + aggregates only, never per-user. Each user then **pulls** its
own outcome at the batch snapshot price: `claimShares(batchId)` for a deposit, `claim(batchId)` for a
withdrawal; `cancelDeposit`/`cancelWithdraw` back out of the still-open batch. Per-user flooring leaves
tiny dust in-pool (safe direction). This is the standard pull-over-push hardening for batched vaults.

**Worked example (from `DemoVault.s.sol`, real trace).** Batch 0: three deposits 10,000 / 5,000 / 1,000 →
venue = 16,000. +5% yield → venue = 16,800. Batch 1, same window: user2 exits (shares worth 5,250) while
user3 adds 1,000. Gross would be 5,250 out + 1,000 in; **netting crosses only the 4,250 net withdrawal** —
venue goes 16,800 → 12,550 in a **single** venue call. user2 claims 5,249999999 (1-unit floor dust). At
every step `previewRedeem(totalShares) ≤ venue backing` (solvency holds).

**Solvency & the audit-gated label.** `checkSolvency()` returns `(totalShares, backingAssets)`; the fuzzed
invariant proves redeemable value never exceeds backing. The contract header reads *"V2 / AUDIT-GATED:
functional PoC skeleton. NOT for mainnet real funds pre-audit"* — the share math, netting rounding (dust
direction), and venue-adapter trust boundary are exactly what an independent audit must clear before real
funds.

---

## 7. Security posture

- **Zero admin keys (D5).** Every contract is immutable — no owner, no pause, no privileged fund path. The
  router's `auditor` can only *read* shares. Batches are permissionless. A test asserts no function moves
  funds to an arbitrary address without burning the caller's own shares/queue entry.
- **Reentrancy.** `nonReentrant` on every external money path (`shield`/`unshield`, `fund`/`claimWithdraw`,
  `deposit`/`requestWithdraw`/`cancel*`/`claimShares`/`claim`/`executeBatch`) + strict
  checks-effects-interactions (all state settles before external calls). A `MaliciousVenue` that re-enters
  `executeBatch` reverts the whole tx (tested).
- **DoS-resistance (pull-over-push).** `executeBatch` does O(1) work and never iterates participants, so a
  griefer cannot brick a batch by padding it with many tiny deposits; each user pulls its own shares/cUSDC
  in a bounded call. This is the remediation that replaced the earlier push-based router.
- **Inflation attack.** Virtual offset + NAV read from the venue (not idle balance) — donation attack
  neutralized (tested).
- **Conservation.** cUSDC is always 1:1 backed by real USDC; the ledger's internal sum always equals its
  cUSDC; the router is never insolvent — all three are **stateful fuzz invariants** (128,000 calls each, 0
  reverts).
- **Custom errors, no string reverts; SafeERC20 on every token move; 6-dec integer units, no implicit
  scaling.**
- **What an audit must still cover before real funds:** the router's rounding/dust accounting under
  adversarial batch sequences, the venue-adapter trust assumptions (a real Morpho/Aave adapter replacing
  the mock), griefing around permissionless `executeBatch`, and — above all — that the **notional** privacy
  is replaced by real APS enforcement before any privacy claim is made.

---

## 8. SDK & the 402 flow

**HTTP round-trip (verified end-to-end against local anvil):**
1. `GET /premium-data` → **402** `{scheme:"ghostrail-confidential", ledger, service, amount:"500000", ref}`.
2. Agent calls `payConfidential(...)`: ensures a confidential balance (shield + operator + `fund` on
   demand), then one `pay(service, amount, ref)`; returns the opaque `receiptId`.
3. `GET /premium-data` with `X-Payment-Receipt: <receiptId>` → middleware calls `verifyReceipt` **from the
   service's account** → **200** + the premium data.

Observed receipt id: `0xabbaa96b…3d20`; only that opaque id crossed the wire — amount and counterparty
stayed confidential. **MCP mapping:** the same gate wraps an MCP paid-tool handler (verify a receipt before
running the tool; otherwise return a 402-shaped `payment_required`) — snippet in `sdk/README.md`. No API
keys, no accounts: a confidential USDC micropayment per call.

---

## 9. Arc testnet deployment — **LIVE**

GhostRail is **deployed and smoke-tested on Arc public testnet** (chainId `5042002`,
`https://rpc.testnet.arc.network`, explorer https://testnet.arcscan.app), over the **real** Arc testnet
USDC `0x3600000000000000000000000000000000000000`. Deployer `0xF505e2E71df58D7244189072008f25f6b6aaE5ae`.
Full details + tx hashes: [`deployments/arc-testnet-smoke.md`](./deployments/arc-testnet-smoke.md).

Deployed **multi-asset × multi-venue** — **5 assets × 2 venues (Morpho / Aave) = 10 markets**. Each asset
shares one `ConfidentialToken`; each (asset, venue) is its own `MockLendingVenue` + pull-based
`ConfidentialVaultRouter`. Only **cUSDC · Morpho** is LIVE; full addresses in `deployments/arc-testnet.json`.

| Market (router) | Address | Status |
|---|---|---|
| **cUSDC · Morpho** | `0xCEDA3eE062a10Dd274f4a243a0601E434063d024` | LIVE (real USDC) |
| cUSDC · Aave | `0x4BDC81797936fccB85BA1dF03E0e314ffa7E5EAd` | simulated |
| cWETH / cWBTC / cEURC / cUSTB · Morpho + Aave | see `arc-testnet.json` | simulated |
| PaymentLedger (secondary) | `0x3957406ca80C8176C557DDCFEE83D482cFB241E1` | — |

**Live smoke result:** shield 2 USDC → fund 1 → confidential pay 0.5 → deposit 1 → `executeBatch` all
landed on-chain (8 tx hashes recorded); post-run reads: `verifyReceipt → true`, `checkSolvency →
(1e6, 1e6)` solvent, `router.totalAssets → 1e6` (the net crossed to the public venue via GhostGate),
`cUSDC.totalShielded → 1e6` (fully USDC-backed). **"USDC integrated" is true and checkable on the explorer.**

> **Toolchain note (honest + reusable):** the deploy ran via `forge script --broadcast`. The smoke was
> driven with `cast send` instead, because Arc's USDC calls a native compliance precompile
> (`0x1800…0001::isBlocklisted`) that forge's *local* EVM simulation cannot execute (it isn't a
> deployed contract); `cast` estimates gas + runs on the Arc node where the precompile is real. The deploy
> path touches no USDC transfer, so `forge script` simulated it cleanly. Contract logic is unchanged.

The deploy is fully **env-driven** — the script reverts naming any missing var and never invents an
address/RPC/key.

- **`script/DeployArcTestnet.s.sol`** reads config from env (`ARC_TESTNET_RPC`, `ARC_TESTNET_CHAIN_ID`,
  `ARC_USDC_ADDRESS`, optional `ARC_EXPLORER_URL`, `DEPLOYER_PRIVATE_KEY`, optional `ARC_AUDITOR_ADDRESS`,
  `LEDGER_WITHDRAW_WINDOW`, `ROUTER_BATCH_WINDOW`). It **reverts naming any missing required var**, asserts
  `block.chainid == ARC_TESTNET_CHAIN_ID`, asserts the USDC address has code, deploys `ConfidentialUSDC`
  over the **real Arc testnet USDC** (never MockUSDC — that keeps "USDC integrated" true), plus a
  `MockLendingVenue` over that real USDC (no live Morpho/Aave on Arc testnet yet), the ledger, and the
  router; then writes `deployments/arc-testnet.json` (`chainId, blockNumber, usdc, cUSDC, venue, ledger,
  vaultRouter, auditor`) and prints explorer links.
- **`script/SmokeArcTestnet.s.sol`** reads that JSON and runs, as separate broadcast txs (each printing a
  verifiable hash): shield real USDC → fund → one confidential pay → verify the receipt → one vault deposit
  → `executeBatch` (when the batch window has elapsed; deploy with `ROUTER_BATCH_WINDOW=0` for a single
  session).

**Reproduce (fill `.env` from Arc docs + faucet.circle.com; `.env` is gitignored, never commit keys):**
```bash
cp .env.example .env   # ARC_TESTNET_RPC / CHAIN_ID / ARC_USDC_ADDRESS / DEPLOYER_PRIVATE_KEY / ROUTER_BATCH_WINDOW=0
forge script script/DeployArcTestnet.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast   # key read from .env, not a CLI flag
# smoke: run script/SmokeArcTestnet.s.sol, OR (robust vs Arc's compliance precompile) drive the same
# steps with `cast send` — shield → fund → pay → deposit → executeBatch (see deployments/arc-testnet-smoke.md)
```
Framing for the grant: *protocol live on Arc testnet, USDC-integrated, architected for APS; confidentiality
activates when APS ships.* Never "privacy is live."

---

## 10. Test coverage

`forge test` — **56 passed, 0 failed** across 7 suites — multi-market stack (USDC 6-dec + WETH 18-dec),
incl. an **H-1 bounded-gas regression** (60 depositors → O(1) `executeBatch`) and market-independence tests
(incl. 4 stateful fuzz invariants at 128k calls
each; invariants re-verified against the pull-based router). Summary:

```
ConfidentialUSDC.t.sol      15 passed   shield/unshield conservation, gated views, operator expiry, event hygiene, fuzz conservation
PaymentLedger.t.sol         10 passed   fund→pay→verify, mismatch=false, access control, view-key grant/revoke, withdraw window, fuzz conservation, opaque event
VaultRouter.t.sol           14 passed   deposit→execute→pull shares, yield→price, redeem, multi-user pro-rata+dust, inflation attack, cancel deposit/withdraw, gated shares, no per-user event, reentrancy, no-privileged-path, yield-monotone fuzz
Netting.t.sol                5 passed   net>0 single movement, net==0 zero movement, net<0 single withdraw+reshield, batch partitioning, net-only event
SelectiveDisclosure.t.sol    4 passed   three-way access on every surface + global event scan (no confidential value in any topic/data)
Invariants.t.sol             4 passed   cUSDC fully backed · ledger conserved · router never insolvent · no value creation (stateful, 128k calls, 0 reverts)
```

What each proves is listed per-suite above; the highlights: conservation and solvency are **stateful fuzz
invariants**, not point tests; the event-hygiene scan proves no confidential value appears in any event
across a full cross-module lifecycle; the inflation and reentrancy attacks are exercised and blocked.

---

## 11. How to run

```bash
# contracts
forge build
forge test                                   # 49 passing
forge script script/DemoPayment.s.sol -vv    # narrated Module A story (observer-vs-participant view)
forge script script/DemoVault.s.sol   -vv    # narrated Module B story (PUBLIC vs CONFIDENTIAL labels, netting)

# SDK 402 round-trip (local anvil)
anvil                                                                         # terminal 1
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast   # writes deployments/local.json
cd sdk && npm install
npm run server                                                                # terminal 2 (paid API)
npm run agent                                                                 # terminal 3 (402 → pay → 200)

# Arc testnet (requires Arc creds — see §9)
forge script script/DeployArcTestnet.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast --private-key $DEPLOYER_PRIVATE_KEY
forge script script/SmokeArcTestnet.s.sol  --rpc-url $ARC_TESTNET_RPC --broadcast --private-key $DEPLOYER_PRIVATE_KEY
```

---

## 12. Known limitations

- **Notional privacy** (local *and* Arc testnet): storage readable, view-gating not enforced pre-APS.
- **Shield/unshield amounts are public** at the boundary (by APS design).
- **Anonymity-set caveat** for the pooled router: a small pool = weak privacy; with a single participant in
  a batch, the net equals that participant's amount. Privacy scales with participation.
- **Timing-correlation residual** in payments beyond the single decorrelation window.
- **Mock venue**: yield is a test hook; a real Morpho/Aave adapter is a production item.
- **Single rolling batch window**; no partial-batch cancel on the router (funds are safe, just queued).
- **APS not live**: the entire confidentiality guarantee is pending the enclave + view-key substrate.

---

## 13. Production roadmap

- **APS swap:** replace each `// APS-SWAP:` site with the native confidential asset + enclave-enforced
  view keys; delete the notional-privacy caveat once reads are enclave-gated.
- **Real venue adapters:** `ILendingVenue` → Morpho vault (`deposit`/`withdraw`/`convertToAssets`) or Aave
  pool (`supply`/`withdraw`/aToken balance).
- **Independent audit gate** before any real funds in Module B (share/dust accounting, adapter trust,
  griefing, privacy-enforcement).
- **v2 — same-asset leverage on vault shares**: same asset family → no
  cross-asset price-gap risk, monotone share price, high LLTV viable, internal health handling trivial
  under a TEE. This is the natural fee-earning step after the deposit-only router.
- **Optional KYC gating** (the pattern exists from the earlier presale PoC) for compliance-sensitive pools.
- **Parked (demand-gated):** cross-asset borrow; private swap / batch-auction AMM.

---

## 14. Decisions log

Choices made where the spec left room:

1. **Ledger withdraw window = rolling `now + withdrawWindow`** (not fixed calendar windows). Simplest
   correct timing-decorrelation with no boundary edge cases; matches the "claimable after the window"
   requirement. One pending withdrawal per account at a time (`WithdrawAlreadyPending` otherwise).
2. **Router batch = a rolling counter** (`currentBatch` + `batchOpenedAt`), advanced by `executeBatch`
   after `batchWindow`. Avoids the timestamp/window "gap batch" problem entirely; requests always join the
   open batch; execution closes and advances it.
3. **`totalAssets()` reads the venue balance only** (not idle router USDC). This is what structurally
   closes the donation/inflation vector; idle/claimable cUSDC is tracked separately and never counts as
   share backing. Rounding is always floored in the protocol/venue's favor (users bear ≤ a few units of
   dust — documented and asserted).
4. **`confidentialTransferFrom` allows `from == msg.sender`** (no operator needed to move your own funds);
   otherwise requires an unexpired operator.
5. **`observerOf` is public** (a viewer's *identity* is not a confidential amount); only balances/receipts/
   shares are gated.
6. **Smoke payment is self-directed** (payer == service == deployer) so a single funded key can both pay
   and verify on a real testnet, exercising the full path honestly.
7. **`MockLendingVenue.deposit/withdraw` made `public virtual`** so a test `CountingVenue` can subclass and
   count boundary crossings (proves "exactly one net movement"); the mock itself is unchanged otherwise.
8. **`ROUTER_BATCH_WINDOW=0` recommended for the testnet smoke** so `executeBatch` runs in one session;
   otherwise re-run the smoke after the window elapses.
9. **npm toolchain available here** — the SDK was fully built and the HTTP 402 round-trip **actually
   executed** against a local anvil (receiptId `0xabbaa96b…`), so the §2 fallback was **not** triggered.
10. **Arc testnet deploy is DONE (live).** Deployed + smoke-tested on Arc testnet with the operator's
    funded key (config in gitignored `.env`, read by the script — never a CLI flag, never committed).
    Addresses + 8 live tx hashes in `deployments/arc-testnet-smoke.md` / §9. The smoke was driven with
    `cast send` rather than `forge script` because Arc's USDC compliance precompile (`0x1800…0001`) isn't
    executable in forge's local simulation — a real-network property, not a contract change.
11. **Router remediated to pull-based + redeployed.** The original push-based `executeBatch` looped over
    all batch participants (unbounded-loop DoS). It was rewritten to O(1) snapshot-and-net with per-user
    `claimShares`/`claim` pulls + `cancelDeposit`/`cancelWithdraw`, re-tested (52 green, invariants
    re-verified), and redeployed to Arc (`0x540E…29E3`, batchWindow 60s). cUSDC/ledger/venue were left in
    place; only the router address changed. The frontend binds to this pull-based interface.

*Built in one pass: interfaces + mocks → ConfidentialUSDC → PaymentLedger → VaultRouter → tests (49 green)
→ demo scripts (both run) → SDK (402 round-trip live) → Arc deploy/smoke scripts → this report.*
