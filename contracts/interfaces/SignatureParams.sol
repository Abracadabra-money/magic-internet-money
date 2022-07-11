// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.9.0;

struct SignatureParams {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

