import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";

import { advanceTime, getBigNumber, impersonate } from "../utilities";
import { Cauldron, EthereumWithdrawer } from "../typechain";

describe("Ethereum Cauldron Fee Withdrawer", async () => {
  let snapshotId;
  let Withdrawer: EthereumWithdrawer;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 13690780,
          },
        },
      ],
    });

    await deployments.fixture(["EthereumWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Withdrawer = await ethers.getContract<EthereumWithdrawer>("EthereumWithdrawer");
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should ...", async () => {
    console.log(Withdrawer.address);
  });
});
