// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;
import "../interfaces/yearn/IYearnVault.sol";

contract YearnVaultMock is IYearnVault {
    function withdraw() external returns (uint256) {

    }
    function deposit(uint256 amount, address recipient) external returns (uint256) {

    }
}
