// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

import "../../libraries/Babylonian.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/curve/ICurveThreePool.sol";
import "../../interfaces/Tether.sol";

contract SpiritfUSDTUSDCLevSwapper {
    IBentoBoxV1 public immutable bentoBox;
    IUniswapV2Pair public constant LP = IUniswapV2Pair(0xe7F86CEf8FEf60ce5050899D1F8e465C00D04a79);
    IUniswapV2Router01 public constant ROUTER = IUniswapV2Router01(0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52);

    CurvePool public constant MIM3POOL = CurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);
    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    IERC20 public constant USDC = IERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    IERC20 public constant FUSDT = IERC20(0x049d68029688eAbF473097a2fC38ef61633A3C7A);

    constructor(IBentoBoxV1 _bentoBox) {
        bentoBox = _bentoBox;

        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(MIM3POOL), type(uint256).max);
        FUSDT.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(ROUTER), type(uint256).max);
        FUSDT.approve(address(ROUTER), type(uint256).max);
    }

    function _calculateSwapInAmount(uint256 reserveIn, uint256 userIn) internal pure returns (uint256) {
        return (Babylonian.sqrt(reserveIn * ((userIn * 3988000) + (reserveIn * 3988009))) - (reserveIn * 1997)) / 1994;
    }

    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> FUSDT
        MIM3POOL.exchange(0, 1, mimAmount / 2, 0, address(this));

        // MIM -> USDC
        MIM3POOL.exchange(0, 2, MIM.balanceOf(address(this)), 0, address(this));

        uint256 token0Balance = USDC.balanceOf(address(this));
        uint256 token1Balance = FUSDT.balanceOf(address(this));

        (uint256 idealAmount0, uint256 idealAmount1, uint256 lpAmount) = ROUTER.addLiquidity(
            address(USDC),
            address(FUSDT),
            token0Balance,
            token1Balance,
            0,
            0,
            address(bentoBox),
            type(uint256).max
        );

        token0Balance = token0Balance - idealAmount0;
        token1Balance = token1Balance - idealAmount1;

        if (token0Balance >= 2e6 || token1Balance >= 2e6) {
            // swap remaining token0 in the contract
            if (token0Balance > 0) {
                // swap half USDC to FUSDT
                token0Balance -= token0Balance / 2;
                token1Balance += MIM3POOL.exchange(2, 1, token0Balance, 0, address(this));
            }
            // swap remaining token1 in the contract
            else {
                // swap half FUSDT to USDC
                token1Balance -= token1Balance / 2;
                token0Balance += MIM3POOL.exchange(1, 2, token1Balance, 0, address(this));
            }

            (, , uint256 lpAmountFromRemaining) = ROUTER.addLiquidity(
                address(USDC),
                address(FUSDT),
                token0Balance,
                token1Balance,
                0,
                0,
                address(bentoBox),
                type(uint256).max
            );

            lpAmount += lpAmountFromRemaining;
        }

        (, shareReturned) = bentoBox.deposit(IERC20(address(LP)), address(bentoBox), recipient, lpAmount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
