// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.6.12;

interface IStargatePool {
    function totalLiquidity() external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function decimals() external view returns (uint256);

    function localDecimals() external view returns (uint256);

    function token() external view returns (address);
}
