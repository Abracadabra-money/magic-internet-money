// SPDX-License-Identifier: MIT
pragma solidity  >=0.6.12;

interface ICollateralAmountAware {
    function userCollateralAmount(address account) external view returns(uint256);
}
