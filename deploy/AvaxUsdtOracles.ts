import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { AggregatorV3Interface, AvaxLPOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("AvaxUsdtProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("AvaxUsdtOracleV1", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const AvaxUsdtOracle = await ethers.getContract<AggregatorV3Interface>("AvaxUsdtOracleV1");

  await deploy("AvaxUsdtLPChainlinkOracleV1", {
    from: deployer,
    args: [
      "0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256", // Trader Joe Avax/USDT
      AvaxUsdtOracle.address,
    ],
    contract: "LPChainlinkOracleV1",
    log: true,
    deterministicDeployment: false,
  });

  const LPChainlinkOracleV1 = await ethers.getContract<IAggregator>("AvaxUsdtLPChainlinkOracleV1");

  await deploy("AvaxUsdtLPOracle", {
    from: deployer,
    args: [LPChainlinkOracleV1.address, "LP AVAX/USDT"],
    log: true,
    contract: "AvaxLPOracle",
    deterministicDeployment: false,
  });

  const AvaxUsdtLPOracle = await ethers.getContract<AvaxLPOracle>("AvaxUsdtLPOracle");
  const ProxyOracle = await ethers.getContract<ProxyOracle>("AvaxUsdtProxyOracle");
  await ProxyOracle.changeOracleImplementation(AvaxUsdtLPOracle.address);
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

deployFunction.tags = ["AvaxUsdtOracles"];
deployFunction.dependencies = [];
