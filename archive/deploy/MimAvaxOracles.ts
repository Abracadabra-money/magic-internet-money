import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimAvaxSLPProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("MimAvaxOracleV1", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const MimAvaxOracle = await ethers.getContract<AggregatorV3Interface>("MimAvaxOracleV1");

  await deploy("MimAvaxSLPChainlinkOracleV1", {
    from: deployer,
    args: [
      "0xcBb424fd93cDeC0EF330d8A8C985E8b147F62339", // SLP MIM/Avax
      MimAvaxOracle.address,
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracleV1 = await ethers.getContract<IAggregator>("MimAvaxSLPChainlinkOracleV1");

  await deploy("MimAvaxSLPOracle", {
    from: deployer,
    args: [LPChainlinkOracleV1.address, "SLP MIM/AVAX"],
    log: true,
    contract: "AvaxLPOracle",
    deterministicDeployment: false,
  });

  const MimAvaxLPOracle = await ethers.getContract<AvaxLPOracle>("MimAvaxSLPOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("MimAvaxSLPProxyOracle");
  if ((await ProxyOracle.oracleImplementation()) !== MimAvaxLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(MimAvaxLPOracle.address);
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

deployFunction.tags = ["MimAvaxOracles"];
deployFunction.dependencies = [];
