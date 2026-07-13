// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "forge-std/Vm.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";

contract PaymentLedgerTest is TestBase {
    bytes32 constant REF = keccak256("invoice-42");

    function _fund(address who, uint256 amount) internal {
        _shield(who, amount);
        _approveOperator(who, address(ledger));
        vm.prank(who);
        ledger.fund(amount);
    }

    // --- fund → pay → receipt verify -----------------------------------------

    function test_fund_then_pay_and_verify_receipt() public {
        _fund(alice, 1_000e6);
        assertEq(ledger.totalLedgerBalance(), 1_000e6);

        vm.prank(alice);
        bytes32 rid = ledger.pay(serviceA, 250e6, REF);

        // payer sees own balance drop; service balance rises (each reads its own)
        vm.prank(alice);
        assertEq(ledger.balanceOf(alice), 750e6);
        vm.prank(serviceA);
        assertEq(ledger.balanceOf(serviceA), 250e6);

        // service verifies the receipt from its own wallet
        vm.prank(serviceA);
        assertTrue(ledger.verifyReceipt(rid, serviceA, 250e6, REF), "exact match");
        vm.prank(serviceA);
        assertTrue(ledger.verifyReceipt(rid, serviceA, 200e6, REF), "min-amount satisfied");
    }

    function test_verifyReceipt_false_on_mismatch() public {
        _fund(alice, 1_000e6);
        vm.prank(alice);
        bytes32 rid = ledger.pay(serviceA, 250e6, REF);

        vm.startPrank(serviceA);
        assertFalse(ledger.verifyReceipt(rid, serviceB, 250e6, REF), "wrong service");
        assertFalse(ledger.verifyReceipt(rid, serviceA, 251e6, REF), "amount above min");
        assertFalse(ledger.verifyReceipt(rid, serviceA, 250e6, keccak256("other")), "wrong ref");
        vm.stopPrank();
    }

    function test_insufficient_balance_pay_reverts() public {
        _fund(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(ConfidentialPaymentLedger.InsufficientBalance.selector);
        ledger.pay(serviceA, 101e6, REF);
    }

    // --- access control on confidential surfaces -----------------------------

    function test_stranger_blocked_on_balance_receipt_statement() public {
        _fund(alice, 1_000e6);
        vm.prank(alice);
        bytes32 rid = ledger.pay(serviceA, 250e6, REF);

        vm.startPrank(stranger);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.balanceOf(alice);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.receiptOf(rid);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.exportStatement(alice, 0, 10);
        vm.stopPrank();
    }

    function test_payer_reads_own_history() public {
        _fund(alice, 1_000e6);
        vm.startPrank(alice);
        ledger.pay(serviceA, 100e6, REF);
        ledger.pay(serviceB, 50e6, keccak256("b"));
        ConfidentialPaymentLedger.Receipt[] memory st = ledger.exportStatement(alice, 0, 10);
        vm.stopPrank();
        assertEq(st.length, 2, "two receipts as payer");
        assertEq(st[0].service, serviceA);
        assertEq(st[1].amount, 50e6);
    }

    function test_viewkey_grant_then_revoke() public {
        _fund(alice, 1_000e6);
        vm.prank(alice);
        ledger.pay(serviceA, 100e6, REF);

        // grant auditor a view key → can read balance + statement
        vm.prank(alice);
        ledger.grantViewKey(auditor);
        vm.startPrank(auditor);
        assertEq(ledger.balanceOf(alice), 900e6);
        assertEq(ledger.exportStatement(alice, 0, 10).length, 1);
        vm.stopPrank();

        // revoke → blocked
        vm.prank(alice);
        ledger.grantViewKey(address(0));
        vm.prank(auditor);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.balanceOf(alice);
    }

    // --- withdraw batching (timing decorrelation) ----------------------------

    function test_withdraw_before_window_reverts_after_pays_out() public {
        _fund(alice, 1_000e6);
        vm.prank(alice);
        ledger.pay(serviceA, 400e6, REF);

        // service requests withdraw of its earnings
        vm.prank(serviceA);
        ledger.requestWithdraw(400e6);

        // before the window closes → revert
        vm.prank(serviceA);
        vm.expectRevert(ConfidentialPaymentLedger.WindowNotClosed.selector);
        ledger.claimWithdraw();

        // after the window → cUSDC lands in the service wallet
        vm.warp(block.timestamp + WITHDRAW_WINDOW);
        vm.prank(serviceA);
        ledger.claimWithdraw();
        assertEq(_cBal(serviceA), 400e6, "service holds cUSDC after claim");
        assertEq(ledger.totalLedgerBalance(), 600e6, "ledger aggregate dropped");
    }

    function test_double_pending_withdraw_reverts() public {
        _fund(alice, 1_000e6);
        vm.startPrank(alice);
        ledger.requestWithdraw(100e6);
        vm.expectRevert(ConfidentialPaymentLedger.WithdrawAlreadyPending.selector);
        ledger.requestWithdraw(100e6);
        vm.stopPrank();
    }

    // --- solvency conservation (fuzz) ----------------------------------------

    function testFuzz_conservation(uint96 fundA, uint96 fundB, uint96 payAmt) public {
        fundA = uint96(bound(fundA, 1e6, 1_000_000e6));
        fundB = uint96(bound(fundB, 1e6, 1_000_000e6));
        payAmt = uint96(bound(payAmt, 0, fundA));

        _fund(alice, fundA);
        _fund(bob, fundB);
        if (payAmt > 0) {
            vm.prank(alice);
            ledger.pay(serviceA, payAmt, REF);
        }

        // Invariant: internal accounting total == cUSDC actually held by the ledger.
        (uint256 internalSum, uint256 backing) = ledger.checkSolvency();
        assertEq(internalSum, uint256(fundA) + fundB, "internal");
        assertEq(backing, uint256(fundA) + fundB, "backing");
        assertEq(internalSum, backing, "solvent");
    }

    // --- event hygiene: only opaque receiptId, no amount/service/ref ----------

    function test_payment_event_is_opaque() public {
        _fund(alice, 1_000e6);
        vm.recordLogs();
        vm.prank(alice);
        bytes32 rid = ledger.pay(serviceA, 777e6, REF);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("PaymentExecuted(bytes32)");
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == sig) {
                found = true;
                assertEq(logs[i].topics[1], rid, "opaque receiptId indexed");
                assertEq(logs[i].data.length, 0, "no amount/service/ref in data");
                // the amount must not appear anywhere in the event
                assertTrue(uint256(logs[i].topics[1]) != 777e6, "receiptId != amount");
            }
        }
        assertTrue(found, "PaymentExecuted emitted");
    }
}
