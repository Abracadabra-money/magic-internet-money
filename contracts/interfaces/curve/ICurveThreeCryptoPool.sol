// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface CurveThreeCryptoPool {
    function exchange(
        uint256 i,
        uint256 j,
        uint256 dx,
        uint256 min_dy
    ) payable external;

    function get_dy(
        uint256 i,
        uint256 j,
        uint256 dx
    ) external view returns (uint256);

    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
}
