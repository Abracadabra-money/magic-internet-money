import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { BentoBoxV1, PopsicleUSDCWETHOracle, ProxyOracle } from "../typechain";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

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

  // Proxy Oracle
  await deploy("PopsicleUSDCWETHProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Oracle Implementation
  await deploy("PopsicleUSDCWETHOracle", {
    from: deployer,
    args: [parameters.usdcWethPlp],
    log: true,
    deterministicDeployment: false,
  });

  // Cauldron
  const DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", parameters.degenBox);
  const PopsicleUSDCWETHProxyOracle = await ethers.getContract<ProxyOracle>("PopsicleUSDCWETHProxyOracle");

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  // 85% LTV .5% initial 3% Interest
  const collateralization = 85 * 1e3; // 85% LTV
  const opening = 0.5 * OPENING_CONVERSION; // .5% initial
  const interest = parseInt(String(3 * INTEREST_CONVERSION)); // 3% Interest
  const liquidation = 8 * 1e3 + 1e5;

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [parameters.usdcWethPlp, PopsicleUSDCWETHProxyOracle.address, parameters.oracleData, interest, liquidation, collateralization, opening]
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
    args: [parameters.usdcWethPlp],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await deploy("PopsicleUSDCWETHLevSwapper", {
    from: deployer,
    args: [parameters.usdcWethPlp],
    log: true,
    deterministicDeployment: false,
  });


  const PopsicleUSDCWETHOracle = await ethers.getContract<PopsicleUSDCWETHOracle>("PopsicleUSDCWETHOracle");
  if ((await PopsicleUSDCWETHProxyOracle.oracleImplementation()) !== PopsicleUSDCWETHOracle.address) {
    await PopsicleUSDCWETHProxyOracle.changeOracleImplementation(PopsicleUSDCWETHOracle.address);
  }
  if ((await PopsicleUSDCWETHProxyOracle.owner()) !== xMerlin) {
    await PopsicleUSDCWETHProxyOracle.transferOwnership(xMerlin, true, false);
  }
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
