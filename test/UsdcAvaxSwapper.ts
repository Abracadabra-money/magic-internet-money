/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";

import { advanceTime, getBigNumber, impersonate } from "../utilities";
import { UsdcAvaxSwapper } from "../typechain";

describe("Lev/Liquidation UsdcAvax Swappers", async () => {
  let snapshotId;
  let UsdcAvaxSwapper: UsdcAvaxSwapper;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 5886381,
          },
        },
      ],
    });

    await deployments.fixture(["UsdcAvaxSwappers"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    UsdcAvaxSwapper = await ethers.getContract<UsdcAvaxSwapper>("UsdcAvaxSwapper");

    // More operations here...

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should ...", async () => {
    
  });
});
