import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimAvaxSLPSwapper", {
    from: deployer,
    args: [],
    log: true,
    contract: "MimAvaxSwapper",
    deterministicDeployment: false,
  });

  await deploy("MimAvaxSLPLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    contract: "MimAvaxLevSwapper",
    deterministicDeployment: false,
  });
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

deployFunction.tags = ["MimAvaxSwappers"];
deployFunction.dependencies = [];
