// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface ISmartWalletWhitelist {
    function approveWallet(address _wallet) external;
    function check(address _wallet) external view returns (bool);
}
