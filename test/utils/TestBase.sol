// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockLendingVenue} from "../../src/mocks/MockLendingVenue.sol";
import {ConfidentialToken} from "../../src/ConfidentialToken.sol";
import {ConfidentialPaymentLedger} from "../../src/ConfidentialPaymentLedger.sol";
import {ConfidentialVaultRouter} from "../../src/ConfidentialVaultRouter.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @dev Shared fixture — deploys a MULTI-MARKET GhostRail stack (USDC 6-dec + WETH 18-dec, each with its
///      own confidential token + venue + router) plus the payment ledger, with labeled actors + helpers.
///      The "primary" market (usdc/cUSDC/venue/router) is market 0; market 1 (weth/cWETH) proves the
///      generic core works across decimals and that markets are independent.
contract TestBase is Test {
    // --- market 0: USDC (6-dec) — the primary market most suites drive ---
    MockUSDC internal usdc;
    ConfidentialToken internal cusdc;
    MockLendingVenue internal venue;
    ConfidentialVaultRouter internal router;

    // --- market 1: WETH (18-dec) — proves generic-over-any-ERC20 + market independence ---
    MockERC20 internal weth;
    ConfidentialToken internal cweth;
    MockLendingVenue internal venue1;
    ConfidentialVaultRouter internal router1;

    // --- payments (secondary), over cUSDC ---
    ConfidentialPaymentLedger internal ledger;

    uint64 internal constant WITHDRAW_WINDOW = 3600; // ledger cash-out decorrelation window
    uint64 internal constant BATCH_WINDOW = 3600; // router netting window

    // Labeled actors
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal serviceA = makeAddr("serviceA");
    address internal serviceB = makeAddr("serviceB");
    address internal auditor = makeAddr("auditor");
    address internal keeper = makeAddr("keeper");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(1_000_000); // non-zero timestamp so window math is unambiguous

        // market 0 — USDC
        usdc = new MockUSDC();
        cusdc = new ConfidentialToken(IERC20(address(usdc)));
        venue = new MockLendingVenue(IERC20(address(usdc)));
        router = new ConfidentialVaultRouter(cusdc, IERC20(address(usdc)), venue, auditor, BATCH_WINDOW);

        // market 1 — WETH (18-dec)
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        cweth = new ConfidentialToken(IERC20(address(weth)));
        venue1 = new MockLendingVenue(IERC20(address(weth)));
        router1 = new ConfidentialVaultRouter(cweth, IERC20(address(weth)), venue1, auditor, BATCH_WINDOW);

        // payments over cUSDC
        ledger = new ConfidentialPaymentLedger(cusdc, WITHDRAW_WINDOW);
    }

    // ---- generic helpers (work for any confidential token / market) --------

    /// @dev Mint the underlying to `who` and shield it 1:1 into `ct`.
    function _shieldInto(ConfidentialToken ct, address who, uint256 amount) internal {
        address u = address(ct.underlying());
        IMintable(u).mint(who, amount);
        vm.startPrank(who);
        IERC20(u).approve(address(ct), amount);
        ct.shield(amount);
        vm.stopPrank();
    }

    /// @dev Grant `spender` operator rights on `who`'s `ct` for a long horizon.
    function _approveOperatorOn(ConfidentialToken ct, address who, address spender) internal {
        vm.prank(who);
        ct.setOperator(spender, uint48(block.timestamp + 365 days));
    }

    /// @dev Read a confidential balance as the owner (bypasses the notional view gate cleanly).
    function _cBalOf(ConfidentialToken ct, address who) internal returns (uint256) {
        vm.prank(who);
        return ct.confidentialBalanceOf(who);
    }

    // ---- market-0 (USDC) convenience wrappers used by the existing suites ---

    function _shield(address who, uint256 amount) internal {
        _shieldInto(cusdc, who, amount);
    }

    function _approveOperator(address who, address spender) internal {
        _approveOperatorOn(cusdc, who, spender);
    }

    function _cBal(address who) internal returns (uint256) {
        return _cBalOf(cusdc, who);
    }
}
