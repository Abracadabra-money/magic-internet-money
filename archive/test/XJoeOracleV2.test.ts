/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, CauldronV2, IERC20, XJoeLevSwapper, XJoeSwapper } from "../typechain";
import { expect } from "chai";
import { XJoeOracle } from "../typechain";

describe("xJoe Oracle", async () => {
  let snapshotId;
  let XJoeOracle: XJoeOracle;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 6432651,
          },
        },
      ],
    });

    await deployments.fixture(["XJoeOracle"]);
    XJoeOracle = await ethers.getContract<XJoeOracle>("XJoeOracle");

    const { deployer, alice } = await getNamedAccounts();

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should get xJOE USD price", async () => {
    const data = await XJoeOracle.peek("0x");
    console.log(data[0], data[1].toString());
  })
});
