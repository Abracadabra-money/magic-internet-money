import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { mSpellSenderManual, MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const mspellAddress = {"1": "0xbD2fBaf2dc95bD78Cf1cD3c5235B33D1165E6797", "43114": "0xBd84472B31d947314fDFa2ea42460A2727F955Af", "250": "0xa668762fb20bcd7148Db1bdb402ec06Eb6DAD569", "42161": "0x1DF188958A8674B5177f77667b8D173c3CdD9e51"}
const lz = {"1": "1", "43114": "6", "250": "12", "42161": "10"}
const reporterAddress = {} // {"250": "0x41A37655A7aFB85787bD60A9fA750225567da186", "43114": "0xf8beb5c479a9b58f581076697bbce83baade90c7","42161": "0xef9c97E356bc5fF2460E25f40f608101CE15d70b"}

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("mSpellSenderManual", {
    from: deployer,
    args: [],
    log: true,
    contract: "mSpellSenderManual",
    deterministicDeployment: false,
  });

  const mspellSender = await ethers.getContract<mSpellSenderManual>("mSpellSenderManual");

  for(let i in allowedChainArray) {
    const activeStatus = await mspellSender.isActiveChain(lz[allowedChainArray[i]])
    if(Array.isArray(activeStatus) && activeStatus[0] != 1) {
      //const mspell = await ethers.getContract<MSpellStaking>(ChainName[allowedChainArray[i]] + "mSpellStaking");
      const address = mspellAddress[allowedChainArray[i]]
      await mspellSender.addMSpellRecipient(address, allowedChainArray[i], lz[allowedChainArray[i]])
    }

    if(allowedChainArray[i] != "1" && reporterAddress[allowedChainArray[i]] && (await mspellSender.mSpellReporter(lz[allowedChainArray[i]])) !== reporterAddress[allowedChainArray[i]]) {
      await mspellSender.addReporter(reporterAddress[allowedChainArray[i]], lz[allowedChainArray[i]])
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
  } catch (error) {
    console.error(error)
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
