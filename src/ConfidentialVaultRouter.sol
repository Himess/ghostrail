// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IConfidentialToken} from "./interfaces/IConfidentialToken.sol";
import {ILendingVenue} from "./interfaces/ILendingVenue.sol";

// V2 / AUDIT-GATED: functional PoC skeleton. NOT for mainnet real funds pre-audit.
//
// PULL-BASED (remediated): `executeBatch()` does O(1) work — it snapshots the batch price, updates the
// aggregate `totalShares`, and crosses only the NET to the public venue. It does NOT loop over
// participants, so it cannot be griefed into an out-of-gas DoS by many small deposits. Each user then
// PULLS their own outcome: `claimShares(batchId)` for a deposit, `claim(batchId)` for a withdrawal.
//
// APS-SWAP (contract-wide): per-user `_shares` and the pending batch queues live in pEVM-encrypted state
// on Arc; only `totalShares`, `totalAssets`, and the per-batch NET flow are public. Here we emulate the
// SAME visibility with access control + amount-free events. NOTIONAL privacy off-APS — see FRONTEND_NOTES/
// IMPLEMENTATION.md.

/// @title ConfidentialVaultRouter — Module B: pooled confidential deposits routed into an EXISTING public
///        lending venue (D1: layer, not venue). Users deposit cUSDC and hold CONFIDENTIAL shares; the
///        router keeps a SINGLE public position in the venue. Individual positions stay hidden; only the
///        NET of each batch crosses the public boundary (GhostGate netting, D7).
/// @notice Immutable, NO owner, NO admin, NO privileged fund path (D5). The `auditor` may only READ shares.
///         Batches are permissionless keeper calls.
contract ConfidentialVaultRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- immutable wiring ---
    IConfidentialToken public immutable cToken;
    IERC20 public immutable underlying;
    ILendingVenue public immutable venue;
    address public immutable auditor;
    uint64 public immutable batchWindow;

    // --- inflation-attack defense: virtual shares/assets offset (ERC-4626 hardening) ---
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant VIRTUAL_ASSETS = 1;

    // --- confidential state (APS-SWAP: pEVM-encrypted on Arc; gated on read; never emitted) ---
    mapping(address => uint256) private _shares; // per-user confidential shares (claimed)
    mapping(address => uint256) private _reservedShares; // shares locked in a not-yet-claimed withdrawal

    // --- public aggregate (D6) ---
    uint256 public totalShares;

    // --- rolling batch bookkeeping ---
    uint256 public currentBatch; // id of the OPEN batch that new requests join
    uint64 public batchOpenedAt; // timestamp the open batch started

    struct BatchInfo {
        bool executed;
        int8 netDirection; // +1 deposit / -1 withdraw / 0 none
        uint256 netAmount;
        uint256 assetsSnap; // totalAssets() + VIRTUAL_ASSETS at execution
        uint256 sharesSnap; // totalShares + VIRTUAL_SHARES at execution
    }

    mapping(uint256 => BatchInfo) private _batch;
    mapping(uint256 => uint256) private _depositTotal; // batch => total cUSDC queued
    mapping(uint256 => uint256) private _withdrawShares; // batch => total shares queued
    mapping(uint256 => mapping(address => uint256)) private _pendingDeposit; // batch => user => cUSDC
    mapping(uint256 => mapping(address => uint256)) private _pendingWithdraw; // batch => user => shares
    mapping(address => uint256[]) private _userBatches; // batches a user has (had) pending entries in
    mapping(uint256 => mapping(address => bool)) private _tracked; // (batch,user) already in _userBatches — dedupe

    // APS-SWAP: events carry only aggregates / net flow — never a per-user amount.
    event DepositQueued(address indexed account, uint256 indexed batchId); // NO amount
    event WithdrawQueued(address indexed account, uint256 indexed batchId); // NO share amount
    event DepositCancelled(address indexed account, uint256 indexed batchId); // NO amount
    event WithdrawCancelled(address indexed account, uint256 indexed batchId); // NO amount
    event SharesClaimed(address indexed account, uint256 indexed batchId); // NO amount
    event Claimed(address indexed account, uint256 indexed batchId); // NO amount
    /// @notice The ONE public movement per batch: net direction, net amount, batch share price.
    event BatchExecuted(uint256 indexed batchId, int8 netDirection, uint256 netAmount, uint256 sharePrice);

    error ZeroAmount();
    error InsufficientShares();
    error NothingToClaim();
    error WindowNotClosed();
    error BatchNotExecuted();
    error NotAuthorizedToView();

    constructor(
        IConfidentialToken _cToken,
        IERC20 _underlying,
        ILendingVenue _venue,
        address _auditor,
        uint64 _batchWindow
    ) {
        cToken = _cToken;
        underlying = _underlying;
        venue = _venue;
        auditor = _auditor;
        batchWindow = _batchWindow;
        batchOpenedAt = uint64(block.timestamp);
    }

    // ============================================================================================
    // User money paths (all confidential; nothing crosses to the public venue until executeBatch)
    // ============================================================================================

    /// @notice Queue a cUSDC deposit into the open batch. Caller must first grant this router a cUSDC
    ///         operator. Shares are priced at batch execution and PULLED via `claimShares(batchId)`.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 b = currentBatch;
        _track(b, msg.sender);
        _pendingDeposit[b][msg.sender] += amount;
        _depositTotal[b] += amount;
        cToken.confidentialTransferFrom(msg.sender, address(this), amount); // operator pull
        emit DepositQueued(msg.sender, b);
    }

    /// @notice Queue a redemption of `shares` into the open batch (reserved now; valued at execution;
    ///         cUSDC PULLED via `claim(batchId)`).
    function requestWithdraw(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (_shares[msg.sender] - _reservedShares[msg.sender] < shares) revert InsufficientShares();
        uint256 b = currentBatch;
        _track(b, msg.sender);
        _reservedShares[msg.sender] += shares;
        _pendingWithdraw[b][msg.sender] += shares;
        _withdrawShares[b] += shares;
        emit WithdrawQueued(msg.sender, b);
    }

    /// @notice Cancel a queued deposit in the still-open current batch → full cUSDC refund.
    function cancelDeposit() external nonReentrant {
        uint256 b = currentBatch; // only the open batch is cancellable
        uint256 amt = _pendingDeposit[b][msg.sender];
        if (amt == 0) revert NothingToClaim();
        _pendingDeposit[b][msg.sender] = 0; // effects before interaction
        _depositTotal[b] -= amt;
        cToken.confidentialTransfer(msg.sender, amt);
        emit DepositCancelled(msg.sender, b);
    }

    /// @notice Cancel a queued withdrawal in the still-open current batch → un-reserve the shares.
    function cancelWithdraw() external nonReentrant {
        uint256 b = currentBatch;
        uint256 s = _pendingWithdraw[b][msg.sender];
        if (s == 0) revert NothingToClaim();
        _pendingWithdraw[b][msg.sender] = 0;
        _withdrawShares[b] -= s;
        _reservedShares[msg.sender] -= s;
        emit WithdrawCancelled(msg.sender, b);
    }

    // ============================================================================================
    // Batch execution — permissionless, O(1). The ONLY public boundary crossing (D7 netting).
    // ============================================================================================

    /// @notice Execute the open batch once its window closes: snapshot the price, update the aggregate
    ///         share supply, and cross ONLY the net to/from the public venue. No per-participant loop.
    function executeBatch() external nonReentrant {
        if (block.timestamp < batchOpenedAt + batchWindow) revert WindowNotClosed();
        uint256 b = currentBatch;

        uint256 assetsSnap = totalAssets() + VIRTUAL_ASSETS;
        uint256 sharesSnap = totalShares + VIRTUAL_SHARES;

        uint256 depositValue = _depositTotal[b];
        uint256 withdrawValue = Math.mulDiv(_withdrawShares[b], assetsSnap, sharesSnap); // floor
        uint256 sharesToMint = Math.mulDiv(depositValue, sharesSnap, assetsSnap); // floor

        // Aggregate supply update (per-user amounts are pulled later; safe-direction dust stays in-pool).
        totalShares = totalShares + sharesToMint - _withdrawShares[b];

        int8 netDir;
        uint256 netAmount;
        if (depositValue > withdrawValue) {
            netDir = 1;
            netAmount = depositValue - withdrawValue;
        } else if (withdrawValue > depositValue) {
            netDir = -1;
            netAmount = withdrawValue - depositValue;
        }
        uint256 sharePrice = Math.mulDiv(assetsSnap, 1e6, sharesSnap);

        _batch[b] = BatchInfo({
            executed: true, netDirection: netDir, netAmount: netAmount, assetsSnap: assetsSnap, sharesSnap: sharesSnap
        });
        currentBatch = b + 1;
        batchOpenedAt = uint64(block.timestamp);

        // Interactions — a single net movement across the CONFIDENTIAL | PUBLIC boundary.
        if (netDir == 1) {
            cToken.unshield(netAmount);
            underlying.forceApprove(address(venue), netAmount);
            venue.deposit(netAmount);
        } else if (netDir == -1) {
            venue.withdraw(netAmount);
            underlying.forceApprove(address(cToken), netAmount);
            cToken.shield(netAmount);
        }

        emit BatchExecuted(b, netDir, netAmount, sharePrice);
    }

    // ============================================================================================
    // Pull outcomes
    // ============================================================================================

    /// @notice Pull the shares owed for a deposit in an executed batch, priced at that batch.
    function claimShares(uint256 batchId) external nonReentrant {
        BatchInfo memory bi = _batch[batchId];
        if (!bi.executed) revert BatchNotExecuted();
        uint256 amt = _pendingDeposit[batchId][msg.sender];
        if (amt == 0) revert NothingToClaim();
        _pendingDeposit[batchId][msg.sender] = 0;
        uint256 sh = Math.mulDiv(amt, bi.sharesSnap, bi.assetsSnap); // floor; totalShares already minted
        _shares[msg.sender] += sh;
        emit SharesClaimed(msg.sender, batchId);
    }

    /// @notice Pull the cUSDC owed for a withdrawal in an executed batch, priced at that batch.
    function claim(uint256 batchId) external nonReentrant {
        BatchInfo memory bi = _batch[batchId];
        if (!bi.executed) revert BatchNotExecuted();
        uint256 s = _pendingWithdraw[batchId][msg.sender];
        if (s == 0) revert NothingToClaim();
        _pendingWithdraw[batchId][msg.sender] = 0;
        uint256 assetsOut = Math.mulDiv(s, bi.assetsSnap, bi.sharesSnap); // floor
        _shares[msg.sender] -= s; // finalize the burn against the user's balance
        _reservedShares[msg.sender] -= s;
        cToken.confidentialTransfer(msg.sender, assetsOut);
        emit Claimed(msg.sender, batchId);
    }

    // ============================================================================================
    // Views
    // ============================================================================================

    /// @notice Total assets backing shares = the router's single public position in the venue (incl. yield).
    function totalAssets() public view returns (uint256) {
        return venue.balanceOf(address(this));
    }

    /// @notice Public share-math preview — reveals nothing about any individual holder.
    function previewRedeem(uint256 shares) public view returns (uint256) {
        return Math.mulDiv(shares, totalAssets() + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
    }

    /// @notice Executed-batch summary (public): direction/amount/price + whether it ran.
    function batchResult(uint256 batchId)
        external
        view
        returns (bool executed, int8 netDirection, uint256 netAmount, uint256 sharePrice)
    {
        BatchInfo memory bi = _batch[batchId];
        sharePrice = bi.sharesSnap == 0 ? 0 : Math.mulDiv(bi.assetsSnap, 1e6, bi.sharesSnap);
        return (bi.executed, bi.netDirection, bi.netAmount, sharePrice);
    }

    /// @notice Shares of `account` — caller must be `account` or the auditor (read-only).
    // APS-SWAP: enclave-enforced against a signed view key on Arc; notional here.
    function sharesOf(address account) external view returns (uint256) {
        _requireCanView(account);
        return _shares[account];
    }

    /// @notice Batches in which `account` still has a pending deposit or withdrawal (for the claim UI).
    function pendingBatchesOf(address account) external view returns (uint256[] memory out) {
        _requireCanView(account);
        uint256[] storage all = _userBatches[account];
        uint256 n;
        for (uint256 i; i < all.length; ++i) {
            uint256 b = all[i];
            if (_pendingDeposit[b][account] != 0 || _pendingWithdraw[b][account] != 0) n++;
        }
        out = new uint256[](n);
        uint256 j;
        for (uint256 i; i < all.length; ++i) {
            uint256 b = all[i];
            if (_pendingDeposit[b][account] != 0 || _pendingWithdraw[b][account] != 0) out[j++] = b;
        }
    }

    /// @notice Shares `account` would receive by claiming an executed deposit batch (0 if n/a). Gated.
    function previewClaimShares(uint256 batchId, address account) external view returns (uint256) {
        _requireCanView(account);
        BatchInfo memory bi = _batch[batchId];
        uint256 amt = _pendingDeposit[batchId][account];
        if (!bi.executed || amt == 0) return 0;
        return Math.mulDiv(amt, bi.sharesSnap, bi.assetsSnap);
    }

    /// @notice cUSDC `account` would receive by claiming an executed withdrawal batch (0 if n/a). Gated.
    function previewClaim(uint256 batchId, address account) external view returns (uint256) {
        _requireCanView(account);
        BatchInfo memory bi = _batch[batchId];
        uint256 s = _pendingWithdraw[batchId][account];
        if (!bi.executed || s == 0) return 0;
        return Math.mulDiv(s, bi.assetsSnap, bi.sharesSnap);
    }

    /// @notice Total cUSDC currently claimable by `account` across executed, unclaimed withdrawal batches.
    function claimableOf(address account) external view returns (uint256 total) {
        _requireCanView(account);
        uint256[] storage all = _userBatches[account];
        for (uint256 i; i < all.length; ++i) {
            uint256 b = all[i];
            BatchInfo memory bi = _batch[b];
            uint256 s = _pendingWithdraw[b][account];
            if (bi.executed && s != 0) total += Math.mulDiv(s, bi.assetsSnap, bi.sharesSnap);
        }
    }

    /// @notice Public solvency check (D6): total shares vs venue backing. `previewRedeem(totalShares) <=
    ///         backingAssets` always (fuzzed).
    function checkSolvency() external view returns (uint256 totalSharesPublic, uint256 backingAssets) {
        totalSharesPublic = totalShares;
        backingAssets = totalAssets();
    }

    // ============================================================================================
    // Internal
    // ============================================================================================

    function _track(uint256 b, address user) private {
        // Push each (batch, user) at most ONCE. Guarding on live pending amounts alone double-pushes across a
        // deposit → cancel → deposit cycle (both pendings read 0 again), inflating _userBatches so the
        // claimableOf / pendingBatchesOf views double-count. A permanent tracked-flag dedupes regardless of cancels.
        if (!_tracked[b][user]) {
            _tracked[b][user] = true;
            _userBatches[user].push(b);
        }
    }

    function _requireCanView(address account) private view {
        if (msg.sender != account && msg.sender != auditor) revert NotAuthorizedToView();
    }
}
