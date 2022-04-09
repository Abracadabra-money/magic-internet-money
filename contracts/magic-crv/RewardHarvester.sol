// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/Tether.sol";
import "../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../interfaces/curve/ICurveThreePool.sol";
import "../interfaces/curve/ICurvePool.sol";

interface ICurveVoter {
    function lock() external;

    function claimAll(address recipient) external returns (uint256 amount);

    function claim(address recipient) external returns (uint256 amount);
}

contract RewardHarvester is Ownable {
    error InsufficientOutput();
    error NotAllowed();

    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    ERC20 public constant CRV3 = ERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
    ERC20 public constant WETH = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    CurveThreePool public constant CRV3POOL = CurveThreePool(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);
    CurvePool public constant CRVETH = CurvePool(0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    CurveThreeCryptoPool public constant TRICRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    ICurveVoter public immutable curveVoter;

    mapping(address => bool) public allowedHarvesters;

    modifier onlyAllowedHarvesters() {
        if (!allowedHarvesters[msg.sender] && msg.sender != owner()) {
            revert NotAllowed();
        }
        _;
    }

    constructor(ICurveVoter _curveVoter) {
        curveVoter = _curveVoter;
        USDT.approve(address(TRICRYPTO), type(uint256).max);
        WETH.approve(address(CRVETH), type(uint256).max);
    }

    function setAllowedHarvester(address account, bool allowed) external onlyOwner {
        allowedHarvesters[account] = allowed;
    }

    function harvest(uint256 minAmountOut) external onlyAllowedHarvesters returns (uint256 amountOut) {
        uint256 crvAmount = curveVoter.claim(address(this));

        if (crvAmount != 0) {
            amountOut = _harvest(crvAmount, minAmountOut);
        }
    }

    function harvestAll(uint256 minAmountOut) external onlyAllowedHarvesters returns (uint256 amountOut) {
        uint256 crvAmount = curveVoter.claimAll(address(this));

        if (crvAmount != 0) {
            amountOut = _harvest(crvAmount, minAmountOut);
        }
    }

    function _harvest(uint256 crvAmount, uint256 minAmountOut) private returns (uint256 amountOut) {
        // 3CRV -> USDT
        CRV3POOL.remove_liquidity_one_coin(crvAmount, 2, 0);

        // USDT -> WETH
        TRICRYPTO.exchange(0, 2, USDT.balanceOf(address(this)), 0);

        // WETH -> CRV
        amountOut = CRVETH.exchange(0, 1, WETH.balanceOf(address(this)), 0);

        if (amountOut < minAmountOut) {
            revert InsufficientOutput();
        }

        CRV.transfer(address(curveVoter), amountOut);
        curveVoter.lock();
    }
}
