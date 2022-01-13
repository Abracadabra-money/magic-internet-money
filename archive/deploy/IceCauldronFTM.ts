import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { BentoBoxV1, ProxyOracle } from "../typechain";
import { DeploymentSubmission } from "hardhat-deploy/dist/types";
import { expect } from "chai";



const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const getDeployment = async (name: string) => {
    try {
      return (await deployments.get(name)).address
    } catch {
      return undefined
    }
  }

  // Deploy ICE cauldron using BentoBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted 
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966");
  const CauldronV2MasterContract = "0xe802823719f9d2520415854E6f95baE498FF1D52"; // CauldronV2

  const collateral = "0xf16e81dce15B08F326220742020379B855B87DF9"; // ICE
  const oracle = await ethers.getContract<ProxyOracle>("IceProxyOracle");
  const oracleData = "0x0000000000000000000000000000000000000000";

    //let oracle = "0x2Be431EE7E74b1CB7CfA16Fc90578EF42eF361B0"
  let INTEREST_CONVERSION = 1e18/(365.25*3600*24)/100
  let interest = parseInt(String(1.5 * INTEREST_CONVERSION))
  const OPENING_CONVERSION = 1e5/100
  const opening = 0.5 * OPENING_CONVERSION
  const liquidation = 8 * 1e3+1e5
  const collateralization = 75 * 1e3

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle.address, oracleData, interest, liquidation, collateralization, opening]
  );
  
  const cauldronAddress = await getDeployment("IceCauldronFTM")

  if(cauldronAddress === undefined) {
    const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    deployments.save("IceCauldronFTM", {
      abi: [],
      address: deployEvent?.args?.cloneAddress,
    });
    
  }

};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(chainId !== "250");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["IceCauldronFTM"];
deployFunction.dependencies = ["IceOracleFTM"];
