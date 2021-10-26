import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  if (network.name === "hardhat") {
  }

  /*await deploy("UsdcAvaxSwapper", {
    from: deployer,
    args: [ethers.constants.AddressZero], // TODO: Replace with curve 3pool
    log: true,
    deterministicDeployment: false,
  });

    await deploy("UsdcAvaxLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });*/
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

deployFunction.tags = ["UsdcAvaxSwappers"];
deployFunction.dependencies = [];
