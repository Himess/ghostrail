# GhostRail Frontend — notes

A polished, multi-market **confidential lending** platform on Arc testnet. Lending is the hero
(**Markets → Earn**); a confidential x402/MCP **Payments** module ships alongside as a subordinate,
last-in-nav secondary feature. One generic architecture (ConfidentialToken + VaultRouter + venue) backs
every market — five asset markets, same code, different underlying/venue.

## The product surface

- **Markets (hero, default route).** An institutional grid of the five asset markets — **cUSDC, cWETH,
  cWBTC, cEURC, cUSTB (Tokenized Treasury)** — each card showing the asset, a supply APY, confidential
  TVL (read live from each router), the venue (Morpho / Aave) as a link to its official page, and a
  **● LIVE** vs **Preview · simulated** badge. Only the **USDC market wraps real Arc testnet USDC**
  (`simulated:false`); the other four are simulated (mock underlyings + mock venues). Click a card → Earn.
- **Earn (per-market).** The market detail / deposit screen bound to the selected market's router +
  cToken: deposit (shield → `router.deposit`) / withdraw (`router.requestWithdraw`), batch banner +
  countdown, permissionless **Execute batch**, and the pull step — **Claim shares** `claimShares(batchId)`
  / **Claim** `claim(batchId)` — plus real `cancelDeposit`/`cancelWithdraw`. Your shares/position are
  gated (dots → reveal). Header carries the token, venue link, APY, a LIVE/simulated honesty note, a
  back-to-Markets link, and a market switcher.
- **GhostGate.** GROSS-vs-NET netting explainer + the selected market's live batch state + its recent
  `BatchExecuted` table. Netting is real here — it is the public-venue boundary.
- **Balances.** Per-market public underlying + confidential (cToken + shares) balances, dots → reveal, an
  all-markets private-balance list, and shield/unshield for the selected market.
- **Faucet.** USDC market → link to faucet.circle.com (Arc Testnet) + shield. Simulated markets → **Mint**
  the mock underlying (`erc20.mint`) + shield. The get/mint step is flagged a **PUBLIC STEP**.
- **Dashboard.** Multi-market overview: confidential TVL across markets, a per-market APY list, GhostGate
  batch state, live-vs-simulated counts, CTA → Markets.
- **Status.** Batch/keeper + per-market solvency reads, cUSDC supply, ledger solvency, and the honest
  "APS enclave: not yet live" row.
- **Payments (secondary).** The x402/agent account — fund / pay / receipts / verify / view-key / cash-out
  — bound to the ledger + the USDC market's confidential token. Rendered last, below a "Secondary"
  divider, visually subordinate.
- **Nav:** Markets · Earn · GhostGate · Balances · Faucet · Dashboard · Status · Payments.

## Contract binding — source of truth

- **Addresses:** `lib/addresses.ts` (single swap surface, no env vars) — `CHAIN_ID` 5042002, `EXPLORER`,
  `FAUCET`, `LEDGER`, `REAL_USDC` (`0x3600…0000`), and `MARKETS` (five `{ symbol, underlying, cToken,
  venue, router, decimals, simulated }` records) with `marketBySymbol` / `USDC_MARKET` helpers. The live
  USDC market: cToken `0x84a1…67d8`, router `0xA2E3…853A` over real Arc USDC.
- **Display metadata:** `lib/markets.ts` — `MARKET_LIST` merges the on-chain addresses with `label`,
  `underlyingSymbol`, `venueName`, `venueUrl`, `apy`, `tint`. APY/venue are illustrative display values
  simulating an Arc-mainnet deployment against Morpho/Aave (not affiliated).
- **ABIs:** `lib/abis.ts` — generated from the forge artifacts (`ctokenAbi`/`cusdcAbi`, `routerAbi`,
  `ledgerAbi`, `venueAbi`, `erc20Abi` with `mint`). Not hand-written.
- **Data layer:** `lib/hooks.ts`, parameterized by market —
  - `useConfToken(cTokenAddr)` → `{ totalShielded, myBalance (gated), refetch }`.
  - `useMarket(m)` → that market's router aggregates + gated `myShares` / `myClaimable` /
    `pendingBatches`, `positionValue`, `sharePrice6`, `dispatchableInAt(now)`, `solvency`.
  - `useAllMarkets()` → every market's `totalAssets` (TVL) + `totalShares` in one `useReadContracts` batch.
  - `useLedger()` (ledger + USDC cToken), `useBatchEvents(routerAddr)`, `useNowSec()`.
  - Every gated read is issued with the connected wallet as `account` — the honest owner path. The
    dots → value reveal is a pure client toggle; nothing decrypts or signs.

## Privacy model (honest APS-preview disclosure)

The app **never claims live on-chain privacy**. GhostRail's confidentiality is designed to be enforced by
Arc's Privacy Sector (APS), which is not yet live on Arc testnet — so on this preview the app reveals your
own values to you in-app and on-chain data is not yet cryptographically shielded. This is stated in a
persistent "Testnet preview" banner, a "Preview · APS not live" chip, and a "What's private vs public?"
modal. Live now: the protocol logic (batching, netting, shares, solvency) and the real USDC integration.
Netting genuinely limits what crosses to the public venue — only the batch net ever does.

## Design system

`css()`/`cssm()` inline-style engine, `globals.css` tokens (signature yellow `#ffd208`, inks, lines,
`beat`/`toastin`/`floaty` keyframes), `TokenIcon` (gold private-shield badge on confidential symbols),
`Toast`, and the `Privacy` kit. Amounts are formatted with each market's own decimals via
`fmtUnits(v, decimals)` / `toUnits(s, decimals)` (`fmtUnits6` retained for the 6-dec payments ledger).

## Chain

Arc Testnet — chainId **5042002**, RPC `https://rpc.testnet.arc.network`, explorer
`https://testnet.arcscan.app`, injected wallet only, via viem's built-in `arcTestnet`.

## How to run

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000  ← the app runs here (client-only dApp)
```

Connect an injected wallet on **Arc Testnet**. USDC market: get USDC from faucet.circle.com → shield →
deposit → execute → claim shares → withdraw → execute → claim. Simulated markets: mint the mock underlying
→ shield → deposit. Payments: fund → pay → reveal → grant a view key → cash out.

## Decisions / notes where the spec left room

- **Per-market share token** labelled `cs<UNDERLYING>` (e.g. `csUSDC`, `csWETH`) — the `cs`-prefix drives
  the gold private-shield badge in `TokenIcon`. Shares are integers (no decimals).
- **Dashboard "Confidential TVL"** sums `useAllMarkets` normalized to whole underlying units, since the
  five markets carry different decimals and different underlying assets (a raw bigint sum would be
  meaningless). Per-market TVL is shown with each market's own decimals.
- **Wrong-network banner** keeps a friendly chain-name map (Ethereum Mainnet, Sepolia, Polygon, Base, …)
  so a mis-connected wallet sees its real network name before being prompted to switch to Arc — these are
  wallet network labels, not app configuration.
- **`ssr:false` without `next/dynamic`:** `app/page.tsx` renders `<App/>` only after a client mount, and
  `providers.tsx` lazily imports the wagmi config on the client, keeping it out of the server prerender
  chunk.
- **Known Next.js build caveat (`npm run build`).** `next build` throws a Next-internal invariant while
  statically prerendering the built-in `/_global-error` page — a known Next.js 16.2.x internal bug for
  wagmi App-Router dApps. It does **not** affect `npm run dev` (no prerender) or a Vercel deployment. The
  proof of a working app is `npm run dev`. Type-checking is clean and every app chunk compiles.
