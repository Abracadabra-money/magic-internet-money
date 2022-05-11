import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deployments, ethers, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { BaseStargateLpMimPool, DegenBox, IOracle, ProxyOracle, StargateCurveSwapperV2 } from "../typechain";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";

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
        oracle: "0x16495612e7b35bbc8c672cd76de83bcc81774552", // StargateEthereumUsdcProxyOracle
        swapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 2,
          curvePoolJ: 0,
        },
      },

      // USDT Pool
      {
        deploymentNamePrefix: "EthereumUsdt",
        collateral: Constants.mainnet.stargate.usdtPool,
        poolId: 2,
        oracle: "0xaBB326cD92b0e48fa6dfC54d69Cd1750a1007a97", // StargateEthereumUsdtProxyOracle
        swapper: {
          curvePool: Constants.mainnet.curve.mim3Crv,
          curvePoolI: 3,
          curvePoolJ: 0,
        },
      },
    ],
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = parseInt(await hre.getChainId());
  const parameters = ParametersPerChain[chainId];
  const cauldrons = parameters.cauldrons;

  const MimPool = await wrappedDeploy<BaseStargateLpMimPool>(`MainnetStargateLpMimPoolV1`, {
    from: deployer,
    args: [Constants.mainnet.mim, Constants.mainnet.stargate.router],
  });

  for (let i = 0; i < cauldrons.length; i++) {
    const cauldron = cauldrons[i];

    const Swapper = await wrappedDeploy<StargateCurveSwapperV2>(`Stargate${cauldron.deploymentNamePrefix}SwapperV2`, {
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
      contract: "StargateCurveSwapperV2",
      deterministicDeployment: false,
    });

    await (await MimPool.setPool(cauldron.collateral, cauldron.poolId, cauldron.oracle)).wait();
    await (await MimPool.setAllowedRedeemer(Swapper.address, true)).wait(); 
    await (await Swapper.setMimPool(MimPool.address)).wait();
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["StargateSwapperV2"];
deployFunction.dependencies = [];
