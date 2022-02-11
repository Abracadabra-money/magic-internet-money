import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../../../utilities";
import {CauldronV2Multichain, DegenBox } from "../../../typechain";

const supportedChains = [ChainId.Avalanche];

export const ParametersPerChain = {
  [ChainId.Avalanche]: {
    degenBox: "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4",
    MIM: "0x130966628846BFd36ff31a822705796e8cb8C18D",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("PopsicleCauldronV2MultiChain", {
    from: deployer,
    args: [parameters.degenBox, parameters.MIM],
    log: true,
    contract: "CauldronV2Multichain",
    deterministicDeployment: false,
  });

  const MasterContract = await ethers.getContract<CauldronV2Multichain>("PopsicleCauldronV2MultiChain");
  await MasterContract.setFeeTo(deployer);

  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
  await DegenBox.whitelistMasterContract(MasterContract.address, true);
};

export default deployFunction;

if (network.name !== "hardhat") {
  deployFunction.skip = ({ getChainId }) =>
    new Promise(async (resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(supportedChains.indexOf(parseInt(chainId)) === -1);
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["PopsicleCauldronV2MasterContract"];
deployFunction.dependencies = [];
