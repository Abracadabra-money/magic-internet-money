import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, deployLPOracle, getBigNumber, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { getNamedAccounts, network } from "hardhat";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Avalanche]: {
    degenBox: Constants.avalanche.limone,
    collateral: Constants.avalanche.traderjoe.savaxWavax,
    levSwapperName: "JoeSavaxWavaxLevSwapperV1",
    joeRouter: Constants.avalanche.traderjoe.router,
    mim: Constants.avalanche.mim,
    zeroXExchangeProxy: Constants.avalanche.aggregators.zeroXExchangProxy,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];
  const swapperArgs = [
    parameters.degenBox,
    parameters.joeRouter,
    parameters.collateral,
    parameters.mim,
    parameters.zeroXExchangeProxy
  ];

  // Leverage Swapper
  await wrappedDeploy(parameters.levSwapperName, {
    from: deployer,
    args: swapperArgs,
    log: true,
    contract: "ZeroXUniswapLikeLPLevSwapper",
    deterministicDeployment: false,
  });
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["ZeroXUniswapLikeLPLevSwapper"];
deployFunction.dependencies = [];
