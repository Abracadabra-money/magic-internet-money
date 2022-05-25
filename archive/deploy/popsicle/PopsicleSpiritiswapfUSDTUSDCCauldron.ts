import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants } from "../test/constants";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Fantom]: {
    cauldronDeploymentName: "PopsicleSpiritiswapfUSDTUSDCCauldron",
    degenBox: Constants.fantom.limone,
    cauldronV3MasterContract: Constants.fantom.cauldronV3,
    collateral: Constants.fantom.spiritswap.fUSDTUSDC,
    oracle: "0xe56F37Ef2e54ECaA41a9675da1c3445736d60B42",
    oracleData: "0x0000000000000000000000000000000000000000",
    swapperName: "SpiritfUSDTUSDCSwapper",
    levSwapperName: "SpiritfUSDTUSDCLevSwapper",
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
    parameters.cauldronV3MasterContract,
    parameters.collateral,
    parameters.oracle,
    parameters.oracleData,
    90, // LTV
    2.5, // Interests
    0, // Opening
    8 // Liquidation
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
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["PopsicleSpiritiswapfUSDTUSDCCauldron"];
deployFunction.dependencies = [];
