import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import {MimFtmLevSwapper, MimFtmSwapper} from "../typechain";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("MimFTMSpookySwapper", {
    from: deployer,
    args: [],
    log: true,
    contract: "MimFtmSwapper",
    deterministicDeployment: false,
  });

  await deploy("MimFtmSpookyLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    contract: "MimFtmLevSwapper",
    deterministicDeployment: false,
  });

  const levSwapper = await ethers.getContract<MimFtmLevSwapper>("MimFtmSpookyLevSwapper");
  const swapper = await ethers.getContract<MimFtmSwapper>("MimFTMSpookySwapper");

  try{
    await hre.run("verify:verify", {
      address: levSwapper.address,
      constructorArguments: []
    });
  } catch {

  }
  try {
    await hre.run("verify:verify", {
      address: swapper.address,
      constructorArguments: []
    });
  } catch {

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

deployFunction.tags = ["MimFtmSpookySwappers"];
deployFunction.dependencies = [];
