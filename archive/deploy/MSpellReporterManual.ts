import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainName, MimAddresses, SpellAddresses } from "../utilities";
import { MSpellStaking, MSpellReporterManual } from "../typechain";
import { xMerlin } from "../test/constants";

const endpoints = {
  "1": "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675",
  "43114": "0x3c2269811836af69497E5F486A85D7316753cf62",
  "250": "0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7",
  "42161": "0x3c2269811836af69497E5F486A85D7316753cf62"
}

const mSpellSender = "0xFc2796c47063D6FCb98006081778c7b45b13A4c0"
const allowedChainArray = [ "43114", "250", "42161"]
const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const chainId = await getChainId();
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const mspell = await ethers.getContract<MSpellStaking>(ChainName[chainId] + "mSpellStaking");

  await deploy(ChainName[chainId] + "-mSpellReporterManual", {
    from: deployer,
    args: [endpoints[chainId], SpellAddresses[chainId], mspell.address, mSpellSender],
    log: true,
    gasPrice: "6000000000000",
    contract: "mSpellReporterManual",
    deterministicDeployment: false,
  });

  const mspellReporter = await ethers.getContract<MSpellReporterManual>(ChainName[chainId] + "-mSpellReporterManual");

  if (network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: mspellReporter.address,
        constructorArguments: [endpoints[chainId], SpellAddresses[chainId], mspell.address, mSpellSender]
      });
    } catch (error) {
      console.error(error)
    }
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

deployFunction.tags = ["mSpellReporter"];
deployFunction.dependencies = [];