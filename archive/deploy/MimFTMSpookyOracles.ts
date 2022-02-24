import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimFTMSpookyProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("MimFTMOracleV1", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const MimFTMOracle = await ethers.getContract<AggregatorV3Interface>("MimFTMOracleV1");

  await deploy("MimFTMSpookyChainlinkOracleV1", {
    from: deployer,
    args: [
      "0x6f86e65b255c9111109d2D2325ca2dFc82456efc", // Spooky MIM/FTM
      MimFTMOracle.address,
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracleV1 = await ethers.getContract<IAggregator>("MimFTMSpookyChainlinkOracleV1");

  await deploy("MimFTMSpookyOracle", {
    from: deployer,
    args: [LPChainlinkOracleV1.address, "Spooky MIM/FTM"],
    log: true,
    contract: "FtmLPOracle",
    deterministicDeployment: false,
  });

  const MimFTMLPOracle = await ethers.getContract<AvaxLPOracle>("MimFTMSpookyOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("MimFTMSpookyProxyOracle");
  if ((await ProxyOracle.oracleImplementation()) !== MimFTMLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(MimFTMLPOracle.address);
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
          resolve(chainId !== "250");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["MimFTMSpookyOracles"];
deployFunction.dependencies = [];
