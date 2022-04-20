// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.10;
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IWhitelister.sol";

contract Whitelister is IWhitelister {
    event LogSetMaxBorrow(address user, uint256 maxBorrowAmount);

    mapping (address => uint256) public amountAllowed;

    bytes32 public immutable merkleRoot;
    string public ipfsMerkleProofs;

    constructor (
        bytes32 _merkleRoot,
        string memory _ipfsMerkleProofs
        ) {
        merkleRoot = _merkleRoot;
        ipfsMerkleProofs = _ipfsMerkleProofs;
    }

    /// @notice Get whether user is allowed to borrow
    /// @param user address of the user
    /// @param newBorrowAmount new borrow of the user. 
    /// @return success if user is allowed to borrow said new amount, returns true otherwise false
    function getBorrowStatus(address user, uint256 newBorrowAmount) external view override returns (bool success) {
        return amountAllowed[user] >= newBorrowAmount;
    }

    /// @notice View function to check
    /// @param user address of the user
    /// @param maxBorrow new borrow of the user. 
    /// @param merkleProof merkle proof provided to user to show ownership
    /// @return success if the user is indeed allowed to borrow said new amount
    function setMaxBorrow(address user, uint256 maxBorrow, bytes32[] calldata merkleProof) external returns (bool success) {
        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(user, maxBorrow));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'Whitelister: Invalid proof.');

        amountAllowed[user] = maxBorrow;

        emit LogSetMaxBorrow(user, maxBorrow);

        return true;
    }

}