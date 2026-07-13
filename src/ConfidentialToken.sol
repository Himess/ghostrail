// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IConfidentialToken} from "./interfaces/IConfidentialToken.sol";

// APS-SWAP (contract-wide): On Arc APS this whole contract is the NATIVE confidential asset (generic over
// ANY Arc ERC20). Balances live in pEVM-encrypted state; shield/unshield are enclave precompiles;
// confidential transfers move encrypted values and even calldata is sealed; reads are enforced by the
// enclave + per-account view keys (an off-chain `eth_call` cannot forge `msg.sender`, so gating is REAL
// there). Here — local sim and public Arc testnet, where APS is not yet live — we reproduce the SAME
// visibility semantics with plain Solidity access control. This is NOTIONAL privacy off-APS
// (`_confidentialBalance` is physically readable via `eth_getStorageAt`, and `eth_call.from` is spoofable).
// See IMPLEMENTATION.md "Privacy model". Never claim the privacy is live before APS.

/// @title ConfidentialToken — ERC-7984-flavored confidential wrapper over ANY ERC20.
/// @notice Shield plain tokens 1:1 into a confidential balance; move them privately inside the confidential
///         zone; unshield back at the public boundary. Immutable, NO owner, NO admin, NO privileged fund
///         path (D5). Aggregate supply is public for a solvency invariant (D6); every individual balance
///         and every transfer amount is private (never emitted, gated on read). Deploy one instance per
///         market underlying (cUSDC, cWETH, cWBTC, cEURC, …).
/// @dev    Interface shape only — deliberately NOT the FHE implementation. No `euint*`, no proofs, no
///         coprocessor. Values are plain `uint256`; confidentiality is APS's job in production.
contract ConfidentialToken is IConfidentialToken, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The underlying plain ERC20 this wraps. Immutable.
    IERC20 public immutable underlying;
    /// @notice Mirrors the underlying's decimals (read once at construction). Immutable.
    uint8 private immutable _decimals;

    // --- confidential state (APS-SWAP: pEVM-encrypted on Arc; never emitted; gated on read) ---
    mapping(address => uint256) private _confidentialBalance;
    // --- operator grants: holder => operator => expiry timestamp (0 or past == not an operator) ---
    mapping(address => mapping(address => uint48)) private _operatorUntil;
    // --- per-account observer (7984 ObserverAccess == our view key): account => authorized viewer ---
    mapping(address => address) private _observer;
    // --- public solvency aggregate (D6): == total confidential supply == underlying.balanceOf(this) ---
    uint256 private _totalShielded;

    error ZeroAmount();
    error InsufficientConfidentialBalance();
    error NotOperator();
    error NotAuthorizedToView();

    constructor(IERC20 _underlying) {
        underlying = _underlying;
        _decimals = IERC20Metadata(address(_underlying)).decimals();
    }

    /// @inheritdoc IConfidentialToken
    function decimals() external view returns (uint8) {
        return _decimals;
    }

    // ============================================================================================
    // Boundary — amounts are PUBLIC here by APS design (shield/unshield reveal the crossing amount).
    // ============================================================================================

    /// @inheritdoc IConfidentialToken
    // APS-SWAP: native shield precompile pulls the underlying into the enclave and credits an encrypted balance.
    function shield(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _confidentialBalance[msg.sender] += amount; // effects before the external pull (CEI)
        _totalShielded += amount;
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        emit Shielded(msg.sender, amount);
    }

    /// @inheritdoc IConfidentialToken
    // APS-SWAP: native unshield precompile burns the encrypted balance and releases the plain underlying.
    function unshield(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = _confidentialBalance[msg.sender];
        if (bal < amount) revert InsufficientConfidentialBalance();
        unchecked {
            _confidentialBalance[msg.sender] = bal - amount;
        }
        _totalShielded -= amount;
        underlying.safeTransfer(msg.sender, amount);
        emit Unshielded(msg.sender, amount);
    }

    // ============================================================================================
    // Confidential zone — amounts are HIDDEN (never in events; internal transfers only).
    // ============================================================================================

    /// @inheritdoc IConfidentialToken
    function confidentialTransfer(address to, uint256 amount) external returns (bool) {
        _confidentialTransfer(msg.sender, to, amount);
        return true;
    }

    /// @inheritdoc IConfidentialToken
    /// @dev Caller must be `from` itself or an unexpired operator of `from` — the pull path the
    ///      PaymentLedger / VaultRouter use to move a user's confidential tokens after `setOperator`.
    function confidentialTransferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (msg.sender != from && !isOperator(from, msg.sender)) revert NotOperator();
        _confidentialTransfer(from, to, amount);
        return true;
    }

    function _confidentialTransfer(address from, address to, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = _confidentialBalance[from];
        if (bal < amount) revert InsufficientConfidentialBalance();
        unchecked {
            _confidentialBalance[from] = bal - amount;
            _confidentialBalance[to] += amount; // total supply conserved, so no overflow given the sub
        }
        // APS-SWAP: emitted WITHOUT amount — an observer sees that a transfer happened, never how much.
        emit ConfidentialTransfer(from, to);
    }

    /// @inheritdoc IConfidentialToken
    /// @dev `until` is an absolute expiry timestamp. Pass 0 to revoke.
    function setOperator(address operator, uint48 until) external {
        _operatorUntil[msg.sender][operator] = until;
        emit OperatorSet(msg.sender, operator, until);
    }

    /// @inheritdoc IConfidentialToken
    function isOperator(address holder, address operator) public view returns (bool) {
        return _operatorUntil[holder][operator] >= block.timestamp && _operatorUntil[holder][operator] != 0;
    }

    // ============================================================================================
    // Per-account observer / view key (holder grants a single viewer; address(0) clears).
    // ============================================================================================

    /// @inheritdoc IConfidentialToken
    function setObserver(address observer) external {
        _observer[msg.sender] = observer;
        emit ObserverSet(msg.sender, observer);
    }

    /// @inheritdoc IConfidentialToken
    function observerOf(address account) external view returns (address) {
        return _observer[account]; // a viewer's identity is not a confidential *amount* — public.
    }

    // ============================================================================================
    // Gated views — a confidential balance is returned only to its owner or the owner's observer.
    // ============================================================================================

    /// @inheritdoc IConfidentialToken
    // APS-SWAP: on Arc the enclave enforces this against a signed view key; here msg.sender-gating is
    // notional (spoofable via eth_call.from off-APS). The SEMANTICS are identical.
    function confidentialBalanceOf(address account) external view returns (uint256) {
        if (msg.sender != account && _observer[account] != msg.sender) revert NotAuthorizedToView();
        return _confidentialBalance[account];
    }

    /// @inheritdoc IConfidentialToken
    function totalShielded() external view returns (uint256) {
        return _totalShielded;
    }
}
