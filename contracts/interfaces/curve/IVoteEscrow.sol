// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase

pragma solidity >=0.6.12;

interface IVoteEscrow {
    function create_lock(uint256, uint256) external;

    function increase_amount(uint256) external;

    function increase_unlock_time(uint256) external;

    function withdraw() external;
}
