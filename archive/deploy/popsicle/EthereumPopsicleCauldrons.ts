import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { BentoBoxV1, ProxyOracle, PLPOracle } from "../typechain";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV2MasterContract: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F",
    oracleData: "0x0000000000000000000000000000000000000000",

    // Parameter orders is important since this is used by the test suite as well
    cauldrons: [
      // USDC/WETH 0.3%
      {
        plpAddress: "0xaE7b92C8B14E7bdB523408aE0A6fFbf3f589adD9",
        cauldronDeploymentName: "PopsicleUSDCWETHCauldron",
        proxyOracleDeploymentName: "PopsicleUSDCWETHProxyOracle",
        oracleDeploymentName: "PopsicleUSDCWETHOracle",

        swapperName: "PopsicleUSDCWETHSwapper",
        swapperDeploymentName: "PopsicleUSDCWETHSwapper03Fee",
        levSwapperName: "PopsicleUSDCWETHLevSwapper",
        levSwapperDeploymentName: "PopsicleUSDCWETHLevSwapper03Fee",
        token0Aggregator: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC
        token1Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
      },

      // WETH/USDT 0.3%
      {
        plpAddress: "0xa1BE64Bb138f2B6BCC2fBeCb14c3901b63943d0E",
        cauldronDeploymentName: "PopsicleWETHUSDTCauldron",
        proxyOracleDeploymentName: "PopsicleWETHUSDTProxyOracle",
        oracleDeploymentName: "PopsicleWETHUSDTOracle",

        swapperName: "PopsicleWETHUSDTSwapper",
        swapperDeploymentName: "PopsicleWETHUSDTSwapper03Fee",
        levSwapperName: "PopsicleWETHUSDTLevSwapper",
        levSwapperDeploymentName: "PopsicleWETHUSDTLevSwapper03Fee",
        token0Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
        token1Aggregator: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", // USDT
      },

      // USDC/WETH 0.05%
      {
        plpAddress: "0x9683D433621A83aA7dd290106e1da85251317F55",
        cauldronDeploymentName: "PopsicleUSDCWETHCauldron005Fee",
        proxyOracleDeploymentName: "PopsicleUSDCWETHProxyOracle005Fee",
        oracleDeploymentName: "PopsicleUSDCWETHOracle005Fee",

        swapperName: "PopsicleUSDCWETHSwapper",
        swapperDeploymentName: "PopsicleUSDCWETHSwapper005Fee",
        levSwapperName: "PopsicleUSDCWETHLevSwapper",
        levSwapperDeploymentName: "PopsicleUSDCWETHLevSwapper005Fee",
        token0Aggregator: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC
        token1Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
      },

      // WETH/USDT 0.05%
      {
        plpAddress: "0x8d8B490fCe6Ca1A31752E7cFAFa954Bf30eB7EE2",
        cauldronDeploymentName: "PopsicleWETHUSDTCauldron005Fee",
        proxyOracleDeploymentName: "PopsicleWETHUSDTProxyOracle005Fee",
        oracleDeploymentName: "PopsicleWETHUSDTOracle005Fee",

        swapperName: "PopsicleWETHUSDTSwapper",
        swapperDeploymentName: "PopsicleWETHUSDTSwapper005Fee",
        levSwapperName: "PopsicleWETHUSDTLevSwapper",
        levSwapperDeploymentName: "PopsicleWETHUSDTLevSwapper005Fee",
        token0Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
        token1Aggregator: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", // USDT
      },

      // UST/USDT
      {
        plpAddress: "0xbA38029806AbE4B45D5273098137DDb52dA8e62F",
        cauldronDeploymentName: "PopsicleUSTUSDTCauldron",
        proxyOracleDeploymentName: "PopsicleUSTUSDTProxyOracle",
        oracleDeploymentName: "PopsicleUSTUSDTOracle",

        swapperName: "PopsicleUSTUSDTSwapper",
        swapperDeploymentName: "PopsicleUSTUSDTSwapper",
        levSwapperName: "PopsicleUSTUSDTLevSwapper",
        levSwapperDeploymentName: "PopsicleUSTUSDTLevSwapper",
        token0Aggregator: "0x8b6d9085f310396C6E4f0012783E9f850eaa8a82", // UST
        token1Aggregator: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", // USDT
      },

      // USDC/UST
      {
        plpAddress: "0x71fd405e9C2f55522A73911b4A2F39CD80E06051",
        cauldronDeploymentName: "PopsicleUSDCUSTCauldron",
        proxyOracleDeploymentName: "PopsicleUSDCUSTProxyOracle",
        oracleDeploymentName: "PopsicleUSDCUSTOracle",

        swapperName: "PopsicleUSDCUSTSwapper",
        swapperDeploymentName: "PopsicleUSDCUSTSwapper",
        levSwapperName: "PopsicleUSDCUSTLevSwapper",
        levSwapperDeploymentName: "PopsicleUSDCUSTLevSwapper",
        token0Aggregator: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC
        token1Aggregator: "0x8b6d9085f310396C6E4f0012783E9f850eaa8a82", // UST
      },
      // USDC/USDT
      {
        plpAddress: "0x989442D5cCB27E7931095B0f3165c75a6def9bc3",
        cauldronDeploymentName: "PopsicleUSDCUSDTCauldron",
        proxyOracleDeploymentName: "PopsicleUSDCUSDTProxyOracle",
        oracleDeploymentName: "PopsicleUSDCUSDTOracle",

        swapperName: "PopsicleUSDCUSDTSwapper",
        swapperDeploymentName: "PopsicleUSDCUSDTSwapper",
        levSwapperName: "PopsicleUSDCUSDTLevSwapper",
        levSwapperDeploymentName: "PopsicleUSDCUSDTLevSwapper",
        token0Aggregator: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC
        token1Aggregator: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", // USDT
      },

      // WBTC/WETH 0.3%
      {
        plpAddress: "0x212Aa024E25A9C9bAF5b5397B558B7ccea81740B",
        cauldronDeploymentName: "PopsiclWBTCWETHCauldron",
        proxyOracleDeploymentName: "PopsicleWBTCWETHProxyOracle",
        oracleDeploymentName: "PopsicleWBTCWETHOracle",

        swapperName: "PopsicleWBTCWETHSwapper",
        swapperDeploymentName: "PopsicleWBTCWETHSwapper",
        levSwapperName: "PopsicleWBTCWETHLevSwapper",
        levSwapperDeploymentName: "PopsicleWBTCWETHLevSwapper",
        token0Aggregator: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // BTC
        token1Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
      },
      // WBTC/WETH 0.05%
      {
        plpAddress: "0xBE5d1d15617879B22C7b6a8e1e16aDD6d0bE3c61",
        cauldronDeploymentName: "PopsiclWBTCWETHCauldron005Fee",
        proxyOracleDeploymentName: "PopsicleWBTCWETHProxyOracle005Fee",
        oracleDeploymentName: "PopsicleWBTCWETHOracle005Fee",

        swapperName: "PopsicleWBTCWETHSwapper",
        swapperDeploymentName: "PopsicleWBTCWETHSwapper005Fee",
        levSwapperName: "PopsicleWBTCWETHLevSwapper",
        levSwapperDeploymentName: "PopsicleWBTCWETHLevSwapper005Fee",
        token0Aggregator: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // BTC
        token1Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
      },
    ],
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

  // 85% LTV .5% initial 3% Interest, 8% fee
  const collateralization = 85 * 1e3; // 85% LTV
  const opening = 0.5 * OPENING_CONVERSION; // .5% initial
  const interest = parseInt(String(3 * INTEREST_CONVERSION)); // 3% Interest
  const liquidation = 8 * 1e3 + 1e5; // 8% fee

  for (let i = 0; i < parameters.cauldrons.length; i++) {
    const parameter = parameters.cauldrons[i];

    // Proxy Oracle
    await deploy(parameter.proxyOracleDeploymentName, {
      from: deployer,
      args: [],
      log: true,
      contract: "ProxyOracle",
      deterministicDeployment: false,
    });

    // Oracle Implementation
    await deploy(parameter.oracleDeploymentName, {
      from: deployer,
      args: [parameter.plpAddress, parameter.token0Aggregator, parameter.token1Aggregator],
      log: true,
      contract: "PLPOracle",
      deterministicDeployment: false,
    });

    // Cauldron
    const DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", parameters.degenBox);
    const ProxyOracle = await ethers.getContract<ProxyOracle>(parameter.proxyOracleDeploymentName);

    let initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
      [parameter.plpAddress, ProxyOracle.address, parameters.oracleData, interest, liquidation, collateralization, opening]
    );
    const tx = await (await DegenBox.deploy(parameters.cauldronV2MasterContract, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    // Register the deployment so it's available within the test using `getContract`
    deployments.save(parameter.cauldronDeploymentName, {
      abi: [],
      address: deployEvent?.args?.cloneAddress,
    });

    // Liquidation Swapper
    await deploy(parameter.swapperDeploymentName, {
      from: deployer,
      args: [parameter.plpAddress],
      log: true,
      contract: parameter.swapperName,
      deterministicDeployment: false,
    });

    // Leverage Swapper
    await deploy(parameter.levSwapperDeploymentName, {
      from: deployer,
      args: [parameter.plpAddress],
      log: true,
      contract: parameter.levSwapperName,
      deterministicDeployment: false,
    });

    const PopsiclePLPOracle = await ethers.getContract<PLPOracle>(parameter.oracleDeploymentName);
    if ((await ProxyOracle.oracleImplementation()) !== PopsiclePLPOracle.address) {
      await ProxyOracle.changeOracleImplementation(PopsiclePLPOracle.address);
    }
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await ProxyOracle.transferOwnership(xMerlin, true, false);
    }
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

deployFunction.tags = ["PopsicleCauldrons"];
deployFunction.dependencies = [];
