// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IConvexStakingWrapperAbraFactory {
    function clone(address target) external returns (address result);
}