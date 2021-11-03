import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

const parameters = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV2MasterContract: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F"
  },
  [ChainId.Fantom]: {
    degenBox: "",
    cauldronV2MasterContract: ""
  },
  [ChainId.BSC]: {
    degenBox: "",
    cauldronV2MasterContract: ""
  }
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = supportedChains[chainId];

  // Oracle
  await deploy("PopsicleUSDCWETHOracle", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  // Cauldron

  // Liquidation Swapper

  // Leverage Swapper
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

deployFunction.tags = ["PopsicleUSDCWETH"];
deployFunction.dependencies = [];
