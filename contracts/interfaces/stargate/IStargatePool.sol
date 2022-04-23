// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface IStargatePool {
    function totalLiquidity() external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
