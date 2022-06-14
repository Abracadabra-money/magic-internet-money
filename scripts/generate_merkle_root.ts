import fs from 'fs'
import * as yargs from 'yargs'
import { ethers } from "ethers";
const { exec } = require('child_process');
import { MerkleTree } from "merkletreejs";

let args:any = yargs
    .option('input', {
        alias: 'i',
        description: 'input JSON file location containing a map of account addresses to string balances',
        demand: true
    })
    .option('output', {
        alias: 'o',
        description: 'output file',
        demand: true
    }).argv;

const json = JSON.parse(fs.readFileSync(args.input, { encoding: 'utf8' }))


if (typeof json !== 'object') throw new Error('Invalid JSON')

const getHash = (key: string, userBorrowPart: string) => {
    const abiCoder = new ethers.utils.AbiCoder();
    return ethers.utils.keccak256(
        abiCoder.encode(
            ["address", "uint256"],
            [key, userBorrowPart]
        )
    );
}

const hashWhitelistNode = (account: string, maxBorrow: string) => {
    return Buffer.from(ethers.utils.solidityKeccak256(["address", "uint256"], [account, maxBorrow]).slice(2), "hex");
  };

const createMerkle = (json: {string: {"userBorrowPart": string}}) => {
    type Output = {"merkleRoot": string, "total": string, string: {"userBorrowPart": string, "leaf": string}}
    let outputObj:  Output | {} = {};
    let leaves:Buffer[] = []
    type BorrowPart = {userBorrowPart: string};
    let intermediate = {}
    let total = ethers.BigNumber.from(0)
    for (const [key, value] of Object.entries(json)) {
        if(value.userBorrowPart != "0") {
            let borrowPart = Number(value.userBorrowPart).toLocaleString('fullwide', { useGrouping: false })
            total = total.add(ethers.BigNumber.from(borrowPart).div(ethers.BigNumber.from("1000000000000000000")))
            let hash = hashWhitelistNode(key, borrowPart)
            leaves.push(hash)
            outputObj[key] = {}
            outputObj[key].userBorrowPart = borrowPart;
            outputObj[key].leaf = ethers.utils.hexlify(hash);
            intermediate[key] = hash;
        }
    }
    
    const merkleTree = new MerkleTree(leaves, item => ethers.utils.keccak256(item), { sortPairs: true });
    
    let merkleRoot = merkleTree.getHexRoot();
    for (const [key, value] of Object.entries(outputObj)) {
        outputObj[key].proof = merkleTree.getHexProof(intermediate[key])
    }

    outputObj["total"] = total.toString()

    outputObj["merkleRoot"] = merkleRoot;
    return outputObj;
}

fs.writeFileSync(args.output, JSON.stringify(createMerkle(json), null, 4))

exec("npx ipd " + args.output, (error: any, stdout: any, stderr: any) => {
    if (error) {
        console.log(`error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.log(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
  }); 

