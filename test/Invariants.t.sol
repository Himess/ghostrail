// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockLendingVenue} from "../src/mocks/MockLendingVenue.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @dev Drives random, bounded user-op sequences across the ledger + router + cUSDC. Risky calls are
///      wrapped so a legitimate revert (e.g. window not closed) doesn't abort the whole sequence.
contract GhostRailHandler is Test {
    MockUSDC public usdc;
    ConfidentialToken public cusdc;
    ConfidentialPaymentLedger public ledger;
    ConfidentialVaultRouter public router;
    MockLendingVenue public venue;
    uint64 public batchWindow;

    address[] public actors;
    uint256 public ghost_deposits; // total value ever deposited to the router (for the profit bound)

    constructor(
        MockUSDC _usdc,
        ConfidentialToken _cusdc,
        ConfidentialPaymentLedger _ledger,
        ConfidentialVaultRouter _router,
        MockLendingVenue _venue,
        uint64 _batchWindow
    ) {
        usdc = _usdc;
        cusdc = _cusdc;
        ledger = _ledger;
        router = _router;
        venue = _venue;
        batchWindow = _batchWindow;

        for (uint256 i; i < 4; ++i) {
            address a = makeAddr(string(abi.encodePacked("actor", vm.toString(i))));
            actors.push(a);
            // Pre-fund each actor with a large shielded balance and pre-authorize both consumers.
            usdc.mint(a, 10_000_000e6);
            vm.startPrank(a);
            usdc.approve(address(cusdc), type(uint256).max);
            cusdc.shield(10_000_000e6);
            cusdc.setOperator(address(ledger), type(uint48).max);
            cusdc.setOperator(address(router), type(uint48).max);
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _cBalOf(address a) internal returns (uint256) {
        vm.prank(a);
        return cusdc.confidentialBalanceOf(a);
    }

    // ---- router ops ----

    function routerDeposit(uint256 seed, uint256 amount) public {
        address a = _actor(seed);
        amount = bound(amount, 0, _cBalOf(a));
        if (amount == 0) return;
        vm.prank(a);
        try router.deposit(amount) {
            ghost_deposits += amount;
        } catch {}
    }

    function routerWithdraw(uint256 seed, uint256 shares) public {
        address a = _actor(seed);
        vm.prank(a);
        uint256 have = router.sharesOf(a);
        shares = bound(shares, 0, have);
        if (shares == 0) return;
        vm.prank(a);
        try router.requestWithdraw(shares) {} catch {}
    }

    /// Pull shares owed for any executed deposit batches this actor still has pending.
    function routerClaimShares(uint256 seed) public {
        address a = _actor(seed);
        vm.prank(a);
        uint256[] memory bs = router.pendingBatchesOf(a);
        for (uint256 i; i < bs.length; ++i) {
            vm.prank(a);
            try router.claimShares(bs[i]) {} catch {}
        }
    }

    /// Pull cUSDC owed for any executed withdrawal batches this actor still has pending.
    function routerClaim(uint256 seed) public {
        address a = _actor(seed);
        vm.prank(a);
        uint256[] memory bs = router.pendingBatchesOf(a);
        for (uint256 i; i < bs.length; ++i) {
            vm.prank(a);
            try router.claim(bs[i]) {} catch {}
        }
    }

    function routerExecute(uint256 warpBy) public {
        vm.warp(block.timestamp + bound(warpBy, batchWindow, batchWindow * 2));
        try router.executeBatch() {} catch {}
    }

    function accrueYield(uint256 bps) public {
        venue.accrueYield(bound(bps, 0, 2000));
    }

    // ---- ledger ops ----

    function ledgerFund(uint256 seed, uint256 amount) public {
        address a = _actor(seed);
        amount = bound(amount, 0, _cBalOf(a));
        if (amount == 0) return;
        vm.prank(a);
        try ledger.fund(amount) {} catch {}
    }

    function ledgerPay(uint256 seed, uint256 toSeed, uint256 amount) public {
        address a = _actor(seed);
        address to = _actor(toSeed);
        vm.prank(a);
        uint256 bal = ledger.balanceOf(a);
        amount = bound(amount, 0, bal);
        if (amount == 0) return;
        vm.prank(a);
        try ledger.pay(to, amount, bytes32(seed)) {} catch {}
    }
}

contract InvariantsTest is StdInvariant, Test {
    MockUSDC usdc;
    ConfidentialToken cusdc;
    ConfidentialPaymentLedger ledger;
    ConfidentialVaultRouter router;
    MockLendingVenue venue;
    GhostRailHandler handler;

    uint64 constant BATCH_WINDOW = 3600;
    address auditor = makeAddr("auditor");

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        cusdc = new ConfidentialToken(IERC20(address(usdc)));
        ledger = new ConfidentialPaymentLedger(cusdc, BATCH_WINDOW);
        venue = new MockLendingVenue(IERC20(address(usdc)));
        router = new ConfidentialVaultRouter(cusdc, IERC20(address(usdc)), venue, auditor, BATCH_WINDOW);

        handler = new GhostRailHandler(usdc, cusdc, ledger, router, venue, BATCH_WINDOW);
        targetContract(address(handler));
    }

    /// @notice cUSDC is always fully backed 1:1 by real USDC — no confidential op mints or burns backing.
    function invariant_cusdcFullyBacked() public view {
        assertEq(cusdc.totalShielded(), usdc.balanceOf(address(cusdc)), "cUSDC not fully backed");
    }

    /// @notice The router can never owe its shareholders more than the venue actually backs (D6 solvency).
    function invariant_routerNeverInsolvent() public view {
        assertLe(router.previewRedeem(router.totalShares()), router.totalAssets(), "router insolvent");
    }

    /// @notice The ledger's internal accounting always equals the cUSDC it actually custodies.
    function invariant_ledgerConserved() public view {
        (uint256 internalSum, uint256 backing) = ledger.checkSolvency();
        assertEq(internalSum, backing, "ledger not conserved");
    }

    /// @notice No sequence of ops lets the pool owe more value than was ever deposited plus venue yield.
    ///         Backing (venue) only grows via deposits and yield, so it bounds all redeemable value.
    function invariant_noValueCreation() public view {
        assertLe(router.previewRedeem(router.totalShares()), venue.balanceOf(address(router)), "value created");
    }

    /// @notice Cost basis is DISPLAY-ONLY and fully released: a holder with zero shares has zero deposited
    ///         basis, so "earned" never strands a phantom cost. Read via the auditor (positionOf is gated).
    function invariant_basisReleasedWithShares() public {
        uint256 n = handler.actorCount();
        for (uint256 i; i < n; ++i) {
            address a = handler.actors(i);
            vm.prank(auditor);
            (uint256 shares, uint256 deposited,) = router.positionOf(a);
            if (shares == 0) assertEq(deposited, 0, "zero shares must imply zero cost basis");
        }
    }
}
