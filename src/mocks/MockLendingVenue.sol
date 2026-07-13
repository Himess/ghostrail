// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ILendingVenue} from "../interfaces/ILendingVenue.sol";

interface IMintableUSDC {
    function mint(address to, uint256 amount) external;
}

/// @title MockLendingVenue — deliberately minimal generic venue with a yield-accrual test hook.
/// @notice Balances are tracked in index-normalized "scaled" units; `accrueYield(bps)` inflates every
///         balance and self-mints the matching USDC so withdrawals of principal+yield stay backed.
///         A production adapter replaces this with real Morpho/Aave calls (see ILendingVenue).
contract MockLendingVenue is ILendingVenue {
    using SafeERC20 for IERC20;
    using Math for uint256;

    IERC20 public immutable usdc;
    uint256 public index = 1e18; // grows with yield; balance = scaled * index / 1e18
    uint256 public totalScaled;
    mapping(address => uint256) public scaledBalance;

    constructor(IERC20 _usdc) {
        usdc = _usdc;
    }

    function asset() external view returns (address) {
        return address(usdc);
    }

    function deposit(uint256 assets) public virtual {
        usdc.safeTransferFrom(msg.sender, address(this), assets);
        uint256 scaled = Math.mulDiv(assets, 1e18, index); // floor: venue slightly over-backed
        scaledBalance[msg.sender] += scaled;
        totalScaled += scaled;
    }

    function withdraw(uint256 assets) public virtual {
        // ceil: remove at least the proportional scaled so usdc.balanceOf(this) >= sum(balances) holds
        uint256 scaled = Math.mulDiv(assets, 1e18, index, Math.Rounding.Ceil);
        scaledBalance[msg.sender] -= scaled;
        totalScaled -= scaled;
        usdc.safeTransfer(msg.sender, assets);
    }

    function balanceOf(address account) external view returns (uint256) {
        return Math.mulDiv(scaledBalance[account], index, 1e18);
    }

    /// @notice TEST HOOK: raise every balance by `bps` and self-mint the matching USDC backing.
    ///         Only meaningful with a mintable underlying (MockUSDC); never called in the Arc deploy.
    function accrueYield(uint256 bps) external {
        uint256 managed = Math.mulDiv(totalScaled, index, 1e18);
        uint256 extra = managed * bps / 10_000;
        index += index * bps / 10_000;
        if (extra > 0) IMintableUSDC(address(usdc)).mint(address(this), extra);
    }
}
