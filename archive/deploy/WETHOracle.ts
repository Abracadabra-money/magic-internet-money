import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { WethOracle, IAggregator, ProxyOracle } from "../typechain";
import { xMerlin } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("WethProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  await deploy("WethOracle", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const WETHOracle = await ethers.getContract<WethOracle>("WethOracle");


  const ProxyOracle = await ethers.getContract<ProxyOracle>("WethProxyOracle");

  if ((await ProxyOracle.oracleImplementation()) !== WETHOracle.address) {
    await ProxyOracle.changeOracleImplementation(WETHOracle.address);
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
          resolve(chainId !== "1");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["WethOracle"];
deployFunction.dependencies = [];
