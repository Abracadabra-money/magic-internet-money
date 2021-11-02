import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { BentoBoxV1 } from "../typechain";
import { DeploymentSubmission } from "hardhat-deploy/dist/types";
import { expect } from "chai";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Deploy xJoe Cauldron using BentoBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
  const CauldronV2MasterContract = "0x02E07B6F27E5eC37CA6E9f846b6D48704031625A"; // CauldronV2

  const collateral = "0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33"; // xJoe
  const oracle = "0x59B3D5dDf93A3782F7B7A4bE1214722fc6Fecd45"; // xJoeOracle proxy oracle 
  const oracleData = "0x0000000000000000000000000000000000000000";

    //let oracle = "0x2Be431EE7E74b1CB7CfA16Fc90578EF42eF361B0"
  let INTEREST_CONVERSION = 1e18/(365.25*3600*24)/100
  let interest = parseInt(String(3 * INTEREST_CONVERSION))
  const OPENING_CONVERSION = 1e5/100
  const opening = 0.5 * OPENING_CONVERSION
  const liquidation = 5 * 1e3+1e5
  const collateralization = 75 * 1e3

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle, oracleData, interest, liquidation, collateralization, opening]
  );
  const getDeployment = async () => {
    try {
      return (await deployments.get("JoeBarCauldron")).address
    } catch {
      return undefined
    }
  }
  const cauldronAddress = await getDeployment()

  if(cauldronAddress === undefined) {
    const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    deployments.save("JoeBarCauldron", {
      abi: [],
      address: deployEvent?.args?.cloneAddress,
    });
    
  }

  await deploy("XJoeSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  await deploy("XJoeLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(chainId !== "43114");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["JoeBarCauldron"];
deployFunction.dependencies = [];
