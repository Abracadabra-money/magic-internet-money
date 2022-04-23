import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { DegenBox, IOracle, ProxyOracle } from "../typechain";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";

const oracleData = "0x0000000000000000000000000000000000000000";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    cauldronV3MC: Constants.mainnet.cauldronV3,
    degenBox: Constants.mainnet.degenBox,
    mim: Constants.mainnet.mim,
    owner: xMerlin,

    cauldrons: [],
  },
  [ChainId.Avalanche]: {
    cauldronV3MC: Constants.avalanche.cauldronV3,
    degenBox: Constants.avalanche.degenBox,
    mim: Constants.avalanche.mim,
    owner: xMerlin,

    cauldrons: [
      // USDC Pool
      {
        deploymentNamePrefix: "AvalancheUsdc",
        collateral: Constants.avalanche.stargate.usdcPool,
        swapper: {
          tokenPath: [],
          poolPath: [],
        },
        levSwapper: {
          tokenPath: [],
          poolPath: [],
        },
      },

      // USDT Pool
      {
        deploymentNamePrefix: "AvalancheUsdt",
        collateral: Constants.avalanche.stargate.usdtPool,
      },
    ],
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);

  const cauldrons = parameters.cauldrons;

  for (let i = 0; i < cauldrons.length; i++) {
    const cauldron = cauldrons[i];

    const ProxyOracle = await wrappedDeploy<ProxyOracle>(`Stargate${cauldron.deploymentNamePrefix}ProxyOracle`, {
      from: deployer,
      args: [],
      log: true,
      contract: "ProxyOracle",
      deterministicDeployment: false,
    });

    const Oracle = await wrappedDeploy<IOracle>(`Stargate${cauldron.deploymentNamePrefix}LPOracleV1`, {
      from: deployer,
      args: [cauldron.collateral],
      log: true,
      contract: "StargateLPOracle",
      deterministicDeployment: false,
    });

    const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
    const OPENING_CONVERSION = 1e5 / 100;

    // 85% LTV .5% initial 3% Interest
    const collateralization = 85 * 1e3; // 85% LTV
    const opening = 0.5 * OPENING_CONVERSION; // .5% initial
    const interest = parseInt(String(3 * INTEREST_CONVERSION)); // 3% Interest
    const liquidation = 8 * 1e3 + 1e5;

    let initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
      [cauldron.collateral, ProxyOracle.address, oracleData, interest, liquidation, collateralization, opening]
    );

    const tx = await (await DegenBox.deploy(parameters.cauldronV3MC, initData, true)).wait();

    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    deployments.save(`Stargate${cauldron.deploymentNamePrefix}Cauldron`, {
      abi: [],
      address: deployEvent?.args?.cloneAddress,
    });

    // Liquidation Swapper
    await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}Swapper`, {
      from: deployer,
      args: [cauldron.swapper.tokenPath, cauldron.swapper.poolPath],
      log: true,
      contract: "StargateSwapper",
      deterministicDeployment: false,
    });

    // Leverage Swapper
    await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}LevSwapper`, {
      from: deployer,
      args: [cauldron.levSwapper.tokenPath, cauldron.levSwapper.poolPath],
      log: true,
      contract: "StargateLevSwapper",
      deterministicDeployment: false,
    });

    if ((await ProxyOracle.oracleImplementation()) !== Oracle.address) {
      await ProxyOracle.changeOracleImplementation(Oracle.address);
    }
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await ProxyOracle.transferOwnership(xMerlin, true, false);
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["StargateCauldrons"];
deployFunction.dependencies = [];
