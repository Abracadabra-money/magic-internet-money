import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { DegenBox, IOracle, ProxyOracle } from "../typechain";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";

const oracleData = "0x0000000000000000000000000000000000000000";

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    enabled: true,
    cauldronV3MC: Constants.mainnet.cauldronV3,
    degenBox: Constants.mainnet.degenBox,
    mim: Constants.mainnet.mim,
    owner: xMerlin,
    stargateRouter: Constants.mainnet.stargate.router,

    cauldrons: [
      // USDC Pool
      {
        deploymentNamePrefix: "EthereumUsdc",
        collateral: Constants.mainnet.stargate.usdcPool,
        poolId: 1,
        oracle: {
          chainLinkTokenOracle: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
          desc: "LINK/USDC",
        },
        swapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 2,
          curvePoolJ: 0,
        },
        levSwapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 0,
          curvePoolJ: 2,
        },
      },

      // USDT Pool
      {
        deploymentNamePrefix: "EthereumUsdt",
        collateral: Constants.mainnet.stargate.usdtPool,
        poolId: 2,
        oracle: {
          chainLinkTokenOracle: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
          desc: "LINK/USDT",
        },
        swapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 3,
          curvePoolJ: 0,
        },
        levSwapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 0,
          curvePoolJ: 3,
        },
      },
    ],
  },
  [ChainId.Arbitrum]: {
    enabled: true,
    cauldronV3MC: Constants.arbitrum.cauldronV3,
    degenBox: Constants.arbitrum.degenBox,
    mim: Constants.arbitrum.mim,
    owner: xMerlin,
    stargateRouter: Constants.arbitrum.stargate.router,

    cauldrons: [
      // USDC Pool
      {
        deploymentNamePrefix: "ArbitrumUsdc",
        collateral: Constants.arbitrum.stargate.usdcPool,
        poolId: 1,
        oracle: {
          chainLinkTokenOracle: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
          desc: "LINK/USDC",
        },
        swapper: {
          curvePool: Constants.arbitrum.curve.mim2crvPool,
          curvePoolI: 1,
          curvePoolJ: 0,
        },
        levSwapper: {
          curvePool: Constants.arbitrum.curve.mim2crvPool,
          curvePoolI: 0,
          curvePoolJ: 1,
        },
      },

      // USDT Pool
      {
        deploymentNamePrefix: "ArbitrumUsdt",
        collateral: Constants.arbitrum.stargate.usdtPool,
        poolId: 2,
        oracle: {
          chainLinkTokenOracle: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
          desc: "LINK/USDT",
        },
        swapper: {
          curvePool: Constants.arbitrum.curve.mim2crvPool,
          curvePoolI: 2,
          curvePoolJ: 0,
        },
        levSwapper: {
          curvePool: Constants.arbitrum.curve.mim2crvPool,
          curvePoolI: 0,
          curvePoolJ: 2,
        },
      },
    ],
  },
  [ChainId.Avalanche]: {
    enabled: true,
    cauldronV3MC: Constants.avalanche.cauldronV3,
    degenBox: Constants.avalanche.degenBox,
    mim: Constants.avalanche.mim,
    owner: xMerlin,
    stargateRouter: Constants.avalanche.stargate.router,
    platypusRouter: Constants.avalanche.platypus.router,

    cauldrons: [
      // USDC Pool
      {
        deploymentNamePrefix: "AvalancheUsdc",
        collateral: Constants.avalanche.stargate.usdcPool,
        poolId: 1,
        oracle: {
          chainLinkTokenOracle: "0xF096872672F44d6EBA71458D74fe67F9a77a23B9",
          desc: "LINK/USDC",
        },
        swapper: {
          tokenPath: [Constants.avalanche.usdc, Constants.avalanche.mim],
          poolPath: ["0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7"], // USDC -> MIM
        },
        levSwapper: {
          tokenPath: [Constants.avalanche.mim, Constants.avalanche.usdc],
          poolPath: ["0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7"], // MIM -> USDC
        },
      },

      // USDT Pool
      {
        deploymentNamePrefix: "AvalancheUsdt",
        collateral: Constants.avalanche.stargate.usdtPool,
        poolId: 2,
        oracle: {
          chainLinkTokenOracle: "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a",
          desc: "LINK/USDT",
        },
        swapper: {
          tokenPath: [Constants.avalanche.usdt, Constants.avalanche.usdc, Constants.avalanche.mim],
          poolPath: ["0x66357dCaCe80431aee0A7507e2E361B7e2402370", "0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7"], // USDT -> MIM
        },
        levSwapper: {
          tokenPath: [Constants.avalanche.mim, Constants.avalanche.usdc, Constants.avalanche.usdt],
          poolPath: ["0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7", "0x66357dCaCe80431aee0A7507e2E361B7e2402370"], // MIM -> USDT
        },
      },
    ],
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId());
  const parameters = ParametersPerChain[chainId];

  if (!parameters.enabled) {
    console.log(`Deployment disabled for chain id ${chainId}`);
    return;
  }

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
      args: [cauldron.collateral, cauldron.oracle.chainLinkTokenOracle, cauldron.oracle.desc],
      log: true,
      contract: "StargateLPOracle",
      deterministicDeployment: false,
    });

    if ((await ProxyOracle.oracleImplementation()) !== Oracle.address) {
      await (await ProxyOracle.changeOracleImplementation(Oracle.address)).wait();
    }
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await (await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
    }

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

    switch (chainId) {
      case ChainId.Mainnet:
      case ChainId.Arbitrum:
        // Liquidation Swapper
        await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}Swapper`, {
          from: deployer,
          args: [
            parameters.degenBox,
            cauldron.collateral,
            cauldron.poolId,
            parameters.stargateRouter,
            cauldron.swapper.curvePool,
            cauldron.swapper.curvePoolI,
            cauldron.swapper.curvePoolJ,
          ],
          log: true,
          contract: "StargateCurveSwapper",
          deterministicDeployment: false,
        });

        // Leverage Swapper
        await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}LevSwapper`, {
          from: deployer,
          args: [
            parameters.degenBox,
            cauldron.collateral,
            cauldron.poolId,
            parameters.stargateRouter,
            parameters.platypusRouter,
            cauldron.levSwapper.tokenPath,
            cauldron.levSwapper.poolPath,
          ],
          log: true,
          contract: "StargateCurveLevSwapper",
          deterministicDeployment: false,
        });
        break;
      case ChainId.Avalanche:
        // Liquidation Swapper
        await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}Swapper`, {
          from: deployer,
          args: [
            parameters.degenBox,
            cauldron.collateral,
            cauldron.poolId,
            parameters.stargateRouter,
            parameters.platypusRouter,
            cauldron.swapper.tokenPath,
            cauldron.swapper.poolPath,
          ],
          log: true,
          contract: "StargatePlatypusSwapper",
          deterministicDeployment: false,
        });

        // Leverage Swapper
        await wrappedDeploy(`Stargate${cauldron.deploymentNamePrefix}LevSwapper`, {
          from: deployer,
          args: [
            parameters.degenBox,
            cauldron.collateral,
            cauldron.poolId,
            parameters.stargateRouter,
            parameters.platypusRouter,
            cauldron.levSwapper.tokenPath,
            cauldron.levSwapper.poolPath,
          ],
          log: true,
          contract: "StargatePlatypusLevSwapper",
          deterministicDeployment: false,
        });
        break;
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["StargateCauldrons"];
deployFunction.dependencies = [];
