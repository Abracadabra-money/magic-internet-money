// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

import "./IBentoBoxV1.sol";

interface ICauldron {
    function userCollateralShare(address account) external view returns (uint256);

    function bentoBox() external view returns (IBentoBoxV1);

    function oracle() external view returns (address);

    function oracleData() external view returns (bytes memory);

    function collateral() external view returns (address);

    function updateExchangeRate() external returns (bool updated, uint256 rate);

    function addCollateral(
        address to,
        bool skim,
        uint256 share
    ) external;

    function borrow(address to, uint256 amount) external returns (uint256 part, uint256 share);

    function cook(
        uint8[] calldata actions,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external payable returns (uint256 value1, uint256 value2);

    function removeCollateral(address to, uint256 share) external;

    function userBorrowPart(address) external view returns (uint256);

    function liquidate(
        address[] calldata users,
        uint256[] calldata maxBorrowParts,
        address to,
        address swapper
    ) external;

    function exchangeRate() external view returns (uint256);
}
