// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface ILevSwapperGeneric {
    /// @notice Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) external returns (uint256 extraShare, uint256 shareReturned);
}
