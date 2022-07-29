// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "solmate/src/utils/SafeTransferLib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IMagicCrvOracle {
    function peekSpot(bytes calldata data) external view returns (uint256 rate);
}

contract MIMMagicCrvPool is Ownable {
    using SafeTransferLib for ERC20;

    error NotAuthorized();

    IAggregator public constant MIM_ORACLE = IAggregator(0x7A364e8770418566e3eb2001A96116E6138Eb32F);
    ERC20 public constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    ERC20 public immutable magicCRV;
    IMagicCrvOracle public immutable oracle;

    mapping(address => bool) public swappers;

    modifier onlyAllowedSwappers() {
        if (!swappers[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    constructor(ERC20 _magicCRV, IMagicCrvOracle _oracle) {
        magicCRV = _magicCRV;
        oracle = _oracle;
    }

    function exchangeToMim(uint256 amountIn, address recipient) public onlyAllowedSwappers returns (uint256 amountOut) {
        magicCRV.transferFrom(msg.sender, address(this), amountIn);
        
        uint256 magicCrvToMim = (1e36 / oracle.peekSpot("0x")) * uint256(MIM_ORACLE.latestAnswer()); // 26 decimals
        amountOut = (amountIn * magicCrvToMim) / 1e26;

        MIM.transfer(recipient, amountOut);
    }

    function setAllowedSwapper(address swapper, bool allowed) external onlyOwner {
        swappers[swapper] = allowed;
    }

    function withdraw(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
