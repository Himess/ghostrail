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
| **cUSDC · Morpho** | [`0xCEDA3eE062a10Dd274f4a243a0601E434063d024`](https://testnet.arcscan.app/address/0xCEDA3eE062a10Dd274f4a243a0601E434063d024) | **LIVE** (real USDC) |
| cUSDC · Aave | [`0x4BDC81797936fccB85BA1dF03E0e314ffa7E5EAd`](https://testnet.arcscan.app/address/0x4BDC81797936fccB85BA1dF03E0e314ffa7E5EAd) | simulated |

cWETH / cWBTC / cEURC / cUSTB each have Morpho + Aave routers (all simulated) — see `arc-testnet.json`.
Shared: **cUSDC token** `0x5d97184fb174f00EFD938277D405083DCdC9F562` · **PaymentLedger** (secondary)
`0x3957406ca80C8176C557DDCFEE83D482cFB241E1`.

## Smoke — full pull flow on the LIVE cUSDC · Morpho market (real tx hashes)

| Step | Tx |
|---|---|
| approve + shield 1 USDC | `0xb6705392c7aa9cd0482fb753a52cacca43b2441d71ec56a878d7b7379c121e80` |
| deposit 1 USDC (router) | `0xb23daafdc5805fd9316a14745588ff9597a3e5f85f2ecb12824f93026762d308` |
| executeBatch (net crossing) | `0x3608f84754f46ee1057749e813dee8ee1e5579b91bf42d95543b80d58b237530` |
| claimShares (pull) | `0xf5e518b969c0efca5b5272111b8abe43f6a73390908ef91442e104d90c2c994c` |

**On-chain reads after the smoke:** `sharesOf → 1e9`, `totalAssets → 1e6` (the net crossed to the venue).
**"USDC integrated" is true and checkable on the explorer.**

## Honesty note

APS is not live, so on Arc testnet the confidentiality layer is **notional** (storage readable; view-gating
not enforced vs `eth_call` spoofing). Live now: the **protocol logic** and a **real USDC integration** on
the cUSDC · Morpho market. All other markets are **simulated** (mock underlyings + mock venues), clearly
tagged. Framing: *protocol live on Arc testnet, USDC-integrated, architected for APS; confidentiality
activates when APS ships.* Never "privacy is live."

> Deploy ran via `forge script`; the smoke was driven with `cast send` (Arc USDC calls a native compliance
> precompile `0x1800…0001` that forge's local simulation can't execute).
