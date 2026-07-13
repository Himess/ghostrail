// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./utils/TestBase.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @notice Proves the generic core works across markets with different decimals and that markets are
///         fully independent — one market's state (or yield) never affects another's.
contract MultiMarketTest is TestBase {
    function _depositClaim(ConfidentialVaultRouter r, ConfidentialToken ct, address who, uint256 amount)
        internal
        returns (uint256 b)
    {
        _shieldInto(ct, who, amount);
        _approveOperatorOn(ct, who, address(r));
        vm.prank(who);
        r.deposit(amount);
        b = r.currentBatch();
        vm.warp(block.timestamp + BATCH_WINDOW);
        vm.prank(keeper);
        r.executeBatch();
        vm.prank(who);
        r.claimShares(b);
    }

    function test_markets_are_independent() public {
        _depositClaim(router, cusdc, alice, 1_000e6); // USDC market (6-dec)
        _depositClaim(router1, cweth, bob, 5 ether); // WETH market (18-dec)

        assertEq(router.totalAssets(), 1_000e6, "usdc market TVL");
        assertEq(router1.totalAssets(), 5 ether, "weth market TVL");

        // no cross-market shares
        vm.prank(alice);
        assertGt(router.sharesOf(alice), 0);
        vm.prank(alice);
        assertEq(router1.sharesOf(alice), 0, "alice has no WETH-market shares");
        vm.prank(bob);
        assertEq(router.sharesOf(bob), 0, "bob has no USDC-market shares");

        // yield in one market never moves the other's price
        uint256 wethPriceBefore = router1.previewRedeem(1 ether);
        venue.accrueYield(1000); // +10% on the USDC venue only
        assertEq(router1.previewRedeem(1 ether), wethPriceBefore, "WETH price unaffected by USDC yield");
        assertGt(router.previewRedeem(router.totalShares()), 1_000e6 - 5, "USDC market did accrue");
    }

    function test_18dec_market_conservation() public {
        _shieldInto(cweth, alice, 3 ether);
        assertEq(cweth.decimals(), 18, "mirrors underlying decimals");
        assertEq(cweth.totalShielded(), 3 ether, "supply");
        assertEq(weth.balanceOf(address(cweth)), 3 ether, "18-dec backing is 1:1");
    }

    function test_confidential_token_reports_underlying_decimals() public view {
        assertEq(cusdc.decimals(), 6, "USDC market is 6-dec");
        assertEq(cweth.decimals(), 18, "WETH market is 18-dec");
    }
}
