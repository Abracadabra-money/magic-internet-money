import { HardhatRuntimeEnvironment } from "hardhat/types";
 import { DeployFunction } from "hardhat-deploy/types";
 import { ethers, network } from "hardhat";
 import { ChainId } from "../utilities";
 import { expect } from "chai";
 import { DegenBox, ProxyOracle } from "../typechain";
 // List of supported chains to deploy on
 const supportedChains = [ChainId.Avalanche];
 
 export const ParametersPerChain = {
   [ChainId.Avalanche]: {
     degenBox: "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4",
     CauldronV2MultiChain: "0xfe0f13fD5f928539C5bc377c8200a699FC95Ca02",
     collateral: "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1", // USDC.e/WAVAX jLP
     oracle: "0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85", // reusing existing Joe USDC/WAVAX jLP oracle
     oracleData: "0x0000000000000000000000000000000000000000"
   },
 };
 
 const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
   const { deployments, getNamedAccounts } = hre;
   const { deploy } = deployments;
 
   const { deployer } = await getNamedAccounts();
   const chainId = await hre.getChainId();
   const parameters = ParametersPerChain[parseInt(chainId)];
 
   const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
   const OPENING_CONVERSION = 1e5 / 100;
 
   const maximumCollateralRatio = 85 * 1e3; // 85% LTV
   const liquidationFee = 8.0 * 1e3 + 1e5; // 8% liquidation fee
   const borrowFee = 1.0 * OPENING_CONVERSION; // 1% borrow fee
   const interest = parseInt(String(1.5 * INTEREST_CONVERSION)); // 1.5% Interest
 
   // Cauldron
   const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
   const ProxyOracle = await ethers.getContractAt<ProxyOracle>("ProxyOracle", parameters.oracle);
 
   let initData = ethers.utils.defaultAbiCoder.encode(
     ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
     [parameters.collateral, ProxyOracle.address, parameters.oracleData, interest, liquidationFee, maximumCollateralRatio, borrowFee]
   );
   
   const tx = await (await DegenBox.deploy(parameters.CauldronV2MultiChain, initData, true)).wait();

   const deployEvent = tx?.events?.[0];
   expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");
 
   // Register the deployment so it's available within the test using `getContract`
   deployments.save("PopsicleUsdcAvaxCauldron", {
     abi: require("../abi/CauldronV2MultiChain.json"),
     address: deployEvent?.args?.cloneAddress,
   });
 
   // Liquidation Swapper
   await deploy("PopsicleUsdcAvaxSwapper", {
     from: deployer,
     args: [parameters.degenBox],
     log: true,
     contract: "UsdcAvaxSwapper",
     deterministicDeployment: false,
   });
 
   // Leverage Swapper
   await deploy("PopsicleUsdcAvaxLevSwapper", {
     from: deployer,
     args: [parameters.degenBox],
     log: true,
     contract: "UsdcAvaxLevSwapper",
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
 
 deployFunction.tags = ["PopsicleUsdcWavax"];
 deployFunction.dependencies = [];