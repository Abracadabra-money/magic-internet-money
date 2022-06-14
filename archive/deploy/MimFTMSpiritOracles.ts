import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimFTMSpiritProxyOracle", {
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

  await deploy("MimFTMSpiritChainlinkOracleV1", {
    from: deployer,
    args: [
      "0xB32b31DfAfbD53E310390F641C7119b5B9Ea0488", // Spirit MIM/FTM
      MimFTMOracle.address,
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracleV1 = await ethers.getContract<IAggregator>("MimFTMSpiritChainlinkOracleV1");

  await deploy("MimFTMSpiritOracle", {
    from: deployer,
    args: [LPChainlinkOracleV1.address, "Spirit MIM/FTM"],
    log: true,
    contract: "FtmLPOracle",
    deterministicDeployment: false,
  });

  const MimFTMLPOracle = await ethers.getContract<AvaxLPOracle>("MimFTMSpiritOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("MimFTMSpiritProxyOracle");
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

deployFunction.tags = ["MimFTMSpiritOracles"];
deployFunction.dependencies = [];
