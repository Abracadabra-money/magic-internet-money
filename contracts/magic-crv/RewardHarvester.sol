// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/Tether.sol";
import "../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../interfaces/curve/ICurvePool.sol";

interface ICurveVoter {
    function lock() external;

    function claim(address recipient) external;
}

contract RewardHarvester is Ownable {
    using SafeTransferLib for ERC20;

    error InsufficientOutput();
    error NotAllowed();

    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    ERC20 public constant CRV3 = ERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
    ERC20 public constant WETH = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    CurvePool public constant CRV3POOL = CurvePool(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);
    CurvePool public constant CRVETH = CurvePool(0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    ICurveVoter public immutable curveVoter;

    mapping(address => bool) public allowedSenders;

    modifier onlyAllowedSenders() {
        if (!allowedSenders[msg.sender] && msg.sender != owner()) {
            revert NotAllowed();
        }
        _;
    }

    constructor(ICurveVoter _curveVoter) {
        curveVoter = _curveVoter;
        USDT.approve(address(THREECRYPTO), type(uint256).max);
        WETH.approve(address(CRVETH), type(uint256).max);
    }

    function setAllowedSender(address account, bool allowed) external onlyOwner {
        allowedSenders[account] = allowed;
    }

    function harvest(uint256 minAmountOut) external onlyAllowedSenders returns (uint256 amountOut) {
        curveVoter.claim(address(this));

        // 3CRV -> USDT
        CRV3POOL.remove_liquidity_one_coin(CRV3.balanceOf(address(this)), 2, 0);

        // USDT -> WETH
        THREECRYPTO.exchange(0, 2, USDT.balanceOf(address(this)), 0);

        // WETH -> CRV
        amountOut = CRVETH.exchange(0, 1, WETH.balanceOf(address(this)), 0);

        if (amountOut < minAmountOut) {
            revert InsufficientOutput();
        }

        CRV.transfer(address(curveVoter), amountOut);
        curveVoter.lock();
    }
}
