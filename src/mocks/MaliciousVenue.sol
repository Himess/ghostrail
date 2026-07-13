// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILendingVenue} from "../interfaces/ILendingVenue.sol";

interface IReentered {
    function executeBatch() external;
}

/// @title MaliciousVenue — reentrancy attacker for VaultRouter tests.
/// @notice On the first venue call inside `executeBatch`, it re-enters `executeBatch`. The router's
///         `nonReentrant` guard must make the whole transaction revert.
contract MaliciousVenue is ILendingVenue {
    address public asset;
    address public target; // the router to re-enter
    bool private _armed;

    constructor(address _asset) {
        asset = _asset;
    }

    function setTarget(address router) external {
        target = router;
        _armed = true;
    }

    function _attack() private {
        if (_armed && target != address(0)) {
            _armed = false; // one shot — the reentrant call is what we test
            IReentered(target).executeBatch();
        }
    }

    function deposit(uint256) external {
        _attack();
    }

    function withdraw(uint256) external {
        _attack();
    }

    function balanceOf(address) external pure returns (uint256) {
        return 0;
    }
}
