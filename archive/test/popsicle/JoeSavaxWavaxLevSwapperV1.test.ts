/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { SwapperTesterV2, ZeroXUniswapLikeLPLevSwapper } from "../typechain";
import { ChainId, impersonate } from "../utilities";
import { xCalibur } from "./constants";

const maybe = process.env.ETHEREUM_RPC_URL || process.env.INFURA_API_KEY ? describe : describe.skip;

maybe("Test LevSwapper", async () => {
  let snapshotId;
  let LevSwapper: ZeroXUniswapLikeLPLevSwapper;
  let SwapperTesterV2: SwapperTesterV2;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 15630105,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["ZeroXUniswapLikeLPLevSwapper"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    LevSwapper = await ethers.getContract<ZeroXUniswapLikeLPLevSwapper>("JoeSavaxWavaxLevSwapperV1");
    SwapperTesterV2 = await ethers.getContractAt<SwapperTesterV2>("SwapperTesterV2", "0x0C963A595AFb4609c5cc6BB0A9daD01925b91886");

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("test lev swapper", async () => {
    await impersonate(xCalibur);
    const xCaliburSigner = await ethers.getSigner(xCalibur);

    await SwapperTesterV2.connect(xCaliburSigner).testLeveraging(
      "0xd825d06061fdc0585e4373f0a3f01a8c02b0e6a4",
      LevSwapper.address,
      "0x4b946c91c2b1a7d7c40fb3c130cdfbaf8389094d",
      "20000000000000000000",
      "395661840680362669",
      "enter data from 0x-leverage-tester"
    );
  });
});
