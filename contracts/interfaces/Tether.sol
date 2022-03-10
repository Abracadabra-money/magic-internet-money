// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface Tether {
    function approve(address spender, uint256 value) external;

    function balanceOf(address user) external view returns (uint256);

    function transfer(address to, uint256 value) external;
}
