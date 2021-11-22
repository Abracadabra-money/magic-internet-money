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

  const getDeployment = async (name: string) => {
    try {
      return (await deployments.get(name)).address
    } catch {
      return undefined
    }
  }

  // Deploy Cake Cauldron using DegenBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted 
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x090185f2135308bad17527004364ebcc2d37e5f6");
  const CauldronV2MasterContract = "0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9"; // CauldronV2

  const collateral = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"; // CAKE
  const oracle = "0x35F78eBb33B69d0006910913480F483271638053"; // Cake oracle 
  const oracleData = "0x0000000000000000000000000000000000000000";

    //let oracle = "0x2Be431EE7E74b1CB7CfA16Fc90578EF42eF361B0"
  let INTEREST_CONVERSION = 1e18/(365.25*3600*24)/100
  let interest = parseInt(String(3 * INTEREST_CONVERSION))
  const OPENING_CONVERSION = 1e5/100
  const opening = 0.5 * OPENING_CONVERSION
  const liquidation = 12.5 * 1e3+1e5
  const collateralization = 75 * 1e3

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle, oracleData, interest, liquidation, collateralization, opening]
  );
  
  const cauldronAddress = await getDeployment("CakeCauldron")

  if(cauldronAddress === undefined) {
    const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    deployments.save("CakeCauldron", {
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
          resolve(chainId !== "56");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["CakeCauldron"];
deployFunction.dependencies = [];
