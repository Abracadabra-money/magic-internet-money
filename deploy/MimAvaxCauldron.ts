import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { BentoBoxV1, CauldronV2 } from "../typechain";
import { DeploymentSubmission } from "hardhat-deploy/dist/types";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const getDeployment = async (name: string) => {
    try {
      return (await deployments.get(name)).address;
    } catch {
      return undefined;
    }
  };

  // Deploy xJoe Cauldron using BentoBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
  const CauldronV2MasterContract = "0x02E07B6F27E5eC37CA6E9f846b6D48704031625A"; // CauldronV2
  const collateral = "0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256"; // AVAX/USDT
  const oracle = "0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85"; // USDC/AVAX proxy oracle
  const oracleData = "0x0000000000000000000000000000000000000000";

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  // 85% LTV .5% initial 1% Interest
  const collateralization = 85 * 1e3; // 85% LTV
  const opening = 0.5 * OPENING_CONVERSION; // .5% initial
  const interest = parseInt(String(1 * INTEREST_CONVERSION)); // 1% Interest
  const liquidation = 8 * 1e3 + 1e5;

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle, oracleData, interest, liquidation, collateralization, opening]
  );

  const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  deployments.save("MimUsdtCauldron", {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });

  if(network.name !== "hardhat") {
    const MimUsdtCauldron = await ethers.getContract<CauldronV2>("MimUsdtCauldron");
    await MimUsdtCauldron.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(chainId !== "43114");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["AvaxUsdtCauldron"];
deployFunction.dependencies = [];
