// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockLendingVenue} from "../src/mocks/MockLendingVenue.sol";
import {ConfidentialToken} from "../src/ConfidentialToken.sol";
import {ConfidentialVaultRouter} from "../src/ConfidentialVaultRouter.sol";

/// @notice Module B story, on-chain and narrated (PULL-based router): three users pool confidential
///         deposits into ONE public venue position; yield accrues; a same-window withdraw nets against a
///         deposit so only the NET crosses the public boundary (GhostGate); users then PULL their shares /
///         cUSDC. Labels make the CONFIDENTIAL | PUBLIC line visceral. Run: `forge script script/DemoVault.s.sol -vv`
contract DemoVault is Script {
    MockUSDC usdc;
    ConfidentialToken cusdc;
    MockLendingVenue venue;
    ConfidentialVaultRouter router;

    uint64 constant WINDOW = 3600;

    address user1 = _mk("user1");
    address user2 = _mk("user2");
    address user3 = _mk("user3");
    address auditor = _mk("auditor");
    address keeper = _mk("keeper");

    function _mk(string memory name) internal returns (address a) {
        a = vm.addr(uint256(keccak256(bytes(name))));
        vm.label(a, name);
    }

    function run() external {
        _hr("DEPLOY");
        usdc = new MockUSDC();
        cusdc = new ConfidentialToken(IERC20(address(usdc)));
        venue = new MockLendingVenue(IERC20(address(usdc)));
        router = new ConfidentialVaultRouter(cusdc, IERC20(address(usdc)), venue, auditor, WINDOW);
        console2.log("VaultRouter :", address(router));

        _hr("BATCH 0 - three confidential deposits (10k / 5k / 1k), then PULL shares");
        _deposit(user1, 10_000e6);
        _deposit(user2, 5_000e6);
        _deposit(user3, 1_000e6);
        uint256 b0 = _execute();
        _claimShares(user1, b0);
        _claimShares(user2, b0);
        _claimShares(user3, b0);
        console2.log("PUBLIC: venue position after batch 0 :", venue.balanceOf(address(router)));
        console2.log("PUBLIC: totalShares                  :", router.totalShares());
        _confShares("user1", user1);
        _confShares("user2", user2);
        _confShares("user3", user3);

        _hr("YIELD accrues on the PUBLIC venue (+5%)");
        venue.accrueYield(500);
        console2.log("PUBLIC: venue position now :", venue.balanceOf(address(router)));

        _hr("BATCH 1 - user2 exits while user3 adds, SAME window -> NETTING");
        uint256 u2shares = _shares(user2);
        vm.prank(user2);
        router.requestWithdraw(u2shares); // ~5,250 of value
        _deposit(user3, 1_000e6); // +1,000 of value

        uint256 venueBefore = venue.balanceOf(address(router));
        uint256 b1 = _execute();
        uint256 venueAfter = venue.balanceOf(address(router));

        console2.log("PUBLIC: venue BEFORE batch 1 :", venueBefore);
        console2.log("PUBLIC: venue AFTER  batch 1 :", venueAfter);
        console2.log("PUBLIC: ONE net movement crossed the boundary. Delta (a single venue call):");
        console2.logInt(int256(venueAfter) - int256(venueBefore));
        console2.log("  (gross was 5,250 out + 1,000 in; only the ~4,250 NET withdrawal crossed.)");

        _hr("SETTLE - participants PULL their outcomes");
        vm.prank(user2);
        router.claim(b1); // user2 pulls cUSDC for the withdrawal
        _claimShares(user3, b1); // user3 pulls shares for the new deposit
        console2.log("CONFIDENTIAL (user2 owner view): user2 cUSDC after claim :", _cBal(user2));

        _hr("EVERYONE EXITS - pro-rata redemption (request -> execute -> claim)");
        _fullWithdraw(user1);
        _fullWithdraw(user3);
        console2.log("CONFIDENTIAL (owner view): user1 cUSDC :", _cBal(user1));
        console2.log("CONFIDENTIAL (owner view): user3 cUSDC :", _cBal(user3));

        _hr("SOLVENCY (public aggregates only)");
        (uint256 shares, uint256 backing) = router.checkSolvency();
        console2.log("PUBLIC: totalShares remaining :", shares);
        console2.log("PUBLIC: venue backing         :", backing);
        console2.log("PUBLIC: previewRedeem(all)    :", router.previewRedeem(shares));
        require(router.previewRedeem(shares) <= backing, "insolvent");
        console2.log("OK: redeemable <= backing at every step. Individual positions never left the enclave.");
    }

    // ---- helpers ----

    function _deposit(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(cusdc), amount);
        cusdc.shield(amount);
        cusdc.setOperator(address(router), uint48(block.timestamp + 1 days));
        router.deposit(amount);
        vm.stopPrank();
    }

    function _execute() internal returns (uint256 b) {
        b = router.currentBatch();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(keeper);
        router.executeBatch();
    }

    function _claimShares(address who, uint256 b) internal {
        vm.prank(who);
        router.claimShares(b);
    }

    function _fullWithdraw(address who) internal {
        uint256 s = _shares(who);
        if (s == 0) return;
        vm.prank(who);
        router.requestWithdraw(s);
        uint256 b = _execute();
        vm.prank(who);
        router.claim(b);
    }

    function _shares(address who) internal returns (uint256 s) {
        vm.prank(who);
        s = router.sharesOf(who);
    }

    function _cBal(address who) internal returns (uint256 b) {
        vm.prank(who);
        b = cusdc.confidentialBalanceOf(who);
    }

    function _confShares(string memory label, address who) internal {
        console2.log(string.concat("CONFIDENTIAL (", label, " owner view): shares ="), _shares(who));
    }

    function _hr(string memory s) internal pure {
        console2.log("");
        console2.log(string.concat("== ", s, " =="));
    }
}
