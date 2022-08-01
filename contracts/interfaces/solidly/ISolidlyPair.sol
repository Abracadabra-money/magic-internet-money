// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity >=0.6.2;

interface ISolidlyPair {
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256);

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );

    function token0() external pure returns (address);

    function token1() external pure returns (address);

    function reserve0() external pure returns (uint256);

    function reserve1() external pure returns (uint256);
}
