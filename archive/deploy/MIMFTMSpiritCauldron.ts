import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { BentoBoxV1, CauldronV2, ProxyOracle } from "../typechain";
import { DeploymentSubmission } from "hardhat-deploy/dist/types";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616");
  const CauldronV2MasterContract = "0xb6cE2d48CC599a4162937538cAEBAb1Ba1c9579C"; // CauldronV2
  const collateral = "0xB32b31DfAfbD53E310390F641C7119b5B9Ea0488"; // MIM/FTM
  const oracleProxy = await ethers.getContract<ProxyOracle>("MimFTMSpiritProxyOracle");
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
    [collateral, oracleProxy.address, oracleData, interest, liquidation, collateralization, opening]
  );

  const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  deployments.save("MimFtmSpiritCauldron", {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });
};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(chainId !== "250");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["MimFtmSpiritCauldron"];
deployFunction.dependencies = ["MimFTMSpiritOracles", "MimFtmSwappers"];
