// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface IYearnVault {
    function withdraw() external returns (uint256);
    function deposit(uint256 amount, address recipient) external returns (uint256);
}