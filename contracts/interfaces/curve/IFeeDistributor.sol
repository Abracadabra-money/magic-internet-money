// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase

pragma solidity >=0.6.12;

interface IFeeDistributor {
    function claim(address account) external returns (uint256);

    function claim_many(address[20] calldata) external returns (bool);

    function last_token_time() external view returns (uint256);

    function time_cursor() external view returns (uint256);

    function time_cursor_of(address) external view returns (uint256);

    function checkpoint_token() external;
}
