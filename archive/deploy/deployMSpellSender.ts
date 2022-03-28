import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellSender, MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const mspellAddress = {"1": "0x94635B2034cCEc3293b81D411Cd77C36c353f41d", "43114": "0xC1f1862dE85374378173566a8F3BE28DA3c3EC70", "250": "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce", "42161": "0x694808221d4F31d5849F2aBA08584E2C8f4b99ff"}
const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("mSpellSender", {
    from: deployer,
    args: [],
    log: true,
    contract: "mSpellSender",
    deterministicDeployment: false,
  });

  const mspellSender = await ethers.getContract<MSpellSender>("mSpellSender");

  for(let i in allowedChainArray) {
    if((await mspellSender.isActiveChain(allowedChainArray[i])) !== true) {
      //const mspell = await ethers.getContract<MSpellStaking>(ChainName[allowedChainArray[i]] + "mSpellStaking");
      const address = mspellAddress[allowedChainArray[i]]
      await mspellSender.addMSpellRecipient(address, allowedChainArray[i])
    }
  }

  if ((await mspellSender.owner()) !== xMerlin) {
    await mspellSender.transferOwnership(xMerlin, true, false);
  } 
  try {
    await hre.run("verify:verify", {
      address: mspellSender.address,
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
          resolve(chainId !== "1");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["mSpellSender"];
deployFunction.dependencies = ["mSpell"];
