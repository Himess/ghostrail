// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockLendingVenue} from "../src/mocks/MockLendingVenue.sol";

/// @notice Deploys the MULTI-ASSET GhostRail lending layer to Arc public testnet. The USDC market wraps
///         the REAL Arc testnet USDC (`simulated:false`); the other markets (WETH/WBTC/EURC/Treasury) wrap
///         freshly deployed mock underlyings because those assets/venues aren't on Arc testnet yet
///         (`simulated:true`). One generic architecture per market: ConfidentialToken + MockLendingVenue +
///         ConfidentialVaultRouter. All config comes from env vars; the script reverts naming any missing
///         one. Confidentiality is NOTIONAL on Arc testnet (APS not live) — protocol logic + real USDC are live.
///
///  Run:  forge script script/DeployArcTestnet.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast
contract DeployArcTestnet is Script {
    struct Market {
        string symbol; // confidential token symbol, e.g. "cWETH"
        address underlying;
        address cToken;
        address venue;
        address router;
        uint8 decimals;
        bool simulated;
    }

    uint64 batchWindow;
    address auditor;

    function run() external {
        uint256 deployerPk = _envUintReq("DEPLOYER_PRIVATE_KEY");
        uint256 expectedChainId = _envUintReq("ARC_TESTNET_CHAIN_ID");
        address usdcAddr = _envAddrReq("ARC_USDC_ADDRESS");

        address deployer = vm.addr(deployerPk);
        auditor = vm.envOr("ARC_AUDITOR_ADDRESS", deployer);
        batchWindow = uint64(vm.envOr("ROUTER_BATCH_WINDOW", uint256(60)));
        uint64 withdrawWindow = uint64(vm.envOr("LEDGER_WITHDRAW_WINDOW", uint256(3600)));
        string memory explorer = vm.envOr("ARC_EXPLORER_URL", string(""));

        require(block.chainid == expectedChainId, "Connected chain != ARC_TESTNET_CHAIN_ID");
        require(usdcAddr.code.length > 0, "ARC_USDC_ADDRESS is not a contract on this chain");

        console2.log("== GhostRail multi-asset -> Arc testnet ==");
        console2.log("chainId  :", block.chainid);
        console2.log("deployer :", deployer);
        console2.log("USDC     :", usdcAddr, "(real Arc testnet USDC)");

        vm.startBroadcast(deployerPk);

        Market[] memory markets = new Market[](5);
        // Market 0 — the LIVE USDC market over the real Arc testnet USDC (never a mock).
        markets[0] = _market("cUSDC", "", "", 0, false, usdcAddr);
        // Payments ledger sits on the USDC confidential token (secondary module).
        ConfidentialPaymentLedger ledger = new ConfidentialPaymentLedger(ConfidentialToken(markets[0].cToken), withdrawWindow);
        // Simulated markets — assets/venues not yet on Arc testnet; mock underlyings, clearly tagged.
        markets[1] = _market("cWETH", "Wrapped Ether", "WETH", 18, true, address(0));
        markets[2] = _market("cWBTC", "Wrapped Bitcoin", "WBTC", 8, true, address(0));
        markets[3] = _market("cEURC", "Euro Coin", "EURC", 6, true, address(0));
        markets[4] = _market("cUSTB", "Tokenized Treasury", "USTB", 6, true, address(0));

        vm.stopBroadcast();

        for (uint256 i; i < markets.length; ++i) {
            console2.log(
                string.concat("  ", markets[i].symbol, markets[i].simulated ? " (simulated)" : " (LIVE USDC)"),
                markets[i].router
            );
        }
        console2.log("  ledger :", address(ledger));

        _writeJson(usdcAddr, address(ledger), markets);

        if (bytes(explorer).length > 0) {
            console2.log("");
            for (uint256 i; i < markets.length; ++i) {
                console2.log(string.concat("  ", markets[i].symbol, " router: ", explorer, "/address/", vm.toString(markets[i].router)));
            }
        }
        console2.log("");
        console2.log("Wrote deployments/arc-testnet.json. NOTE: privacy is notional until APS ships.");
    }

    /// @dev Deploy one market's stack. For the live market pass the real underlying; for simulated markets
    ///      pass a mock name/symbol/decimals and address(0) — a fresh MockERC20 is deployed.
    function _market(
        string memory symbol,
        string memory underlyingName,
        string memory underlyingSym,
        uint8 dec,
        bool simulated,
        address realUnderlying
    ) internal returns (Market memory m) {
        address u = realUnderlying;
        if (simulated) u = address(new MockERC20(underlyingName, underlyingSym, dec));
        ConfidentialToken ct = new ConfidentialToken(IERC20(u));
        MockLendingVenue venue = new MockLendingVenue(IERC20(u));
        ConfidentialVaultRouter router = new ConfidentialVaultRouter(ct, IERC20(u), venue, auditor, batchWindow);
        m = Market({
            symbol: symbol,
            underlying: u,
            cToken: address(ct),
            venue: address(venue),
            router: address(router),
            decimals: ct.decimals(),
            simulated: simulated
        });
    }

    function _writeJson(address usdcAddr, address ledger, Market[] memory markets) internal {
        Market memory m0 = markets[0];
        // Top-level USDC-market keys kept for the smoke script + primary market.
        string memory j = "{\n";
        j = string.concat(j, '  "chainId": ', vm.toString(block.chainid), ",\n");
        j = string.concat(j, '  "auditor": "', vm.toString(auditor), '",\n');
        j = string.concat(j, '  "ledger": "', vm.toString(ledger), '",\n');
        j = string.concat(j, '  "usdc": "', vm.toString(usdcAddr), '",\n');
        j = string.concat(j, '  "cUSDC": "', vm.toString(m0.cToken), '",\n');
        j = string.concat(j, '  "venue": "', vm.toString(m0.venue), '",\n');
        j = string.concat(j, '  "vaultRouter": "', vm.toString(m0.router), '",\n');
        j = string.concat(j, '  "markets": [\n');
        for (uint256 i; i < markets.length; ++i) {
            j = string.concat(j, _marketJson(markets[i]), i + 1 < markets.length ? ",\n" : "\n");
        }
        j = string.concat(j, "  ]\n}\n");
        vm.writeFile("./deployments/arc-testnet.json", j);
    }

    function _marketJson(Market memory m) internal pure returns (string memory) {
        return string.concat(
            "    { ",
            '"symbol": "', m.symbol, '", ',
            '"underlying": "', vm.toString(m.underlying), '", ',
            '"cToken": "', vm.toString(m.cToken), '", ',
            '"venue": "', vm.toString(m.venue), '", ',
            '"router": "', vm.toString(m.router), '", ',
            '"decimals": ', vm.toString(m.decimals), ", ",
            '"simulated": ', m.simulated ? "true" : "false",
            " }"
        );
    }

    function _envAddrReq(string memory k) internal view returns (address v) {
        v = vm.envOr(k, address(0));
        require(v != address(0), string.concat("Missing required env var: ", k));
    }

    function _envUintReq(string memory k) internal view returns (uint256 v) {
        v = vm.envOr(k, uint256(0));
        require(v != 0, string.concat("Missing required env var: ", k));
    }
}
