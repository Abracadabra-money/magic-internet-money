// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.9.0;

import "./INFTOracle.sol";

struct TokenLoanParamsWithOracle {
    uint128 valuation; // How much will you get? OK to owe until expiration.
    uint64 duration; // Length of loan in seconds
    uint16 annualInterestBPS; // Variable cost of taking out the loan
    uint16 ltvBPS; // Required to avoid liquidation
    INFTOracle oracle; // Oracle used for price
}
