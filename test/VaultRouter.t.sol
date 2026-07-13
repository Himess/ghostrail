// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";
import {ILendingVenue} from "../src/interfaces/ILendingVenue.sol";
import {MaliciousVenue} from "../src/mocks/MaliciousVenue.sol";

contract VaultRouterTest is TestBase {
    // ---- pull-flow helpers ----

    function _deposit(address who, uint256 amount) internal {
        _shield(who, amount);
        _approveOperator(who, address(router));
        vm.prank(who);
        router.deposit(amount);
    }

    function _execute() internal returns (uint256 b) {
        b = router.currentBatch();
        vm.warp(block.timestamp + BATCH_WINDOW);
        vm.prank(keeper); // permissionless — a random keeper drives it
        router.executeBatch();
    }

    function _claimShares(address who, uint256 b) internal {
        vm.prank(who);
        router.claimShares(b);
    }

    function _depositClaim(address who, uint256 amount) internal returns (uint256 b) {
        _deposit(who, amount);
        b = _execute();
        _claimShares(who, b);
    }

    function _sharesOf(address who) internal returns (uint256) {
        vm.prank(who);
        return router.sharesOf(who);
    }

    // --- single depositor: shares are PULLED after execution ------------------

    function test_deposit_execute_then_pull_shares() public {
        _deposit(alice, 1_000e6);
        assertEq(_sharesOf(alice), 0, "no shares yet");

        uint256 b = _execute();
        assertEq(_sharesOf(alice), 0, "shares are pulled, not pushed");
        assertEq(router.totalAssets(), 1_000e6, "net deployed to venue");

        _claimShares(alice, b);
        assertGt(_sharesOf(alice), 0, "shares claimed");
        assertApproxEqAbs(router.previewRedeem(_sharesOf(alice)), 1_000e6, 2, "redeemable ~= deposit");
    }

    function test_claimShares_before_execute_reverts() public {
        _deposit(alice, 1_000e6);
        uint256 b = router.currentBatch();
        vm.prank(alice);
        vm.expectRevert(ConfidentialVaultRouter.BatchNotExecuted.selector);
        router.claimShares(b);
    }

    // --- yield raises the share price ----------------------------------------

    function test_yield_raises_share_price() public {
        _depositClaim(alice, 1_000e6);
        uint256 before = router.previewRedeem(_sharesOf(alice));
        venue.accrueYield(500); // +5%
        uint256 afterYield = router.previewRedeem(_sharesOf(alice));
        assertApproxEqAbs(afterYield, 1_050e6, 2, "5% yield reflected");
        assertGt(afterYield, before, "share price rose");
    }

    // --- withdraw: request → execute → PULL cUSDC -----------------------------

    function test_withdraw_redeems_correct_value() public {
        _depositClaim(alice, 1_000e6);
        venue.accrueYield(500); // +5% → ~1050e6 backing

        uint256 sh = _sharesOf(alice);
        vm.prank(alice);
        router.requestWithdraw(sh);
        uint256 b = _execute();

        vm.prank(alice);
        router.claim(b);
        assertApproxEqAbs(_cBal(alice), 1_050e6, 3, "redeemed principal + yield");
        assertEq(_sharesOf(alice), 0, "shares burned on claim");
    }

    // --- multi-user pro-rata with uneven amounts + rounding dust --------------

    function test_multi_user_pro_rata() public {
        _depositClaim(alice, 1_000e6); // batch 0
        venue.accrueYield(1000); // +10% → 1_100e6 backing
        _depositClaim(bob, 2_200e6); // batch 1 at the elevated price → ~2x alice

        uint256 aShares = _sharesOf(alice);
        uint256 bShares = _sharesOf(bob);
        assertApproxEqAbs(router.previewRedeem(aShares), 1_100e6, 3, "alice ~1100");
        assertApproxEqAbs(router.previewRedeem(bShares), 2_200e6, 3, "bob ~2200");

        (, uint256 backing) = router.checkSolvency();
        assertLe(router.previewRedeem(aShares) + router.previewRedeem(bShares), backing, "no over-issuance");
    }

    // --- inflation / donation attack cannot steal a later depositor's funds ---

    function test_donation_inflation_attack_is_neutralized() public {
        _depositClaim(alice, 1); // attacker seeds 1 unit

        usdc.mint(alice, 100_000e6);
        vm.prank(alice);
        usdc.transfer(address(router), 100_000e6); // donation is unaccounted (totalAssets reads the venue)

        _depositClaim(bob, 1_000e6); // victim
        assertApproxEqAbs(router.previewRedeem(_sharesOf(bob)), 1_000e6, 5, "victim keeps ~full value");
        assertLe(router.previewRedeem(_sharesOf(alice)), 10, "attacker cannot extract victim funds");
    }

    // --- cancel while the batch is still open ---------------------------------

    function test_cancel_deposit_refunds() public {
        _deposit(alice, 1_000e6);
        assertEq(_cBal(alice), 0, "cUSDC moved into the router");
        vm.prank(alice);
        router.cancelDeposit();
        assertEq(_cBal(alice), 1_000e6, "full refund");
    }

    function test_cancel_withdraw_releases_shares() public {
        _depositClaim(alice, 1_000e6);
        uint256 sh = _sharesOf(alice);
        vm.prank(alice);
        router.requestWithdraw(sh);

        // reserved → cannot request more
        vm.prank(alice);
        vm.expectRevert(ConfidentialVaultRouter.InsufficientShares.selector);
        router.requestWithdraw(1);

        vm.prank(alice);
        router.cancelWithdraw();

        // released → can request again
        vm.prank(alice);
        router.requestWithdraw(sh);
    }

    // --- share views gated (holder + auditor only) ---------------------------

    function test_shares_view_gated() public {
        _depositClaim(alice, 1_000e6);
        vm.prank(alice);
        uint256 own = router.sharesOf(alice);
        vm.prank(auditor);
        assertEq(router.sharesOf(alice), own, "auditor may read");
        vm.prank(stranger);
        vm.expectRevert(ConfidentialVaultRouter.NotAuthorizedToView.selector);
        router.sharesOf(alice);
    }

    // --- no per-user amount in any event -------------------------------------

    function test_events_carry_no_per_user_amount() public {
        vm.recordLogs();
        _deposit(alice, 1_000e6);
        uint256 b = _execute();
        _claimShares(alice, b);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 batchSig = keccak256("BatchExecuted(uint256,int8,uint256,uint256)");
        bytes32 depositSig = keccak256("DepositQueued(address,uint256)");
        bool sawDeposit;
        for (uint256 i; i < logs.length; ++i) {
            bytes32 t = logs[i].topics[0];
            if (t == depositSig) {
                sawDeposit = true;
                assertEq(logs[i].data.length, 0, "DepositQueued leaked an amount");
            } else if (t != batchSig && logs[i].emitter == address(router)) {
                assertEq(logs[i].data.length, 0, "a router event leaked a per-user amount");
            }
        }
        assertTrue(sawDeposit, "DepositQueued emitted");
    }

    // --- reentrancy blocked via MaliciousVenue -------------------------------

    function test_reentrancy_on_executeBatch_reverts() public {
        MaliciousVenue mal = new MaliciousVenue(address(usdc));
        ConfidentialVaultRouter r2 = new ConfidentialVaultRouter(
            cusdc, IERC20(address(usdc)), ILendingVenue(address(mal)), auditor, BATCH_WINDOW
        );
        mal.setTarget(address(r2));

        _shield(alice, 1_000e6);
        _approveOperator(alice, address(r2));
        vm.prank(alice);
        r2.deposit(1_000e6);

        vm.warp(block.timestamp + BATCH_WINDOW);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        r2.executeBatch();
    }

    // --- no privileged path: only a holder can extract their own funds --------

    function test_no_privileged_extraction() public {
        _depositClaim(alice, 1_000e6);

        vm.prank(auditor);
        vm.expectRevert(ConfidentialVaultRouter.InsufficientShares.selector);
        router.requestWithdraw(1);
        vm.prank(stranger);
        vm.expectRevert(ConfidentialVaultRouter.InsufficientShares.selector);
        router.requestWithdraw(1);
    }

    function test_executeBatch_before_window_reverts() public {
        _deposit(alice, 1_000e6);
        vm.prank(keeper);
        vm.expectRevert(ConfidentialVaultRouter.WindowNotClosed.selector);
        router.executeBatch();
    }

    // --- H-1 regression: executeBatch runs in BOUNDED gas regardless of participant count ----
    // The pull-based router keeps running aggregates and NEVER loops over depositors in executeBatch,
    // so a griefer cannot brick a batch by padding it with many tiny deposits (the executeBatch DoS).

    function test_H1_executeBatch_bounded_gas() public {
        uint256 n = 60;
        for (uint256 i; i < n; ++i) {
            address u = address(uint160(uint256(keccak256(abi.encode("depositor", i)))));
            _shield(u, 100e6);
            _approveOperator(u, address(router));
            vm.prank(u);
            router.deposit(100e6);
        }
        vm.warp(block.timestamp + BATCH_WINDOW);
        vm.prank(keeper);
        uint256 g0 = gasleft();
        router.executeBatch();
        uint256 used = g0 - gasleft();
        // A naive O(n) push loop would cost ~n × per-user work (millions of gas at n=60). O(1) stays flat.
        assertLt(used, 400_000, "executeBatch gas must be bounded (no per-participant loop)");
    }

    // --- share price is monotone non-decreasing under yield-only sequences ----

    function testFuzz_share_price_monotone_under_yield(uint96 dep, uint16 y1, uint16 y2) public {
        dep = uint96(bound(dep, 1e6, 1_000_000e6));
        _depositClaim(alice, dep);
        uint256 sh = _sharesOf(alice);
        uint256 p0 = router.previewRedeem(sh);
        venue.accrueYield(bound(y1, 0, 5000));
        uint256 p1 = router.previewRedeem(sh);
        venue.accrueYield(bound(y2, 0, 5000));
        uint256 p2 = router.previewRedeem(sh);
        assertGe(p1, p0, "yield never lowers redeem value");
        assertGe(p2, p1, "still monotone");
    }
}
