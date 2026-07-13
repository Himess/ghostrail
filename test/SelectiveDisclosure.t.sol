// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "forge-std/Vm.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @notice Proves the selective-disclosure contract for EVERY confidential surface: owner may read,
///         an authorized viewer/auditor may read, a stranger reverts — and a global event scan proves
///         no confidential value is ever emitted in any topic or data word.
contract SelectiveDisclosureTest is TestBase {
    // Distinctive confidential amounts we will hunt for in the logs. None equals a boundary (shield)
    // amount, so finding one would be a genuine leak.
    uint256 constant PAY_AMOUNT = 777_123456; // ledger pay (confidential)
    uint256 constant XFER_AMOUNT = 333_654321; // cUSDC confidential transfer
    uint256 constant DEP_AMOUNT = 555_222111; // router deposit (confidential)

    function _fundLedger(address who, uint256 amount) internal {
        _shield(who, amount);
        _approveOperator(who, address(ledger));
        vm.prank(who);
        ledger.fund(amount);
    }

    // === three-way access on each surface ===================================

    function test_threeway_cusdc_balance() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.setObserver(auditor);

        vm.prank(alice);
        assertEq(cusdc.confidentialBalanceOf(alice), 1_000e6); // owner
        vm.prank(auditor);
        assertEq(cusdc.confidentialBalanceOf(alice), 1_000e6); // observer
        vm.prank(stranger);
        vm.expectRevert(ConfidentialToken.NotAuthorizedToView.selector); // stranger
        cusdc.confidentialBalanceOf(alice);
    }

    function test_threeway_ledger_balance_and_receipt_and_statement() public {
        _fundLedger(alice, 1_000e6);
        vm.prank(alice);
        bytes32 rid = ledger.pay(serviceA, 100e6, keccak256("r"));
        vm.prank(alice);
        ledger.grantViewKey(auditor);

        // balance: owner, viewer, stranger
        vm.prank(alice);
        assertEq(ledger.balanceOf(alice), 900e6);
        vm.prank(auditor);
        assertEq(ledger.balanceOf(alice), 900e6);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.balanceOf(alice);

        // receipt: payer, service (both parties), stranger
        vm.prank(alice);
        ledger.receiptOf(rid);
        vm.prank(serviceA);
        ledger.receiptOf(rid);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.receiptOf(rid);

        // statement: owner, viewer, stranger
        vm.prank(alice);
        assertEq(ledger.exportStatement(alice, 0, 10).length, 1);
        vm.prank(auditor);
        assertEq(ledger.exportStatement(alice, 0, 10).length, 1);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialPaymentLedger.NotAuthorizedToView.selector);
        ledger.exportStatement(alice, 0, 10);
    }

    function test_threeway_router_shares() public {
        _shield(alice, 1_000e6);
        _approveOperator(alice, address(router));
        vm.prank(alice);
        router.deposit(1_000e6);
        uint256 b = router.currentBatch();
        vm.warp(block.timestamp + BATCH_WINDOW);
        router.executeBatch();
        vm.prank(alice);
        router.claimShares(b);

        vm.prank(alice);
        uint256 own = router.sharesOf(alice); // owner
        vm.prank(auditor);
        assertEq(router.sharesOf(alice), own); // auditor
        vm.prank(stranger);
        vm.expectRevert(ConfidentialVaultRouter.NotAuthorizedToView.selector); // stranger
        router.sharesOf(alice);
    }

    // === global event scan: no confidential value in any log ================

    function test_no_confidential_value_in_any_event() public {
        vm.recordLogs();

        // Full cross-module lifecycle using the distinctive confidential amounts.
        _shield(alice, 2_000e6);
        _approveOperator(alice, address(ledger));
        _approveOperator(alice, address(router));

        vm.startPrank(alice);
        cusdc.confidentialTransfer(bob, XFER_AMOUNT); // confidential transfer
        ledger.fund(1_000e6);
        ledger.pay(serviceA, PAY_AMOUNT, keccak256("ref")); // confidential pay
        router.deposit(DEP_AMOUNT); // confidential deposit
        vm.stopPrank();

        // A SECOND depositor joins the same batch so the public net != any individual amount — the
        // batch's net crossing is public by design, but no per-user deposit amount may be recoverable.
        _shield(carol, 400e6);
        _approveOperator(carol, address(router));
        vm.prank(carol);
        router.deposit(400e6);

        vm.warp(block.timestamp + BATCH_WINDOW);
        router.executeBatch();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        _assertAbsent(logs, PAY_AMOUNT, "pay amount leaked");
        _assertAbsent(logs, XFER_AMOUNT, "transfer amount leaked");
        _assertAbsent(logs, DEP_AMOUNT, "deposit amount leaked");
    }

    /// @dev Assert `forbidden` appears in no log topic and in no 32-byte-aligned data word.
    function _assertAbsent(Vm.Log[] memory logs, uint256 forbidden, string memory label) internal pure {
        bytes32 needle = bytes32(forbidden);
        for (uint256 i; i < logs.length; ++i) {
            for (uint256 t; t < logs[i].topics.length; ++t) {
                require(logs[i].topics[t] != needle, label);
            }
            bytes memory d = logs[i].data;
            for (uint256 o; o + 32 <= d.length; o += 32) {
                bytes32 word;
                assembly {
                    word := mload(add(add(d, 32), o))
                }
                require(word != needle, label);
            }
        }
    }
}
