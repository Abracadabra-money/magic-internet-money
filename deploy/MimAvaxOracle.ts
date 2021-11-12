import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimAvaxProxyOracle", {
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

  await deploy("MimAvaxLPChainlinkOracleV1", {
    from: deployer,
    args: [
      "0x781655d802670bbA3c89aeBaaEa59D3182fD755D", // Trader Joe MIM/Avax
      MimAvaxOracle.address,
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracleV1 = await ethers.getContract<IAggregator>("MimAvaxLPChainlinkOracleV1");

  await deploy("MimAvaxLPOracle", {
    from: deployer,
    args: [LPChainlinkOracleV1.address, "LP AVAX/USDT"],
    log: true,
    contract: "AvaxLPOracle",
    deterministicDeployment: false,
  });

  const MimAvaxLPOracle = await ethers.getContract<AvaxLPOracle>("MimAvaxLPOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("MimAvaxProxyOracle");
  await ProxyOracle.changeOracleImplementation(MimAvaxLPOracle.address);
  await ProxyOracle.transferOwnership(xMerlin, true, false);
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
