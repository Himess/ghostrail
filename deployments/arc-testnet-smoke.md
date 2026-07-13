# GhostRail — Arc testnet live deployment + smoke (multi-asset)

**Network:** Arc Testnet · chainId `5042002` · RPC `https://rpc.testnet.arc.network`
**Explorer:** https://testnet.arcscan.app
**Deployer / auditor:** `0xF505e2E71df58D7244189072008f25f6b6aaE5ae`
**Live underlying:** real Arc testnet USDC `0x3600000000000000000000000000000000000000` (6-dec)

The lending layer is deployed **multi-asset**: the USDC market wraps the **real** Arc testnet USDC
(`simulated:false`); the WETH/WBTC/EURC/Treasury markets wrap freshly deployed mock underlyings
(`simulated:true`), since those assets/venues aren't on Arc testnet yet. One generic architecture per
market: `ConfidentialToken` + `MockLendingVenue` + `ConfidentialVaultRouter` (pull-based). Full addresses
in [`arc-testnet.json`](./arc-testnet.json).

## Markets (routers)

| Market | Router | Decimals | Status |
|---|---|---|---|
| **cUSDC** | [`0xA2E34e…853A`](https://testnet.arcscan.app/address/0xA2E34eA6aD25675f792e48A3D75875147502853A) | 6 | **LIVE** (real USDC) |
| cWETH | [`0xAEF65E…8A23`](https://testnet.arcscan.app/address/0xAEF65E9527946d2C8904f9Fbfc7575F54B208A23) | 18 | simulated |
| cWBTC | [`0xa7cCB8…a87b`](https://testnet.arcscan.app/address/0xa7cCB8f57a95007A043d017d64511C13b9d9a87b) | 8 | simulated |
| cEURC | [`0xAEB94A…7402`](https://testnet.arcscan.app/address/0xAEB94AF55B126b69ffFA8C249E0FA5806D047402) | 6 | simulated |
| cUSTB | [`0x7Ef62e…6411`](https://testnet.arcscan.app/address/0x7Ef62e133c52e74453A5930F9D923174aBf66411) | 6 | simulated |

Shared: **cUSDC token** `0x84a11930aB28499ccEA5cb38CfbbaA9373D067d8` · **PaymentLedger** (secondary)
`0xe6D940a00fE26AFb44495F1D23583457f2b07b9A`.

## Smoke — full pull flow on the LIVE USDC market (real tx hashes)

| Step | Tx |
|---|---|
| approve + shield 2 USDC | `0xaea9df94edde19ef8591a3b247a281fabe022f47e4a3bef13780975b3dd6b038` |
| setOperator (ledger + router) | `0x5119b57a123517fd286ea2a691d38411fe3cad15e5d53f16483132c96ee72f29` |
| fund 1 USDC (ledger) | `0x9cae3397d65bede8d92baaeb736e4035f1a43cb37bc042304c342282b915336f` |
| pay 0.5 USDC (confidential) | `0x18802ef81aaa8facca6a67ac4e0100bd05fd726b2348b62a8b650197bd4c0678` |
| deposit 1 USDC (router) | `0xf4d3e351eeffda4caa8dbb7f76f81fda3372c670c9a85ee2f786cb28c89bc698` |
| executeBatch (net crossing) | `0xb3e2a13cfa213ea2c3feb4ab528dc816bad532254ded38791fbd56b11fc612e4` |
| claimShares (pull) | `0xf2a65cdede8744e2ef45c06c1945a8696b784ed01f1f89ac38f348fd55fbf88d` |

**On-chain reads after the smoke:** `sharesOf → 1e9`, `totalAssets → 1e6` (the net crossed to the venue),
`ledger.checkSolvency → (1e6, 1e6)` — solvent. **"USDC integrated" is true and checkable on the explorer.**

## Honesty note

APS is not live, so on Arc testnet the confidentiality layer is **notional** (storage readable; view-gating
not enforced vs `eth_call` spoofing). Live now: the **protocol logic** and a **real USDC integration**.
The non-USDC markets are **simulated** (mock underlyings + mock venues), clearly tagged `simulated:true`.
Framing: *protocol live on Arc testnet, USDC-integrated, architected for APS; confidentiality activates
when APS ships.* Never "privacy is live."

> Deploy ran via `forge script`; the smoke was driven with `cast send` because Arc's USDC calls a native
> compliance precompile (`0x1800…0001`) that forge's local simulation can't execute.
