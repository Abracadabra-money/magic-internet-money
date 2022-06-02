import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, deployLPOracle, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { getNamedAccounts, network } from "hardhat";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Avalanche]: {
    cauldronDeploymentName: "PopsicleTraderJoeSAVAXWAVAXCauldron",
    degenBox: Constants.avalanche.limone,
    cauldronV3MasterContract: Constants.avalanche.cauldronV31_Limone,
    collateral: Constants.avalanche.traderjoe.savaxWavax,
    oracleData: "0x0000000000000000000000000000000000000000",
    swapperName: "JoeSavaxWavaxSwapper",
    levSwapperName: "JoeSavaxWavaxLevSwapper",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const ProxyOracle = await deployLPOracle(
    "TraderJoeSAVAXWAVAX",
    "TraderJoe sAVAX/wAVAX",
    Constants.avalanche.traderjoe.savaxWavax,
    Constants.avalanche.chainlink.savax,
    Constants.avalanche.chainlink.wavax
  );

  await deployCauldron(
    parameters.cauldronDeploymentName,
    parameters.degenBox,
    parameters.cauldronV3MasterContract,
    parameters.collateral,
    ProxyOracle.address,
    parameters.oracleData,
    75, // LTV
    1, // Interests
    1, // Opening
    12.5 // Liquidation
  );

  // Liquidation Swapper
  await wrappedDeploy(parameters.swapperName, {
    from: deployer,
    args: [parameters.degenBox],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await wrappedDeploy(parameters.levSwapperName, {
    from: deployer,
    args: [parameters.degenBox],
    log: true,
    deterministicDeployment: false,
  });

  if (network.name !== "hardhat") {
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await (await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["PopsicleJoeSavaxWavaxCauldron"];
deployFunction.dependencies = ["CauldronV3_1MC"];
