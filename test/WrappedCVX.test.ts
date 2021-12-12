/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";

import { advanceTime, getBigNumber, impersonate } from "../utilities";
import { Cauldron, WrappedCVX } from "../typechain";

const maybe = (process.env.ETHEREUM_RPC_URL || process.env.INFURA_API_KEY) ? describe : describe.skip;

maybe("WrappedCVX", async () => {
  let snapshotId;
  let WrappedCVX: WrappedCVX;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 13728225,
          },
        },
      ],
    })

    await deployments.fixture(['WrappedCVX']);
    const {deployer} = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);
    
    WrappedCVX = await ethers.getContract<WrappedCVX>("WrappedCVX");

    // More operations here...

    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  })

  it("should ...", async() => {
    console.log(WrappedCVX.address);
  });
});
