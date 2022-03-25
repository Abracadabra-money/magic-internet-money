import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("PangolingUsdceWavaxProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("PangolinUsdceWavaxLPChainlinkOracle", {
    from: deployer,
    args: [
      "0xbd918Ed441767fe7924e99F6a0E0B568ac1970D9", // Pangolin USDC.e/WAVAX
      "0x471EE749bA270eb4c1165B5AD95E614947f6fCeb", // Generic UsdcAvaxOracleV1
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracle = await ethers.getContract<IAggregator>("PangolinUsdceWavaxLPChainlinkOracle");

  await deploy("PangolingUsdceWavaxLPOracle", {
    from: deployer,
    args: [LPChainlinkOracle.address, "Pangolin USDC.e/WAVAX"],
    log: true,
    contract: "AvaxLPOracle",
    deterministicDeployment: false,
  });

  const PangolingUsdceWavaxLPOracle = await ethers.getContract<AvaxLPOracle>("PangolingUsdceWavaxLPOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("PangolingUsdceWavaxProxyOracle");

  if ((await ProxyOracle.oracleImplementation()) !== PangolingUsdceWavaxLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(PangolingUsdceWavaxLPOracle.address);
  }
  if ((await ProxyOracle.owner()) !== xMerlin) {
    await ProxyOracle.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

if (network.name !== "hardhat") {
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

deployFunction.tags = ["PangolingUsdceWavaxOracle"];
deployFunction.dependencies = [];
