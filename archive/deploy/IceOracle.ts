import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { WethOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("IceProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("ICEOracleFTM", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const ICEOracle = await ethers.getContract<WethOracle>("ICEOracleFTM");


  const ProxyOracle = await ethers.getContract<ProxyOracle>("IceProxyOracle");

  if ((await ProxyOracle.oracleImplementation()) !== ICEOracle.address) {
    await ProxyOracle.changeOracleImplementation(ICEOracle.address);
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

deployFunction.tags = ["IceOracleFTM"];
deployFunction.dependencies = [];
