// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.2;

interface ISolidlyRouter {
    // solhint-disable-next-line contract-name-camelcase
    struct route {
        address from;
        address to;
        bool stable;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        );

    function getAmountsOut(uint256 amountIn, route[] memory routes) external view returns (uint256[] memory amounts);

    function pairFor(
        address tokenA,
        address tokenB,
        bool stable
    ) external view returns (address pair);
}
