// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapperGeneric.sol";
import "../../interfaces/IPopsicle.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";

contract SpiritfUSDTUSDCSwapper is ISwapperGeneric {
    IBentoBoxV1 public immutable bentoBox;

    IUniswapV2Pair public constant LP = IUniswapV2Pair(0xe7F86CEf8FEf60ce5050899D1F8e465C00D04a79);

    CurvePool public constant MIM3POOL = CurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);
    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    IERC20 public constant USDC = IERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    IERC20 public constant FUSDT = IERC20(0x049d68029688eAbF473097a2fC38ef61633A3C7A);

    constructor(IBentoBoxV1 _bentoBox) {
        bentoBox = _bentoBox;

        USDC.approve(address(MIM3POOL), type(uint256).max);
        FUSDT.approve(address(MIM3POOL), type(uint256).max);
    }

    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = bentoBox.withdraw(IERC20(address(LP)), address(this), address(this), 0, shareFrom);

        // LP -> USDC/fUSDT
        LP.transfer(address(LP), amountFrom);
        (uint256 usdcAmount, uint256 fusdtAmount) = LP.burn(address(this));

        // fUSDT -> MIM
        uint256 mimAmount = MIM3POOL.exchange(1, 0, fusdtAmount, 0, address(bentoBox));

        // USDC -> MIM
        mimAmount += MIM3POOL.exchange(2, 0, usdcAmount, 0, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(MIM, address(bentoBox), recipient, mimAmount, 0);
        extraShare = shareReturned - shareToMin;
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapperGeneric
    function swapExact(
        IERC20,
        IERC20,
        address,
        address,
        uint256,
        uint256
    ) public pure virtual returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
