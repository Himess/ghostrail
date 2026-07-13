// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";

/// @notice Module A story, on-chain and narrated: an AI agent funds a confidential payment account once,
///         pays two paid-tool services many times, a service verifies a receipt, an auditor exports a
///         statement under a view key, and a service cashes out through the timing-decorrelation window.
///         Run: `forge script script/DemoPayment.s.sol -vv`
contract DemoPayment is Script {
    MockUSDC usdc;
    ConfidentialToken cusdc;
    ConfidentialPaymentLedger ledger;

    uint64 constant WINDOW = 3600;

    address agent = _mk("agent");
    address serviceA = _mk("serviceA (web-search tool)");
    address serviceB = _mk("serviceB (data feed)");
    address auditor = _mk("auditor");

    function _mk(string memory name) internal returns (address a) {
        a = vm.addr(uint256(keccak256(bytes(name))));
        vm.label(a, name);
    }

    function run() external {
        _hr("DEPLOY");
        usdc = new MockUSDC();
        cusdc = new ConfidentialToken(IERC20(address(usdc)));
        ledger = new ConfidentialPaymentLedger(cusdc, WINDOW);
        console2.log("ConfidentialToken   :", address(cusdc));
        console2.log("PaymentLedger      :", address(ledger));

        vm.recordLogs(); // begin capturing what an outside observer could see

        _hr("SHIELD (public boundary-in: amounts ARE visible here by design)");
        _shield(agent, 5_000e6);
        _shield(serviceA, 0); // services need no starting balance; they earn inside the ledger
        console2.log("agent shielded 5,000 USDC -> cUSDC (this crossing is PUBLIC)");

        _hr("FUND the confidential account (amount hidden from here on)");
        vm.startPrank(agent);
        cusdc.setOperator(address(ledger), uint48(block.timestamp + 1 days));
        ledger.fund(3_000e6);
        vm.stopPrank();
        console2.log("agent funded the ledger. Public aggregate totalLedgerBalance:", ledger.totalLedgerBalance());

        _hr("PAY services (no amount, no counterparty in any event)");
        vm.startPrank(agent);
        bytes32 r1 = ledger.pay(serviceA, 120e6, keccak256("search:q1"));
        ledger.pay(serviceA, 80e6, keccak256("search:q2"));
        ledger.pay(serviceA, 200e6, keccak256("search:q3"));
        ledger.pay(serviceB, 50e6, keccak256("feed:tick"));
        vm.stopPrank();
        console2.log("agent paid serviceA x3 and serviceB x1. Each emitted only an opaque receiptId.");

        _hr("VERIFY a receipt (only the service can, from its own wallet)");
        vm.prank(serviceA);
        bool ok = ledger.verifyReceipt(r1, serviceA, 120e6, keccak256("search:q1"));
        console2.log("serviceA verifyReceipt(r1) =>", ok);

        _hr("AUDIT under a view key (compliance-native selective disclosure)");
        vm.prank(agent);
        ledger.grantViewKey(auditor);
        vm.prank(auditor);
        ConfidentialPaymentLedger.Receipt[] memory st = ledger.exportStatement(agent, 0, 10);
        console2.log("auditor exported the agent's statement. Rows:", st.length);
        for (uint256 i; i < st.length; ++i) {
            console2.log(
                string.concat("  receipt ", vm.toString(i), " -> service ", vm.toString(st[i].service)),
                "amount",
                st[i].amount
            );
        }

        _hr("CASH OUT through the decorrelation window");
        vm.prank(serviceA);
        ledger.requestWithdraw(400e6); // serviceA earned 120+80+200
        console2.log("serviceA requested withdraw; not yet claimable (timing decorrelation).");
        vm.warp(block.timestamp + WINDOW);
        vm.prank(serviceA);
        ledger.claimWithdraw();
        vm.prank(serviceA);
        cusdc.unshield(400e6); // public boundary-out
        console2.log("after the window serviceA claimed + unshielded 400 (PUBLIC boundary-out).");

        _hr("SOLVENCY (anyone can check; reveals no individual)");
        (uint256 internalSum, uint256 backing) = ledger.checkSolvency();
        console2.log("ledger internalSum :", internalSum);
        console2.log("ledger backing     :", backing);
        require(internalSum == backing, "insolvent");

        _observerView();
    }

    function _shield(address who, uint256 amount) internal {
        if (amount == 0) return;
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(cusdc), amount);
        cusdc.shield(amount);
        vm.stopPrank();
    }

    /// @dev Tally what a block-explorer-only observer learned across the whole flow.
    function _observerView() internal {
        _hr("WHAT AN OUTSIDE OBSERVER SAW");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 shielded;
        uint256 unshielded;
        uint256 payments;
        uint256 amountCarrying;
        bytes32 sh = keccak256("Shielded(address,uint256)");
        bytes32 un = keccak256("Unshielded(address,uint256)");
        bytes32 pe = keccak256("PaymentExecuted(bytes32)");
        for (uint256 i; i < logs.length; ++i) {
            bytes32 t = logs[i].topics[0];
            if (t == sh) shielded++;
            else if (t == un) unshielded++;
            else if (t == pe) payments++;
            // count only ledger/cusdc events that carry a non-indexed amount word
            if ((t == sh || t == un) && logs[i].emitter == address(cusdc)) amountCarrying++;
        }
        console2.log("  Shielded (public in)      :", shielded);
        console2.log("  Unshielded (public out)   :", unshielded);
        console2.log("  PaymentExecuted (opaque)  :", payments, "<- no amount, no service, no ref");
        console2.log("  events revealing an amount :", amountCarrying, "<- ONLY boundary crossings");
        console2.log("  Participants (agent/service/auditor) see the full detail via gated views.");
    }

    function _hr(string memory s) internal pure {
        console2.log("");
        console2.log(string.concat("== ", s, " =="));
    }
}
