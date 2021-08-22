// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface ICheckpointToken {
    /// @notice checkpoint rewards for given accounts. needs to be called before any balance change
    function user_checkpoint(address[2] calldata _accounts) external returns(bool);
}
