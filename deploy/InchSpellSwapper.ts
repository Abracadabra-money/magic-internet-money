import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { InchSpellSwapper } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "11"]
const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("InchSpellSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const swapper = await ethers.getContract<InchSpellSwapper>("InchSpellSwapper");

  if ((await swapper.owner()) !== xMerlin) {
    await swapper.transferOwnership(xMerlin, true, false);
  } 
  try {
    await hre.run("verify:verify", {
      address: swapper.address,
      constructorArguments: []
    });
  } catch (error){
    console.error(error)
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

deployFunction.tags = ["mSpell"];
deployFunction.dependencies = [];
