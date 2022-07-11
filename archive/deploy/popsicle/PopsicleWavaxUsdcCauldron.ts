import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, deployCauldron, deployUniswapLikeZeroExSwappers, setDeploymentSupportedChains } from "../utilities";
import { expect } from "chai";
import { DegenBox, ProxyOracle } from "../typechain";
import { Constants } from "../test/constants";
// List of supported chains to deploy on
const supportedChains = [ChainId.Avalanche];

export const ParametersPerChain = {
  [ChainId.Avalanche]: {
    cauldronDeploymentName: "AvalanchePopsicleWavaxUsdcJoeCauldron",
    degenBox: Constants.avalanche.limone,
    CauldronMC: Constants.avalanche.cauldronV31_Limone,
    collateral: Constants.avalanche.traderjoe.wavaxUsdc, // Joe WAVAX/USDC.e jLP
    oracle: "0xF8B72e847e648BC87c8269FE258cbe908Fa2A71d", // Joe WAVAX/USDC.e jLP oracle
    router: Constants.avalanche.traderjoe.router,
    mim: Constants.avalanche.mim,
    zeroXExchangeProxy: Constants.avalanche.aggregators.zeroXExchangProxy,
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

  await deployUniswapLikeZeroExSwappers(
    "AvalanchePopsicleUsdcJoe",
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

deployFunction.tags = ["AvalanchePopsicleUsdcJoe"];
deployFunction.dependencies = [];
