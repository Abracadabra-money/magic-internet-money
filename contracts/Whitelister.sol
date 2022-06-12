// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.10;
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWhitelister.sol";

contract Whitelister is IWhitelister, Ownable {
    event LogSetMaxBorrow(address user, uint256 maxBorrowAmount);
    event LogSetMerkleRoot(bytes32 newRoot, string ipfsMerkleProofs);
    mapping (address => uint256) public amountAllowed;

    bytes32 public merkleRoot;
    string public ipfsMerkleProofs;

    constructor (
        bytes32 _merkleRoot,
        string memory _ipfsMerkleProofs
        ) {
        merkleRoot = _merkleRoot;
        ipfsMerkleProofs = _ipfsMerkleProofs;
        emit LogSetMerkleRoot(_merkleRoot, _ipfsMerkleProofs);
    }

    /// @inheritdoc IWhitelister
    function getBorrowStatus(address user, uint256 newBorrowAmount) external view override returns (bool success) {
        return amountAllowed[user] >= newBorrowAmount;
    }

    /// @inheritdoc IWhitelister
    function setMaxBorrow(address user, uint256 maxBorrow, bytes32[] calldata merkleProof) external returns (bool success) {
        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(user, maxBorrow));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), "Whitelister: Invalid proof.");

        amountAllowed[user] = maxBorrow;

        emit LogSetMaxBorrow(user, maxBorrow);

        return true;
    }

    function changeMerkleRoot(bytes32 newRoot, string calldata ipfsMerkleProofs_) external onlyOwner {
        ipfsMerkleProofs = ipfsMerkleProofs_;
        merkleRoot = newRoot;
        emit LogSetMerkleRoot(newRoot, ipfsMerkleProofs_);
    }

}