/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ProxyOracle, UsdcAvaxLevSwapper, UsdcAvaxSwapper } from "../typechain";
import { expect } from "chai";

describe("Pangolin USCD.e/Wavax LP Oracle", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let ProxyOracle: ProxyOracle;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 11939561,
          },
        },
      ],
    });
    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["PangolingUsdceWavaxOracle"]);
    ProxyOracle = await ethers.getContract<ProxyOracle>("PangolingUsdceWavaxProxyOracle");
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should report the right lp price", async () => {
    const spot = await ProxyOracle.peekSpot("0x");
    const lpPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
    console.log(`1 LP = $${lpPrice} usd`);
    console.log("spot: ", spot.toString());
    expect(spot).to.be.eq(0);
  });
});
