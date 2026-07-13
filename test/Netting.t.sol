// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockLendingVenue} from "../src/mocks/MockLendingVenue.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";
import {ILendingVenue} from "../src/interfaces/ILendingVenue.sol";

/// @dev Venue that counts how many times the router crosses the public boundary, and the amounts.
contract CountingVenue is MockLendingVenue {
    uint256 public depositCalls;
    uint256 public withdrawCalls;
    uint256 public lastDeposit;
    uint256 public lastWithdraw;

    constructor(IERC20 u) MockLendingVenue(u) {}

    function deposit(uint256 assets) public override {
        depositCalls++;
        lastDeposit = assets;
        super.deposit(assets);
    }

    function withdraw(uint256 assets) public override {
        withdrawCalls++;
        lastWithdraw = assets;
        super.withdraw(assets);
    }
}

contract NettingTest is TestBase {
    CountingVenue internal cVenue;
    ConfidentialVaultRouter internal r;

    function setUp() public override {
        super.setUp();
        cVenue = new CountingVenue(IERC20(address(usdc)));
        r = new ConfidentialVaultRouter(cusdc, IERC20(address(usdc)), cVenue, auditor, BATCH_WINDOW);
    }

    function _deposit(address who, uint256 amount) internal {
        _shield(who, amount);
        _approveOperator(who, address(r));
        vm.prank(who);
        r.deposit(amount);
    }

    function _execute() internal returns (uint256 b) {
        b = r.currentBatch();
        vm.warp(block.timestamp + BATCH_WINDOW);
        vm.prank(keeper);
        r.executeBatch();
    }

    function _shares(address who) internal returns (uint256 s) {
        vm.prank(who);
        s = r.sharesOf(who);
    }

    // Establish alice as a shareholder worth exactly 1_000e6 (deposit → execute → pull shares).
    function _seedAlice() internal {
        _deposit(alice, 1_000e6);
        uint256 b = _execute();
        vm.prank(alice);
        r.claimShares(b);
    }

    // --- net-positive: deposit 1000 + withdraw 400 → ONE venue movement of net 600 ---

    function test_net_positive_single_movement() public {
        _seedAlice();
        uint256 d0 = cVenue.depositCalls();

        _deposit(bob, 1_000e6);
        uint256 withdrawShares = _shares(alice) * 400 / 1000; // ~400e6 of value
        vm.prank(alice);
        r.requestWithdraw(withdrawShares);

        _execute();

        assertEq(cVenue.depositCalls() - d0, 1, "exactly ONE deposit movement");
        assertEq(cVenue.withdrawCalls(), 0, "no withdraw movement");
        assertApproxEqAbs(cVenue.lastDeposit(), 600e6, 2, "net crossed ~= 600");
    }

    // --- net-zero: equal deposit and withdraw value → ZERO public movement ---

    function test_net_zero_no_movement() public {
        _seedAlice();
        uint256 d0 = cVenue.depositCalls();
        uint256 w0 = cVenue.withdrawCalls();

        uint256 aliceShares = _shares(alice);
        vm.prank(alice);
        r.requestWithdraw(aliceShares); // full backing (1_000e6)
        _deposit(bob, 1_000e6);

        vm.recordLogs();
        _execute();

        assertEq(cVenue.depositCalls() - d0, 0, "no deposit movement");
        assertEq(cVenue.withdrawCalls() - w0, 0, "no withdraw movement");
        (int8 dir, uint256 amt) = _lastBatch();
        assertEq(dir, int8(0), "net direction zero");
        assertEq(amt, 0, "net amount zero");
    }

    // --- net-negative: withdraw value > deposit value → ONE venue withdraw + reshield ---

    function test_net_negative_single_withdraw() public {
        _seedAlice();
        uint256 w0 = cVenue.withdrawCalls();
        uint256 d0 = cVenue.depositCalls();

        uint256 aliceShares = _shares(alice);
        vm.prank(alice);
        r.requestWithdraw(aliceShares * 600 / 1000);
        _deposit(bob, 100e6);

        uint256 b = _execute();

        assertEq(cVenue.withdrawCalls() - w0, 1, "exactly ONE withdraw movement");
        assertEq(cVenue.depositCalls() - d0, 0, "no deposit movement");
        assertApproxEqAbs(cVenue.lastWithdraw(), 500e6, 2, "net pulled ~= 500");

        vm.prank(alice);
        r.claim(b);
        assertApproxEqAbs(_cBal(alice), 600e6, 3, "alice pulled her ~600");
    }

    // --- requests land in the batch that is OPEN when they are submitted ---

    function test_requests_partitioned_by_batch() public {
        _deposit(alice, 1_000e6);
        assertEq(r.currentBatch(), 0, "alice in batch 0");
        uint256 b0 = _execute();
        assertEq(r.currentBatch(), 1, "advanced");
        vm.prank(alice);
        r.claimShares(b0);

        _deposit(bob, 500e6);
        vm.prank(keeper);
        vm.expectRevert(ConfidentialVaultRouter.WindowNotClosed.selector);
        r.executeBatch();

        uint256 b1 = _execute();
        vm.prank(bob);
        r.claimShares(b1);
        assertApproxEqAbs(r.previewRedeem(_shares(alice)), 1_000e6, 2, "alice batch-0 value");
        assertApproxEqAbs(r.previewRedeem(_shares(bob)), 500e6, 2, "bob batch-1 value");
    }

    // --- BatchExecuted carries only net + aggregates (no per-user data) ---

    function test_batch_event_is_net_only() public {
        vm.recordLogs();
        _deposit(alice, 1_000e6);
        _execute();
        (int8 dir, uint256 amt) = _lastBatch();
        assertEq(dir, int8(1), "single deposit -> net positive");
        assertApproxEqAbs(amt, 1_000e6, 2, "net == the one deposit");
    }

    function _lastBatch() internal returns (int8 dir, uint256 amt) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("BatchExecuted(uint256,int8,uint256,uint256)");
        for (uint256 i = logs.length; i > 0; --i) {
            Vm.Log memory L = logs[i - 1];
            if (L.topics[0] == sig) {
                (dir, amt,) = abi.decode(L.data, (int8, uint256, uint256));
                return (dir, amt);
            }
        }
        revert("no BatchExecuted");
    }
}
