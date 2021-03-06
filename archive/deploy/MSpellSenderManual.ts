import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellSenderManual, MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const mspellAddress = {"1": "0xbD2fBaf2dc95bD78Cf1cD3c5235B33D1165E6797", "43114": "0xBd84472B31d947314fDFa2ea42460A2727F955Af", "250": "0xa668762fb20bcd7148Db1bdb402ec06Eb6DAD569", "42161": "0x1DF188958A8674B5177f77667b8D173c3CdD9e51"}
const lz = {"1": "1", "43114": "6", "250": "12", "42161": "10"}
const reporterAddress = {"250": "0xf8beb5c479a9B58F581076697BBCE83bAADE90C7", "43114": "0x96BAC90beE7F416d33601D1DC45Efb19Aca8CA62","42161": "0xf33Eb640773827AFBbB886Fa2d60B071d51D2D85"}

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

  const mspellSender = await ethers.getContract<MSpellSenderManual>("mSpellSenderManual");

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
