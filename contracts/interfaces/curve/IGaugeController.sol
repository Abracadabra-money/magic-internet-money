// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase

pragma solidity >=0.6.12;

interface IGaugeController {
    function vote_for_gauge_weights(address, uint256) external;
}