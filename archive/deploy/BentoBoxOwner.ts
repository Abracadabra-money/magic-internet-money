import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { BentoBoxOwner } from "../typechain";

const allowedChainArray = [ "1"]
const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("BentoBoxOwner", {
    from: deployer,
    args: [],
    log: true,
    contract: "BentoBoxOwner",
    deterministicDeployment: false,
  });

  const bentoBoxOwner = await ethers.getContract<BentoBoxOwner>("BentoBoxOwner");

  try {
    await hre.run("verify:verify", {
      address: bentoBoxOwner.address,
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
          resolve(!allowedChainArray.includes(chainId));
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["bentoBoxOwner"];
deployFunction.dependencies = [];
