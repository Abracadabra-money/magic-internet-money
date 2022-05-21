import { HardhatRuntimeEnvironment } from "hardhat/types";
 import { DeployFunction } from "hardhat-deploy/types";
 import { ethers, network } from "hardhat";
 import { ChainId, wrappedDeploy } from "../utilities";
 import { expect } from "chai";
 import { DegenBox, ProxyOracle } from "../typechain";
 // List of supported chains to deploy on
 const supportedChains = [ChainId.Avalanche];
 
 export const ParametersPerChain = {
   [ChainId.Avalanche]: {
     limone: "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4",
   },
 };
 
 const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
   const { deployments, getNamedAccounts } = hre;
   const { deploy } = deployments;
 
   const { deployer } = await getNamedAccounts();
   const chainId = await hre.getChainId();
   const parameters = ParametersPerChain[parseInt(chainId)];
 
   // Liquidation Swapper
   await wrappedDeploy("PopsicleUsdcAvaxSwapperV3", {
     from: deployer,
     args: [parameters.limone],
     log: true,
     contract: "UsdceAvaxSwapperV3",
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
 
 deployFunction.tags = ["PopsicleUsdceWavaxV3"];
 deployFunction.dependencies = [];