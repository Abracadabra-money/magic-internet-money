// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface ICauldron {
    function userCollateralShare(address account) external view returns (uint256);
}
