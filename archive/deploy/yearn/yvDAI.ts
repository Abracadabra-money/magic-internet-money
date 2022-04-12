import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, wrappedDeploy } from "../utilities";
import { DegenBox, ProxyOracle, YearnChainlinkOracleV3 } from "../typechain";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    cauldronDeploymentName: "yvDAICauldron",
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV3MasterContract: "0xc33d23aA4b8a3dD2A3c539276Ab57363cC927202",
    oracle: "0xA0fA150F11ca5D63353d3460cbF5E15304d4BD57", // YearnChainlinkV3

    // multiply: 0x7a364e8770418566e3eb2001a96116e6138eb32f // MIM/USD chainlink
    // divide: 0xaed0c38402a5d19df6e4c03f4e2dced6e29c1ee9 // DAI/USD chainlink
    // decimals: 1
    // yearnVault: 0xdA816459F1AB5631232FE5e97a05BBBb94970c95
    oracleData:
      "0x0000000000000000000000007a364e8770418566e3eb2001a96116e6138eb32f000000000000000000000000aed0c38402a5d19df6e4c03f4e2dced6e29c1ee90000000000000000000000000000000000000000000000000000000000000001000000000000000000000000da816459f1ab5631232fe5e97a05bbbb94970c95",
    collateral: "0xdA816459F1AB5631232FE5e97a05BBBb94970c95", // yvDAI
    proxyOracleDeploymentName: "YVDAIOracleProxy",
    swapperName: "YVDAISwapper",
    levSwapperName: "YVDAILevSwapper",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  const collateralization = 98 * 1e3; // 98% LTV
  const opening = 0.0 * OPENING_CONVERSION; // 0% borrow initial fee
  const interest = parseInt(String(0 * INTEREST_CONVERSION)); // 0% Interest
  const liquidation = 0.5 * 1e3 + 1e5; // .5% liquidation fee

  // Proxy Oracle
  const ProxyOracle = await ethers.getContractAt<ProxyOracle>("ProxyOracle", "0x39DBa7955cEE12578B7548dF7eBf88F835d51bE1");
  if ((await ProxyOracle.oracleImplementation()) !== parameters.oracle) {
    await (await ProxyOracle.changeOracleImplementation(parameters.oracle)).wait();
  }
  if ((await ProxyOracle.owner()) !== xMerlin) {
    await (await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
  }

  // Cauldron
  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [parameters.collateral, ProxyOracle.address, parameters.oracleData, interest, liquidation, collateralization, opening]
  );

  const tx = await (await DegenBox.deploy(parameters.cauldronV3MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save(parameters.cauldronDeploymentName, {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });

  // Liquidation Swapper
  await wrappedDeploy(parameters.swapperName, {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await wrappedDeploy(parameters.levSwapperName, {
    from: deployer,
    args: [],
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

deployFunction.tags = ["yvDAI"];
deployFunction.dependencies = [];
