// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ILendingVenue — generic public lending venue the router plugs into (D1: layer, not venue).
/// @notice A production adapter maps these to a Morpho vault (deposit/withdraw/convertToAssets) or an
///         Aave pool (supply/withdraw/aToken balance). The venue lives on the PUBLIC Arc EVM; the
///         router's position there is plain public USDC — that is exactly why GhostGate netting matters.
interface ILendingVenue {
    function asset() external view returns (address); // USDC
    function deposit(uint256 assets) external; // pulls `assets` USDC from caller
    function withdraw(uint256 assets) external; // pushes `assets` USDC to caller
    function balanceOf(address account) external view returns (uint256); // assets incl. accrued yield
}
