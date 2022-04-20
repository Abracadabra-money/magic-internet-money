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


    /// @inheritdoc IWhitelister
    function getBorrowStatus(address user, uint256 newBorrowAmount) external view override returns (bool success) {
        return amountAllowed[user] >= newBorrowAmount;
    }


    /// @inheritdoc IWhitelister
    function setMaxBorrow(address user, uint256 maxBorrow, bytes32[] calldata merkleProof) external returns (bool success) {
        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(user, maxBorrow));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'Whitelister: Invalid proof.');

        amountAllowed[user] = maxBorrow;

        emit LogSetMaxBorrow(user, maxBorrow);

        return true;
    }

}