// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// APS-SWAP: On Arc APS this is the native confidential asset with shield/unshield precompiles (generic
// over ANY Arc ERC20 — not USDC-only). Confidential balances live in pEVM-encrypted state and reads are
// enforced by the enclave + view keys. Here (local sim / public Arc testnet) we reproduce the SAME
// visibility semantics with plain Solidity access control. See IMPLEMENTATION.md "Privacy model".

/// @title IConfidentialToken — ERC-7984-flavored confidential wrapper over ANY ERC20 (interface shape only,
///        NOT the FHE implementation: no euint types, no input proofs, no coprocessors).
interface IConfidentialToken {
    // --- boundary (amounts are PUBLIC here by APS design) ---
    function shield(uint256 amount) external; // pulls underlying, mints confidential balance 1:1
    function unshield(uint256 amount) external; // burns confidential balance, returns underlying 1:1

    // --- confidential zone (amounts HIDDEN) ---
    function confidentialTransfer(address to, uint256 amount) external returns (bool);
    function confidentialTransferFrom(address from, address to, uint256 amount) external returns (bool);
    function setOperator(address operator, uint48 until) external; // 7984-style operator
    function isOperator(address holder, address operator) external view returns (bool);

    // --- gated views (owner or the account's observer only) ---
    function confidentialBalanceOf(address account) external view returns (uint256);

    // --- per-account observer (7984 ObserverAccess pattern == our view key) ---
    function setObserver(address observer) external; // holder grants/revokes (address(0) clears)
    function observerOf(address account) external view returns (address);

    // --- metadata / public solvency invariant ---
    function decimals() external view returns (uint8); // mirrors the underlying's decimals
    function totalShielded() external view returns (uint256); // == total confidential supply

    // --- events (boundary amounts public; confidential transfers carry NO amount) ---
    event Shielded(address indexed account, uint256 amount);
    event Unshielded(address indexed account, uint256 amount);
    event ConfidentialTransfer(address indexed from, address indexed to); // NO amount
    event OperatorSet(address indexed holder, address indexed operator, uint48 until);
    event ObserverSet(address indexed account, address indexed observer);
}
