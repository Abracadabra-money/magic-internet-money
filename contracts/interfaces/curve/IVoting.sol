// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface IVoting {
    function vote(
        uint256 _voteData,
        bool _supports,
        bool _executesIfDecided
    ) external;
}
