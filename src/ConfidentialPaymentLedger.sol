// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IConfidentialToken} from "./interfaces/IConfidentialToken.sol";

// APS-SWAP (contract-wide): On Arc APS every balance/receipt below lives in pEVM-encrypted state; the
// `pay` graph (payer -> service, amount, ref) is sealed calldata + sealed storage; reads are enforced by
// the enclave + view keys. Here we emulate the SAME semantics with access control + amount-free events.
// This is NOTIONAL privacy off-APS (storage is readable, `eth_call.from` spoofable) — see IMPLEMENTATION.md.

/// @title ConfidentialPaymentLedger — Module A: confidential payment accounts for the x402 / MCP paid-tool
///        economy. An agent funds a private balance once, then pays many services; amounts, counterparties
///        and the timing of a service's cash-out are hidden. Operational privacy, NOT a mixer (D4).
/// @notice Immutable, NO owner, NO admin, NO privileged fund path (D5). The only way value leaves is a
///         holder spending their OWN balance (`pay`) or claiming their OWN queued withdrawal.
contract ConfidentialPaymentLedger is ReentrancyGuard {
    /// @notice The confidential USDC this ledger accounts in. Immutable.
    IConfidentialToken public immutable cusdc;

    /// @notice Withdrawal timing-decorrelation window, in seconds. A `requestWithdraw` becomes claimable
    ///         only `withdrawWindow` seconds later, so a service's outbound cUSDC cannot be timing-linked
    ///         to the specific payments that funded it. Immutable.
    uint64 public immutable withdrawWindow;

    struct Receipt {
        address payer;
        address service;
        uint256 amount;
        uint64 timestamp;
        bytes32 ref;
    }

    struct PendingWithdraw {
        uint256 amount;
        uint64 claimableAt;
    }

    // --- confidential state (APS-SWAP: pEVM-encrypted on Arc; gated on read; never emitted) ---
    mapping(address => uint256) private _balance; // internal account balances
    mapping(bytes32 => Receipt) private _receipts; // receiptId => record
    mapping(address => bytes32[]) private _history; // account => receiptIds where it is payer OR service
    mapping(address => uint256) private _nonce; // per-payer nonce → unique receiptIds
    mapping(address => PendingWithdraw) private _pendingWithdraw;

    // --- view keys: account => authorized viewer (auditor / accountant). Set by the holder. ---
    mapping(address => address) public viewKeyOf;

    // --- public solvency aggregate (D6). Invariant: == cusdc.confidentialBalanceOf(this) ---
    uint256 public totalLedgerBalance;

    // APS-SWAP: events carry NO confidential value. `PaymentExecuted` is an opaque receiptId (a hash of
    // payer/service/amount/ref/nonce) — it reveals THAT a payment happened, never the parties or amount.
    event Funded(address indexed account); // NO amount
    event PaymentExecuted(bytes32 indexed receiptId); // opaque; NO payer/service/amount/ref
    event WithdrawRequested(address indexed account); // NO amount
    event WithdrawClaimed(address indexed account); // NO amount
    event ViewKeyGranted(address indexed account, address indexed viewer);

    error ZeroAmount();
    error InsufficientBalance();
    error UnknownReceipt();
    error NotAuthorizedToView();
    error NothingPending();
    error WindowNotClosed();
    error WithdrawAlreadyPending();

    constructor(IConfidentialToken _cusdc, uint64 _withdrawWindow) {
        cusdc = _cusdc;
        withdrawWindow = _withdrawWindow;
    }

    // ============================================================================================
    // Money paths
    // ============================================================================================

    /// @notice Pull `amount` cUSDC from the caller into their ledger account. Caller must first grant this
    ///         ledger as an operator on the cUSDC token (`cusdc.setOperator(ledger, until)`).
    // APS-SWAP: on Arc this is a sealed confidential transfer; the pulled amount is not observable.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        // Effects first (CEI). The external pull settles the cUSDC into this contract.
        _balance[msg.sender] += amount;
        totalLedgerBalance += amount;
        cusdc.confidentialTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender);
    }

    /// @notice Pay `service` `amount` from the caller's balance, tagged with a free-form `ref`.
    /// @dev Pure internal-balance move: no cUSDC leaves the ledger, so payments are unobservable at the
    ///      token layer. Returns an opaque receiptId the service can later verify with a gated view.
    function pay(address service, uint256 amount, bytes32 ref) external returns (bytes32 receiptId) {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = _balance[msg.sender];
        if (bal < amount) revert InsufficientBalance(); // D11: plain revert; only the payer learns.
        unchecked {
            _balance[msg.sender] = bal - amount;
            _balance[service] += amount;
        }
        receiptId = keccak256(abi.encode(msg.sender, service, amount, ref, _nonce[msg.sender]++));
        _receipts[receiptId] = Receipt({
            payer: msg.sender, service: service, amount: amount, timestamp: uint64(block.timestamp), ref: ref
        });
        _history[msg.sender].push(receiptId);
        _history[service].push(receiptId);
        emit PaymentExecuted(receiptId); // opaque only
    }

    /// @notice Queue `amount` of the caller's balance for withdrawal; claimable after `withdrawWindow`.
    /// @dev The amount is moved out of the spendable balance immediately (so it can't be double-spent),
    ///      but the cUSDC only leaves on `claimWithdraw`, decorrelating the cash-out from the payments.
    function requestWithdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (_pendingWithdraw[msg.sender].amount != 0) revert WithdrawAlreadyPending();
        uint256 bal = _balance[msg.sender];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balance[msg.sender] = bal - amount;
        }
        _pendingWithdraw[msg.sender] =
            PendingWithdraw({amount: amount, claimableAt: uint64(block.timestamp) + withdrawWindow});
        emit WithdrawRequested(msg.sender); // NO amount
    }

    /// @notice Claim a matured withdrawal — sends the queued cUSDC to the caller.
    function claimWithdraw() external nonReentrant {
        PendingWithdraw memory p = _pendingWithdraw[msg.sender];
        if (p.amount == 0) revert NothingPending();
        if (block.timestamp < p.claimableAt) revert WindowNotClosed();
        // Effects before interaction (CEI).
        delete _pendingWithdraw[msg.sender];
        totalLedgerBalance -= p.amount;
        cusdc.confidentialTransfer(msg.sender, p.amount);
        emit WithdrawClaimed(msg.sender); // NO amount
    }

    /// @notice Grant `viewer` read access to the caller's balance, receipts and statement (0 to revoke).
    function grantViewKey(address viewer) external {
        viewKeyOf[msg.sender] = viewer;
        emit ViewKeyGranted(msg.sender, viewer);
    }

    // ============================================================================================
    // Gated views — confidential values returned only to the owner or its authorized viewer.
    // ============================================================================================

    /// @notice Balance of `account` — caller must be `account` or its view-key holder.
    // APS-SWAP: enclave-enforced against a signed view key on Arc; notional here.
    function balanceOf(address account) external view returns (uint256) {
        _requireCanView(account);
        return _balance[account];
    }

    /// @notice Full receipt for `receiptId` — caller must be its payer, its service, or either's viewer.
    function receiptOf(bytes32 receiptId) external view returns (Receipt memory) {
        Receipt memory r = _receipts[receiptId];
        if (r.payer == address(0)) revert UnknownReceipt();
        if (!_canView(r.payer) && !_canView(r.service)) revert NotAuthorizedToView();
        return r;
    }

    /// @notice Verify a receipt matches the given service, a minimum amount and an exact ref. The SDK's
    ///         402 middleware calls this from the service's own wallet (so the gate passes). Returns
    ///         false (not revert) on a mismatch so the caller can branch.
    function verifyReceipt(bytes32 receiptId, address expectedService, uint256 minAmount, bytes32 expectedRef)
        external
        view
        returns (bool)
    {
        Receipt memory r = _receipts[receiptId];
        if (r.payer == address(0)) revert UnknownReceipt();
        // Only the service (or its viewer) may verify — otherwise a stranger could probe amounts by binary
        // search over minAmount. Gate on the service side.
        if (!_canView(r.service)) revert NotAuthorizedToView();
        return r.service == expectedService && r.amount >= minAmount && r.ref == expectedRef;
    }

    /// @notice A paginated statement of every receipt where `account` is payer or service — caller must be
    ///         `account` or its viewer (e.g. an auditor granted a view key).
    function exportStatement(address account, uint256 offset, uint256 limit)
        external
        view
        returns (Receipt[] memory out)
    {
        _requireCanView(account);
        bytes32[] storage ids = _history[account];
        uint256 n = ids.length;
        if (offset >= n) return new Receipt[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        out = new Receipt[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _receipts[ids[i]];
        }
    }

    /// @notice Public solvency check (D6): internal accounting total vs the backing cUSDC this ledger
    ///         actually holds. Anyone can call; both numbers are aggregates that leak no individual.
    function checkSolvency() external view returns (uint256 internalSum, uint256 backing) {
        internalSum = totalLedgerBalance;
        // The ledger reads its OWN cUSDC balance (caller == account == this) — always authorized.
        backing = cusdc.confidentialBalanceOf(address(this));
    }

    /// @notice Read a matured/pending withdrawal for `account` (gated). Convenience for the UI/SDK.
    function pendingWithdrawOf(address account) external view returns (uint256 amount, uint64 claimableAt) {
        _requireCanView(account);
        PendingWithdraw memory p = _pendingWithdraw[account];
        return (p.amount, p.claimableAt);
    }

    // ============================================================================================
    // View-key helpers
    // ============================================================================================

    function _canView(address account) private view returns (bool) {
        return msg.sender == account || viewKeyOf[account] == msg.sender;
    }

    function _requireCanView(address account) private view {
        if (!_canView(account)) revert NotAuthorizedToView();
    }
}
