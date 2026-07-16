# GhostRail — Arc testnet deployment + smoke (multi-asset × multi-venue)

**Network:** Arc Testnet · chainId `5042002` · RPC `https://rpc.testnet.arc.network` · Explorer
https://testnet.arcscan.app · **Deployer/auditor** `0xF505e2E71df58D7244189072008f25f6b6aaE5ae` · **real Arc
USDC** `0x3600000000000000000000000000000000000000`.

The lending layer is deployed **multi-asset × multi-venue**: **5 assets × 2 venues (Morpho / Aave) = 10
markets**. Each asset shares one `ConfidentialToken`; each (asset, venue) is its own `MockLendingVenue` +
pull-based `ConfidentialVaultRouter`. Only **cUSDC · Morpho** is LIVE (real Arc USDC); every other
(asset, venue) pair is `simulated:true` (mock underlying + mock venue). Full addresses:
[`arc-testnet.json`](./arc-testnet.json).

## Live market routers (the two USDC venues)

| Market | Router | Status |
|---|---|---|
| **cUSDC · Morpho** | [`0x568c85e2956b666B6B1E82607d9CC853A1134F9D`](https://testnet.arcscan.app/address/0x568c85e2956b666B6B1E82607d9CC853A1134F9D) | **LIVE** (real USDC) |
| cUSDC · Aave | [`0xc9Bf118F3eaE3E5cdfB08F7F3f35Ac6d0B9B567a`](https://testnet.arcscan.app/address/0xc9Bf118F3eaE3E5cdfB08F7F3f35Ac6d0B9B567a) | simulated |

cWETH / cWBTC / cEURC / cUSTB each have Morpho + Aave routers (all simulated) — see `arc-testnet.json`.
Shared: **cUSDC token** `0xB0e195dcB60f5f8179aef7c57722318CC83Bd419` · **PaymentLedger** (secondary)
`0x32f2fb56D586606904Fc24C5f9056Aba3f28888A`.

## Smoke — full deposit + withdraw round-trip on the LIVE cUSDC · Morpho market (real tx hashes)

Every step is a separate `cast send` broadcast; all confirmed **`status: success`** on-chain (blocks
52093069 → 52093378). Two 60s batch windows elapsed between the deposit and withdraw executions.

| # | Step | Tx |
|---|---|---|
| 1 | approve USDC → cUSDC | [`0xf16ee430…07ea7`](https://testnet.arcscan.app/tx/0xf16ee4301caff667b99fb644e4a16b0444539ea30bab511d31ab976c34807ea7) |
| 2 | shield 2 USDC → cUSDC | [`0x088cce9d…052c3`](https://testnet.arcscan.app/tx/0x088cce9d7f2accdb700e8017e470b643abf339045ee5ff8ca91a9609adf052c3) |
| 3 | setOperator(router) | [`0x8de8777e…41049`](https://testnet.arcscan.app/tx/0x8de8777e3688fa33691e897babc4532c16b1645e9d8d8b48c54f11767ed41049) |
| 4 | deposit 1 USDC (batch 2) | [`0x04ee8742…301d9d`](https://testnet.arcscan.app/tx/0x04ee8742bb3855aae39aed10f4f09710eee06210cf11342c4e41802094301d9d) |
| 5 | executeBatch #1 — net **in** to venue | [`0x8f0131b4…db6b59`](https://testnet.arcscan.app/tx/0x8f0131b4956312aecc46dba80d81712fd7a2d4cd2472356d9698f81ecadb6b59) |
| 6 | claimShares (pull shares) | [`0x7d3f99b6…ece5ef`](https://testnet.arcscan.app/tx/0x7d3f99b600f2e49191d8186304e67a2c56c7d28de478c1db1d32f01469ece5ef) |
| 7 | requestWithdraw all (batch 3) | [`0x54e8a5e3…f77176`](https://testnet.arcscan.app/tx/0x54e8a5e33fde00149c28fa6ea1f4ae36690952aa649c1b24fb4d5c3a1bf77176) |
| 8 | executeBatch #2 — net **out** of venue | [`0xe59477d2…816b7f`](https://testnet.arcscan.app/tx/0xe59477d2b10d1ead90031d0423a7cadde74a242b31ea306acc3527a71a816b7f) |
| 9 | claim (pull cUSDC back) | [`0xf59b22da…8221c3`](https://testnet.arcscan.app/tx/0xf59b22da9b009f0a748bf4e6600918a7d12cd2c2f4afadf2e47084382d8221c3) |

**Cost basis (`positionOf`) demonstrated on-chain (gated read, as the holder):**
- After deposit: `positionOf → (shares 1e9, deposited 1e6, currentValue 1e6)` — the basis equals the 1 USDC
  actually put in; `earned = currentValue − deposited = 0` (no yield accrued on the mock venue in this run).
- After full exit: `positionOf → (0, 0, 0)` — the proportional basis release zeroes it exactly on a full
  withdrawal.

This proves the **display-only cost basis** is correct on-chain (deposited / value / earned) and that the
full **GhostGate round-trip** nets *in* then *out* through the single public venue position — only the net
crosses the boundary each batch. **"USDC integrated" is true and checkable on the explorer.**

## Honesty note

APS is not live, so on Arc testnet the confidentiality layer is **notional** (storage readable; view-gating
not enforced vs `eth_call` spoofing). Live now: the **protocol logic** and a **real USDC integration** on
the cUSDC · Morpho market. All other markets are **simulated** (mock underlyings + mock venues), clearly
tagged. Framing: *protocol live on Arc testnet, USDC-integrated, architected for APS; confidentiality
activates when APS ships.* Never "privacy is live."

> Deploy ran via `forge script`; the smoke was driven with `cast send` (Arc USDC calls a native compliance
> precompile `0x1800…0001` that forge's local simulation can't execute).
