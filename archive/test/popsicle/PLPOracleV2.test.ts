/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { ProxyOracle } from "../typechain";
import { xMerlin } from "./constants";

// Top holders at the given fork block
const MIM_WHALE = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const USDC_WETH_WHALE = "0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0";

describe("Oracle fix", async () => {
  it("should fix the oracle price", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 13779040,
          },
        },
      ],
    });

    const { deployer } = await getNamedAccounts();
    const deployerSigner = await ethers.getSigner(deployer);

    let ProxyOracle = await ethers.getContractAt<ProxyOracle>("ProxyOracle", "0x52B2773FB2f69d565C651d364f0AA95eBED097E4");
    await deployments.fixture(["PLPOracleV2"]);

    let PopsicleUSDCWETHOracle = await ethers.getContract<ProxyOracle>("PopsicleUSDCWETHOracle");

    await impersonate(xMerlin);
    const merlinSigner = await ethers.getSigner(xMerlin);
    await ProxyOracle.connect(merlinSigner).changeOracleImplementation(PopsicleUSDCWETHOracle.address);

    const price = await ProxyOracle.peekSpot(ethers.constants.HashZero);

    console.log(price.toString());
  });
});
