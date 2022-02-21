// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface IOptimizerStrategy {
    function governance() external view returns (address);

    function setMaxTotalSupply(uint256 _maxTotalSupply) external;
}
