// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";

contract ERC20Mock is ERC20 {
    uint256 public override totalSupply;
    string public symbol;
    string public name;
    uint8 public decimals;

    constructor(uint256 _initialAmount) public {
        // Give the creator all initial tokens
        balanceOf[msg.sender] = _initialAmount;
        // Update total supply
        totalSupply = _initialAmount;
    }
}
