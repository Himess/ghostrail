# Changelog

## v2 — Confidential lending layer (multi-asset, lending-hero)

Refactored GhostRail from a payments-first PoC into a **confidential lending layer on Arc** — "earn the
same yield as public venues (Morpho/Aave), but keep your position private" — across multiple asset
markets, with a polished multi-market frontend. Payments is kept as a **secondary, subordinate** module.

### Renamed / generalized
- **`ConfidentialUSDC` → `ConfidentialToken`** (and `IConfidentialUSDC` → `IConfidentialToken`): now a
  **generic** ERC-7984-flavored wrapper over ANY ERC20 (reads + exposes the underlying's `decimals()`).
  One instance per market underlying (cUSDC, cWETH, cWBTC, cEURC, cUSTB).
- `ConfidentialVaultRouter` fields `cusdc`/`usdc` → `cToken`/`underlying` (generic, per-market).

### Added
- **`MockERC20`** — configurable-decimals mock underlying for the simulated markets (WETH 18-dec, WBTC
  8-dec, EURC/Treasury 6-dec).
- **Multi-market tests:** `MultiMarket.t.sol` (market independence + cross-decimal conservation) and a
  **H-1 bounded-gas regression** in `VaultRouter.t.sol` (many distinct depositors → `executeBatch` runs
  in O(1) / bounded gas — proves the pull-based router is not griefable). TestBase now deploys a
  **multi-market** stack (USDC 6-dec + WETH 18-dec). **56 tests, 0 failing.**
- **Multi-asset Arc deploy:** `DeployArcTestnet.s.sol` now deploys 5 markets — the LIVE USDC market over
  real Arc testnet USDC (`simulated:false`) + WETH/WBTC/EURC/Treasury over mock underlyings
  (`simulated:true`) — and writes a per-market `deployments/arc-testnet.json` (`markets[]`). Re-deployed +
  smoke-tested on Arc; hashes in `deployments/arc-testnet-smoke.md`.
- **Frontend:** a multi-market **Markets** hero page (per-asset APY/TVL/venue cards, live-vs-simulated
  badges), per-market **Earn**, multi-market data layer (`lib/markets.ts`), nav reordered to lead with
  lending; **Payments demoted** to the last, subordinate item.

### Unchanged (already correct from v1)
- The pull-based router (O(1) `executeBatch`, `claimShares`/`claim`, `cancelDeposit`/`cancelWithdraw`),
  virtual-offset share math, zero-admin design, stateful fuzz invariants, the SDK 402 round-trip, and the
  honest APS-preview stance (privacy notional until APS ships).

### Removed
- USDC-hardcoding in the confidential token; the payments-as-hero framing.
