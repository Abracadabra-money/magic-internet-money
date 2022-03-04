// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

import "./IBentoBoxV1.sol";

interface ICauldron {
    function userCollateralShare(address account) external view returns (uint256);

    function bentoBox() external view returns (IBentoBoxV1);
}
