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

/// @notice Deploys the multi-asset, multi-venue confidential lending layer to Arc public testnet. Per
///         ASSET: one shared `ConfidentialToken`. Per (asset, VENUE): a `MockLendingVenue` +
///         `ConfidentialVaultRouter` — so each asset can route to more than one venue (Morpho, Aave), like
///         a real confidential lending aggregator. The (USDC, Morpho) market wraps the REAL Arc testnet
///         USDC and is LIVE; every other (asset, venue) pair is `simulated:true` (mock underlying/venue).
///         Confidentiality is NOTIONAL on Arc testnet (APS not live). Env-driven; reverts on missing vars.
///
///  Run:  forge script script/DeployArcTestnet.s.sol --rpc-url $ARC_TESTNET_RPC --broadcast
contract DeployArcTestnet is Script {
    uint64 batchWindow;
    address auditor;

    // Two venues per asset. (USDC, Morpho) is the single LIVE market.
    string[2] VENUES = ["Morpho", "Aave"];

    string assetsJson; // accumulated during broadcast

    function run() external {
        uint256 pk = _envUintReq("DEPLOYER_PRIVATE_KEY");
        uint256 expectedChainId = _envUintReq("ARC_TESTNET_CHAIN_ID");
        address usdcAddr = _envAddrReq("ARC_USDC_ADDRESS");

        address deployer = vm.addr(pk);
        auditor = vm.envOr("ARC_AUDITOR_ADDRESS", deployer);
        batchWindow = uint64(vm.envOr("ROUTER_BATCH_WINDOW", uint256(60)));
        uint64 withdrawWindow = uint64(vm.envOr("LEDGER_WITHDRAW_WINDOW", uint256(3600)));
        string memory explorer = vm.envOr("ARC_EXPLORER_URL", string(""));

        require(block.chainid == expectedChainId, "Connected chain != ARC_TESTNET_CHAIN_ID");
        require(usdcAddr.code.length > 0, "ARC_USDC_ADDRESS is not a contract on this chain");

        console2.log("== GhostRail multi-asset x multi-venue -> Arc testnet ==");
        console2.log("deployer :", deployer);

        // asset definitions: symbol, underlyingName, underlyingSym, decimals, live(real USDC)
        string[5] memory syms = ["cUSDC", "cWETH", "cWBTC", "cEURC", "cUSTB"];
        string[5] memory uNames =
            ["", "Wrapped Ether", "Wrapped Bitcoin", "Euro Coin", "Tokenized Treasury"];
        string[5] memory uSyms = ["USDC", "WETH", "WBTC", "EURC", "USTB"];
        uint8[5] memory decs = [6, 18, 8, 6, 6];

        vm.startBroadcast(pk);

        address topCUSDC;
        address topVenue;
        address topRouter;
        ConfidentialPaymentLedger ledger;

        for (uint256 i; i < 5; ++i) {
            bool assetLive = (i == 0);
            address underlying = assetLive ? usdcAddr : address(new MockERC20(uNames[i], uSyms[i], decs[i]));
            ConfidentialToken cToken = new ConfidentialToken(IERC20(underlying)); // shared across the asset's venues
            if (i == 0) ledger = new ConfidentialPaymentLedger(cToken, withdrawWindow);

            string memory venuesJson;
            for (uint256 v; v < 2; ++v) {
                bool live = (i == 0 && v == 0); // only (USDC, Morpho)
                MockLendingVenue venue = new MockLendingVenue(IERC20(underlying));
                ConfidentialVaultRouter router =
                    new ConfidentialVaultRouter(cToken, IERC20(underlying), venue, auditor, batchWindow);
                if (live) {
                    topCUSDC = address(cToken);
                    topVenue = address(venue);
                    topRouter = address(router);
                }
                venuesJson = string.concat(
                    venuesJson, _venueJson(VENUES[v], address(venue), address(router), !live), v == 0 ? ",\n" : "\n"
                );
            }
            assetsJson = string.concat(
                assetsJson,
                _assetJson(syms[i], underlying, address(cToken), decs[i], assetLive, venuesJson),
                i < 4 ? ",\n" : "\n"
            );
            console2.log(string.concat("  ", syms[i], assetLive ? " (LIVE underlying)" : " (simulated)"), address(cToken));
        }

        vm.stopBroadcast();

        console2.log("  ledger :", address(ledger));
        _writeJson(usdcAddr, address(ledger), topCUSDC, topVenue, topRouter);
        if (bytes(explorer).length > 0) {
            console2.log(string.concat("  live USDC/Morpho router: ", explorer, "/address/", vm.toString(topRouter)));
        }
        console2.log("Wrote deployments/arc-testnet.json (assets x venues). Privacy notional until APS.");
    }

    function _venueJson(string memory name, address venue, address router, bool simulated)
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            '        { "name": "', name, '", "venue": "', vm.toString(venue), '", "router": "', vm.toString(router),
            '", "simulated": ', simulated ? "true" : "false", " }"
        );
    }

    function _assetJson(
        string memory symbol,
        address underlying,
        address cToken,
        uint8 dec,
        bool live,
        string memory venuesJson
    ) internal pure returns (string memory) {
        return string.concat(
            '    {\n      "symbol": "', symbol, '", "underlying": "', vm.toString(underlying),
            '", "cToken": "', vm.toString(cToken), '", "decimals": ', vm.toString(dec),
            ', "live": ', live ? "true" : "false", ',\n      "venues": [\n', venuesJson, "      ]\n    }"
        );
    }

    function _writeJson(address usdcAddr, address ledger, address cUSDC, address venue, address router) internal {
        string memory j = "{\n";
        j = string.concat(j, '  "chainId": ', vm.toString(block.chainid), ",\n");
        j = string.concat(j, '  "auditor": "', vm.toString(auditor), '",\n');
        j = string.concat(j, '  "ledger": "', vm.toString(ledger), '",\n');
        j = string.concat(j, '  "usdc": "', vm.toString(usdcAddr), '",\n');
        // top-level LIVE USDC/Morpho market (smoke script + primary)
        j = string.concat(j, '  "cUSDC": "', vm.toString(cUSDC), '",\n');
        j = string.concat(j, '  "venue": "', vm.toString(venue), '",\n');
        j = string.concat(j, '  "vaultRouter": "', vm.toString(router), '",\n');
        j = string.concat(j, '  "assets": [\n', assetsJson, "  ]\n}\n");
        vm.writeFile("./deployments/arc-testnet.json", j);
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
