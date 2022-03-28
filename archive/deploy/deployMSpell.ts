import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy(ChainName[chainId] + "mSpellStaking", {
    from: deployer,
    args: [MimAddresses[chainId], SpellAddresses[chainId]],
    log: true,
    contract: "mSpellStaking",
    deterministicDeployment: false,
  });

  const mspell = await ethers.getContract<MSpellStaking>(ChainName[chainId] + "mSpellStaking");

  if ((await mspell.owner()) !== xMerlin) {
    await mspell.transferOwnership(xMerlin, true, false);
  } 
  try {
    await hre.run("verify:verify", {
      address: mspell.address,
      constructorArguments: [MimAddresses[chainId], SpellAddresses[chainId]]
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

deployFunction.tags = ["mSpell"];
deployFunction.dependencies = [];
