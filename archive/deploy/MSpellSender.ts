import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellSender, MSpellStaking } from "../typechain";
import { xMerlin } from "../test/constants";

const allowedChainArray = [ "1", "43114", "250", "42161"]
const mspellAddress = {"1": "0xcDB71Cbf4F6B8dB8d13d1Be655988CBc523Bc8b1", "43114": "0xA3C8931Ec0fef9BF05386D154C4CD1e93AA92A12", "250": "0x15a2a96608b48ebfd80c31DA8a9bE340A354CD46", "42161": "0x6cc0cd7D25E291029B55C767B9A2D1d9A18Ae668"}
const lz = {"1": "1", "43114": "6", "250": "12", "42161": "10"}
const reporterAddress = {"250": "0x1085Fa0770a88a132E3b8aae21C84755d70081ce", "43114": "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F","42161": "0x7386946A2e2A8412c09a63AfA6EC047CecC0423F"}

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
