// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "forge-std/Vm.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";

contract ConfidentialTokenTest is TestBase {
    // --- shield / unshield conservation --------------------------------------

    function test_shield_mints_and_backs_1to1() public {
        _shield(alice, 1_000e6);
        assertEq(_cBal(alice), 1_000e6, "confidential balance");
        assertEq(cusdc.totalShielded(), 1_000e6, "total shielded");
        assertEq(usdc.balanceOf(address(cusdc)), 1_000e6, "backing usdc");
    }

    function test_conservation_after_arbitrary_ops() public {
        _shield(alice, 1_000e6);
        _shield(bob, 500e6);

        _approveOperator(alice, address(this)); // this test contract acts as operator
        vm.prank(alice);
        cusdc.confidentialTransfer(bob, 200e6);

        vm.prank(bob);
        cusdc.unshield(100e6);

        // Invariant: usdc backing == totalShielded == sum of confidential balances, always.
        assertEq(cusdc.totalShielded(), 1_400e6, "supply after ops");
        assertEq(usdc.balanceOf(address(cusdc)), 1_400e6, "backing after ops");
        assertEq(_cBal(alice) + _cBal(bob), 1_400e6, "sum of balances");
        assertEq(_cBal(alice), 800e6);
        assertEq(_cBal(bob), 600e6);
    }

    function test_unshield_returns_usdc() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.unshield(400e6);
        assertEq(usdc.balanceOf(alice), 400e6, "usdc back to alice");
        assertEq(_cBal(alice), 600e6);
    }

    function test_unshield_over_balance_reverts() public {
        _shield(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(ConfidentialToken.InsufficientConfidentialBalance.selector);
        cusdc.unshield(101e6);
    }

    function test_shield_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialToken.ZeroAmount.selector);
        cusdc.shield(0);
    }

    // --- gated balance views -------------------------------------------------

    function test_owner_reads_own_balance() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        assertEq(cusdc.confidentialBalanceOf(alice), 1_000e6);
    }

    function test_stranger_cannot_read_balance() public {
        _shield(alice, 1_000e6);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialToken.NotAuthorizedToView.selector);
        cusdc.confidentialBalanceOf(alice);
    }

    function test_observer_can_read_balance() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.setObserver(auditor);

        vm.prank(auditor);
        assertEq(cusdc.confidentialBalanceOf(alice), 1_000e6, "observer reads");

        // Revoke → observer blocked again.
        vm.prank(alice);
        cusdc.setObserver(address(0));
        vm.prank(auditor);
        vm.expectRevert(ConfidentialToken.NotAuthorizedToView.selector);
        cusdc.confidentialBalanceOf(alice);
    }

    // --- operator model ------------------------------------------------------

    function test_operator_can_pull_until_expiry() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.setOperator(address(this), uint48(block.timestamp + 100));

        assertTrue(cusdc.isOperator(alice, address(this)));
        cusdc.confidentialTransferFrom(alice, bob, 300e6); // this == operator
        assertEq(_cBal(bob), 300e6);
    }

    function test_operator_expiry_honored() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.setOperator(address(this), uint48(block.timestamp + 100));

        vm.warp(block.timestamp + 101); // operator expired
        assertFalse(cusdc.isOperator(alice, address(this)));
        vm.expectRevert(ConfidentialToken.NotOperator.selector);
        cusdc.confidentialTransferFrom(alice, bob, 300e6);
    }

    function test_transferFrom_without_operator_reverts() public {
        _shield(alice, 1_000e6);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialToken.NotOperator.selector);
        cusdc.confidentialTransferFrom(alice, bob, 1);
    }

    function test_self_transferFrom_needs_no_operator() public {
        _shield(alice, 1_000e6);
        vm.prank(alice);
        cusdc.confidentialTransferFrom(alice, bob, 250e6); // from == msg.sender
        assertEq(_cBal(bob), 250e6);
    }

    // --- event hygiene: NO event carries an amount except Shielded/Unshielded --

    function test_confidentialTransfer_event_has_no_amount() public {
        _shield(alice, 1_000e6);
        vm.recordLogs();
        vm.prank(alice);
        cusdc.confidentialTransfer(bob, 123e6);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ConfidentialTransfer(address,address)");
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == sig) {
                found = true;
                // both args indexed → data must be empty (no amount leaked)
                assertEq(logs[i].data.length, 0, "ConfidentialTransfer leaked data");
            }
        }
        assertTrue(found, "event emitted");
    }

    // --- fuzzed conservation: backing == supply == sum of touched balances ----

    function testFuzz_conservation(uint96 a, uint96 b, uint96 xfer, uint96 burn) public {
        a = uint96(bound(a, 1e6, 1_000_000e6));
        b = uint96(bound(b, 1e6, 1_000_000e6));
        xfer = uint96(bound(xfer, 0, a));
        _shield(alice, a);
        _shield(bob, b);

        if (xfer > 0) {
            vm.prank(alice);
            cusdc.confidentialTransfer(bob, xfer);
        }
        uint256 aliceBal = a - xfer;
        burn = uint96(bound(burn, 0, aliceBal));
        if (burn > 0) {
            vm.prank(alice);
            cusdc.unshield(burn);
        }

        uint256 supply = uint256(a) + b - burn;
        assertEq(cusdc.totalShielded(), supply, "supply");
        assertEq(usdc.balanceOf(address(cusdc)), supply, "backing == supply");
        assertEq(_cBal(alice) + _cBal(bob), supply, "sum of balances == supply");
    }

    function test_only_boundary_events_carry_amounts() public {
        // Shielded/Unshielded are the ONLY events allowed to carry an amount (public by APS design).
        _shield(alice, 1_000e6);

        vm.recordLogs();
        vm.startPrank(alice);
        cusdc.confidentialTransfer(bob, 50e6);
        cusdc.setOperator(carol, uint48(block.timestamp + 1));
        cusdc.setObserver(auditor);
        cusdc.unshield(10e6);
        vm.stopPrank();

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 shielded = keccak256("Shielded(address,uint256)");
        bytes32 unshielded = keccak256("Unshielded(address,uint256)");
        bytes32 operatorSet = keccak256("OperatorSet(address,address,uint48)"); // `until` is a PUBLIC expiry
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(cusdc)) continue; // ignore the underlying ERC20's Transfer/Approval
            bytes32 t = logs[i].topics[0];
            if (t == shielded || t == unshielded || t == operatorSet) continue; // public data allowed here
            // every other cUSDC event must carry no non-indexed data payload (no hidden amount can hide there)
            assertEq(logs[i].data.length, 0, "non-boundary event leaked data");
        }
    }
}
