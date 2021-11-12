/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { AvaxLPOracle, AvaxUsdtOracleV1, BentoBoxV1, CauldronV2, IAggregator, IERC20, LPChainlinkOracleV1, MimAvaxOracleV1, ProxyOracle } from "../typechain";
import { expect } from "chai";
import { xMerlin } from "./constants";

describe("Avax/USDT and MIM/Avax Oracle Deployments", async () => {
  let snapshotId;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 6809282,
          },
        },
      ],
    });

    await deployments.fixture(["AvaxUsdtOracles", "MimAvaxOracles"]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed Avax/USDT Oracles with the right parameters", async () => {
    const ProxyOracle = await ethers.getContract<ProxyOracle>("AvaxUsdtProxyOracle");
    const PriceOracleV1 = await ethers.getContract<AvaxUsdtOracleV1>("AvaxUsdtOracleV1");
    const LPChainlinkOracle = await ethers.getContract<LPChainlinkOracleV1>("AvaxUsdtLPChainlinkOracleV1");
    const LPOracle = await ethers.getContract<AvaxLPOracle>("AvaxUsdtLPOracle");

    expect(await ProxyOracle.owner()).to.equal(xMerlin);
    expect(await ProxyOracle.oracleImplementation()).to.equal(LPOracle.address);
    expect(await LPOracle.lpOracle()).to.equal(LPChainlinkOracle.address);
    expect(await LPChainlinkOracle.pair()).to.equal("0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256");
    expect(await LPChainlinkOracle.tokenOracle()).to.equal(PriceOracleV1.address);

    console.log("AvaxUsdtOracleV1: ", (await PriceOracleV1.latestRoundData()).answer.toString());
    console.log("LPChainlinkOracleV1: ", (await LPChainlinkOracle.latestAnswer()).toString());
    console.log("AvaxUsdtLPOracle: ", (await LPOracle.get(ethers.constants.HashZero)).toString());
  });

  it("should have deployed MIM/Avax Oracles with the right parameters", async () => {
    const ProxyOracle = await ethers.getContract<ProxyOracle>("MimAvaxProxyOracle");
    const PriceOracleV1 = await ethers.getContract<MimAvaxOracleV1>("MimAvaxOracleV1");
    const LPChainlinkOracle = await ethers.getContract<LPChainlinkOracleV1>("MimAvaxLPChainlinkOracleV1");
    const LPOracle = await ethers.getContract<AvaxLPOracle>("MimAvaxLPOracle");

    expect(await ProxyOracle.owner()).to.equal(xMerlin);
    expect(await ProxyOracle.oracleImplementation()).to.equal(LPOracle.address);
    expect(await LPOracle.lpOracle()).to.equal(LPChainlinkOracle.address);
    expect(await LPChainlinkOracle.pair()).to.equal("0x781655d802670bbA3c89aeBaaEa59D3182fD755D");
    expect(await LPChainlinkOracle.tokenOracle()).to.equal(PriceOracleV1.address);

    console.log("AvaxUsdtOracleV1: ", (await PriceOracleV1.latestRoundData()).answer.toString());
    console.log("LPChainlinkOracleV1: ", (await LPChainlinkOracle.latestAnswer()).toString());
    console.log("AvaxUsdtLPOracle: ", (await LPOracle.get(ethers.constants.HashZero)).toString());
  });
});
