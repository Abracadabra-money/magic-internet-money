import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, deploySolidlyLikeVolatileZeroExSwappers, deployUniswapLikeZeroExSwappers, setDeploymentSupportedChains } from "../utilities";
import { Constants } from "../test/constants";

export const ParametersPerChain = {
  [ChainId.Optimism]: {
    cauldronDeploymentName: "OptimismPopsicleVelodromeVolaliteOPUSDCCauldron",
    degenBox: Constants.optimism.limone,
    CauldronMC: Constants.optimism.cauldronV31_Limone,
    collateral: Constants.optimism.velodrome.vOpUsdc,
    oracle: "0x04146736FEF83A25e39834a972cf6A5C011ACEad",
    router: Constants.optimism.velodrome.router,
    mim: Constants.optimism.mim,
    zeroXExchangeProxy: Constants.optimism.aggregators.zeroXExchangProxy,
    oracleData: "0x0000000000000000000000000000000000000000",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();

  const parameters = ParametersPerChain[parseInt(chainId)];
  await deployCauldron(
    parameters.cauldronDeploymentName,
    parameters.degenBox,
    parameters.CauldronMC,
    parameters.collateral,
    parameters.oracle,
    parameters.oracleData,
    85, // LTV
    1.5, // Interests
    1, // Opening
    8 // Liquidation
  );

  await deploySolidlyLikeVolatileZeroExSwappers(
    "OptimismPopsicleVelodromeVolaliteOPUSDC",
    parameters.degenBox,
    parameters.router,
    parameters.collateral,
    parameters.mim,
    parameters.zeroXExchangeProxy,
    deployer
  );
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["OptimismPopsicleVelodromeVolaliteOPUSDCCauldron"];
deployFunction.dependencies = [];
