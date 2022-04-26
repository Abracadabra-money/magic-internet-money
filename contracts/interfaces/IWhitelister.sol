// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;

interface IWhitelister {
    /// @notice Get whether user is allowed to borrow
    /// @param user address of the user
    /// @param newBorrowPart new borrow part of the user. 
    /// @return success if user is allowed to borrow said new amount, returns true otherwise false
    function getBorrowStatus(address user, uint256 newBorrowPart) external view returns (bool success);

    /// @notice Function for the user to bring a merkle proof to set a new max borrow
    /// @param user address of the user
    /// @param maxBorrow new max borrowPart for the user. 
    /// @param merkleProof merkle proof provided to user.
    /// @return success if the user is indeed allowed to borrow said new amount
    function setMaxBorrow(address user, uint256 maxBorrow, bytes32[] calldata merkleProof) external returns (bool success);
}
