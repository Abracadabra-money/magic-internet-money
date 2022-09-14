import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellSender, MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const mspellAddress = {"1": "0xbD2fBaf2dc95bD78Cf1cD3c5235B33D1165E6797", "43114": "0xBd84472B31d947314fDFa2ea42460A2727F955Af", "250": "0xa668762fb20bcd7148Db1bdb402ec06Eb6DAD569", "42161": "0x1DF188958A8674B5177f77667b8D173c3CdD9e51"}
const lz = {"1": "1", "43114": "106", "250": "112", "42161": "110"}
const reporterAddress = {"250": "0x96BAC90beE7F416d33601D1DC45Efb19Aca8CA62", "43114": "0x78A538Cf4c73DbA3794c0385d28758Fed517CCcF","42161": "0x20CB52832F35C61CCdBe5c336e405FE979de9430"}

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
    const activeStatus = await mspellSender.isActiveChain(lz[allowedChainArray[i]])
    if(Array.isArray(activeStatus) && activeStatus[0] != 1) {
      //const mspell = await ethers.getContract<MSpellStaking>(ChainName[allowedChainArray[i]] + "mSpellStaking");
      const address = mspellAddress[allowedChainArray[i]]
      await mspellSender.addMSpellRecipient(address, allowedChainArray[i], lz[allowedChainArray[i]])
    }
    let trustedRemote = allowedChainArray[i] != "1" ? hre.ethers.utils.solidityPack(['address','address'],[reporterAddress[allowedChainArray[i]], mspellSender.address]) : "";
    
    if(allowedChainArray[i] != "1" && reporterAddress[allowedChainArray[i]] && (await mspellSender.mSpellReporter(lz[allowedChainArray[i]])) !== trustedRemote) {
      await mspellSender.addReporter(trustedRemote, lz[allowedChainArray[i]])
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
