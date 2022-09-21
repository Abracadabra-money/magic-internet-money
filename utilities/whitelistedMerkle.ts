import { ethers } from "hardhat";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

export const getWhitelistNode = (account: string, maxBorrow: string) => {
  return Buffer.from(ethers.utils.solidityKeccak256(["address", "uint256"], [account, maxBorrow]).slice(2), "hex");
};

export const createMerkleTree = (items: [string, string][]) => {
  return new MerkleTree(
    items.map((i) => getWhitelistNode(...i)),
    keccak256,
    { sortPairs: true }
  );
};
