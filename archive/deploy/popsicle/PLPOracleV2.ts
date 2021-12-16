import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { expect } from "chai";
import { xMerlin } from "../test/constants";
import { PopsicleUSDCWETHOracle, ProxyOracle } from "../typechain";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV2MasterContract: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F",
    usdcWethPlp: "0xaE7b92C8B14E7bdB523408aE0A6fFbf3f589adD9",
    oracleData: "0x0000000000000000000000000000000000000000",
  },
  [ChainId.Fantom]: {
    degenBox: "",
    cauldronV2MasterContract: "",
    usdcWethPlp: "",
    oracleData: "0x0000000000000000000000000000000000000000",
  },
  [ChainId.BSC]: {
    degenBox: "",
    cauldronV2MasterContract: "",
    usdcWethPlp: "",
    oracleData: "0x0000000000000000000000000000000000000000",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Oracle Implementation
  await deploy("PopsicleUSDCWETHOracle", {
    from: deployer,
    args: [parameters.usdcWethPlp],
    log: true,
    deterministicDeployment: false,
  });
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

deployFunction.tags = ["PLPOracleV2"];
deployFunction.dependencies = [];
