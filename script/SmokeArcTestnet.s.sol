// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @notice End-to-end smoke on Arc testnet against the addresses in deployments/arc-testnet.json, using
///         REAL testnet USDC: shield -> fund -> pay -> verify -> vault deposit -> executeBatch. Each
///         state-changing call is a separate broadcast tx; forge prints every tx hash (verifiable on the
///         Arc explorer). The payment is self-directed (payer == service) so the single deployer key can
///         both pay and verify — it exercises the full path honestly.
///
///  Run:  forge script script/SmokeArcTestnet.s.sol \
///          --rpc-url $ARC_TESTNET_RPC --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
///  Tip:  to also execute the batch in the same session, deploy with ROUTER_BATCH_WINDOW=0
///        (otherwise re-run this script once the batch window has elapsed).
contract SmokeArcTestnet is Script {
    function run() external {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        require(pk != 0, "Missing required env var: DEPLOYER_PRIVATE_KEY");
        address me = vm.addr(pk);

        // Load the deployment written by DeployArcTestnet.
        string memory json = vm.readFile("./deployments/arc-testnet.json");
        IERC20 usdc = IERC20(vm.parseJsonAddress(json, ".usdc"));
        ConfidentialToken cusdc = ConfidentialToken(vm.parseJsonAddress(json, ".cUSDC"));
        ConfidentialPaymentLedger ledger = ConfidentialPaymentLedger(vm.parseJsonAddress(json, ".ledger"));
        ConfidentialVaultRouter router = ConfidentialVaultRouter(vm.parseJsonAddress(json, ".vaultRouter"));

        // Small amounts (6-dec USDC). Defaults: shield 2, fund 1, pay 0.5, deposit 1.
        uint256 shieldAmt = vm.envOr("SMOKE_SHIELD", uint256(2e6));
        uint256 fundAmt = vm.envOr("SMOKE_FUND", uint256(1e6));
        uint256 payAmt = vm.envOr("SMOKE_PAY", uint256(5e5));
        uint256 depositAmt = vm.envOr("SMOKE_DEPOSIT", uint256(1e6));
        bytes32 ref = keccak256("ghostrail-smoke");

        require(usdc.balanceOf(me) >= shieldAmt, "deployer lacks testnet USDC (grab from faucet.circle.com)");

        console2.log("== GhostRail Arc-testnet smoke ==");
        console2.log("actor:", me);
        console2.log("shield/fund/pay/deposit:", shieldAmt, fundAmt);

        vm.startBroadcast(pk);

        // 1) shield real USDC -> cUSDC (PUBLIC boundary-in)
        usdc.approve(address(cusdc), shieldAmt);
        cusdc.shield(shieldAmt);

        // 2) authorize the two consumers, then fund the ledger
        cusdc.setOperator(address(ledger), uint48(block.timestamp + 1 days));
        cusdc.setOperator(address(router), uint48(block.timestamp + 1 days));
        ledger.fund(fundAmt);

        // 3) one confidential payment (self-directed so we can also verify it)
        bytes32 receiptId = ledger.pay(me, payAmt, ref);

        // 4) one vault deposit (queued into the open batch)
        uint256 depBatch = router.currentBatch();
        router.deposit(depositAmt);

        // 5) execute the batch if its window has already elapsed, then PULL the shares (pull-based router)
        bool executed;
        if (block.timestamp >= router.batchOpenedAt() + router.batchWindow()) {
            router.executeBatch();
            router.claimShares(depBatch);
            executed = true;
        }

        vm.stopBroadcast();

        // 6) verify the receipt (view; from == service == me)
        bool ok = ledger.verifyReceipt(receiptId, me, payAmt, ref);

        console2.log("");
        console2.log("receiptId :", vm.toString(receiptId));
        console2.log("verifyReceipt =>", ok);
        console2.log("batch executed this run =>", executed);
        (uint256 internalSum, uint256 backing) = ledger.checkSolvency();
        console2.log("ledger solvency internal/backing:", internalSum, backing);
        require(ok, "receipt verification failed");
        if (!executed) {
            console2.log("Batch queued. Re-run after ROUTER_BATCH_WINDOW seconds to execute it.");
        }
        console2.log("Done. Every tx hash above is verifiable on the Arc explorer.");
    }
}
