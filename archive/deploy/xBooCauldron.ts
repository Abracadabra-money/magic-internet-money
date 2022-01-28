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

  // Deploy wMEMO Cauldron using BentoBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616");
  const CauldronV2MasterContract = "0xb6cE2d48CC599a4162937538cAEBAb1Ba1c9579C"; // CauldronV2

  const collateral = "0xa48d959AE2E88f1dAA7D5F611E01908106dE7598"; //xBOO
  const oracle = await ethers.getContract<ProxyOracle>("xBooProxyOracle");
  const oracleData = "0x0000000000000000000000000000000000000000";

    //let oracle = "0x2Be431EE7E74b1CB7CfA16Fc90578EF42eF361B0"
  let INTEREST_CONVERSION = 1e18/(365.25*3600*24)/100
  let interest = parseInt(String(0.5 * INTEREST_CONVERSION))
  const OPENING_CONVERSION = 1e5/100
  const opening = 0.5 * OPENING_CONVERSION
  const liquidation = 7.5 * 1e3+1e5
  const collateralization = 85 * 1e3

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle.address, oracleData, interest, liquidation, collateralization, opening]
  );
  
  const cauldronAddress = await getDeployment("xBoo")

  if(cauldronAddress === undefined) {
    const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    deployments.save("xBoo", {
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

deployFunction.tags = ["xBooCauldron"];
deployFunction.dependencies = ["xBooOracle"];
