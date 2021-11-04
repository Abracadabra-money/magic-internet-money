import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { BentoBoxV1, PopsicleUSDCWETHOracle, PopsicleV3Optimizer } from "../typechain";
import { expect } from "chai";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV2MasterContract: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F",
    usdcWethPlp: "",
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

  // TODO: Remove this deployment and use existing deployed PopsicleV3Optimizer prod version.
  // Current PopsicleV3Optimizer deployed on mainnet is a buggy version.
  // Deploy the latest code here. 
  await deploy("PopsicleV3Optimizer", {
    from: deployer,
    args: ["0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", "0x0982e03a4cd1c89b52afd91b50638213a2628864"],
    log: true,
    deterministicDeployment: false,
  });
  const PopsicleV3Optimizer = await ethers.getContract<PopsicleV3Optimizer>("PopsicleV3Optimizer");
  await PopsicleV3Optimizer.init();
  
  // Oracle
  await deploy("PopsicleUSDCWETHOracle", {
    from: deployer,
    args: [PopsicleV3Optimizer.address],
    log: true,
    deterministicDeployment: false,
  });

  // Cauldron
  const DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", parameters.degenBox);
  const Oracle = await ethers.getContract<PopsicleUSDCWETHOracle>("PopsicleUSDCWETHOracle");

  // TODO: Change before deployment
  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;
  const interest = parseInt(String(3 * INTEREST_CONVERSION));
  const liquidation = 5 * 1e3 + 1e5;
  const collateralization = 75 * 1e3;
  const opening = 0.5 * OPENING_CONVERSION;

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [PopsicleV3Optimizer.address, Oracle.address, parameters.oracleData, interest, liquidation, collateralization, opening]
  );
  const tx = await (await DegenBox.deploy(parameters.cauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save("PopsicleUSDCWETHCauldron", {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });

  // Liquidation Swapper
  await deploy("PopsicleUSDCWETHSwapper", {
    from: deployer,

    // TODO: Change to deployed PopsicleV3Optimizer address.
    args: [PopsicleV3Optimizer.address],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  /*await deploy("PopsicleUSDCWETHLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });*/
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
