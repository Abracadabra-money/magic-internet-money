import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { MyContract } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { deployCauldron, deployLPOracle, wrappedDeploy } from "../../utilities";
import { CauldronV3 } from "../../typechain";

const ParametersPerChain = {
  [ChainId.Avalanche]: {
    bentoBox: "0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f",
    degenBox: "0x1fC83f75499b7620d53757f0b01E2ae626aAE530",
    mim: "0x130966628846BFd36ff31a822705796e8cb8C18D",
    owner: xMerlin,
  },
  [ChainId.BSC]: {
    bentoBox: "",
    degenBox: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
    mim: "",
    owner: xMerlin,
  },
  [ChainId.Fantom]: {
    bentoBox: "",
    degenBox: "0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616",
    mim: "",
    owner: xMerlin,
  },
  [ChainId.Arbitrum]: {
    bentoBox: "0x74c764D41B77DBbb4fe771daB1939B00b146894A",
    degenBox: "",
    mim: "",
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const MyCauldron = await deployCauldron<CauldronV3>(
    "MyCauldron",
    parameters.degenBox,
    "[cauldron mastercontract address]",
    "collateral address",
    "proxy oracle address",
    "0x0000000000000000000000000000000000000000",
    85,
    1,
    1,
    1
  );

  const LpProxyOracle = await deployLPOracle(
    "MyProxyOracle",
    "USDC.e/WAVAX JoeLp",
    "lp address",
    "tokenA oracle address (chainlink usually)",
    "same but for tokenB"
  );

  const MyContract = await wrappedDeploy<MyContract>("MyContract", {
    from: deployer,
    args: [parameters.bentoBox, parameters.degenBox, parameters.mim],
    log: true,
    deterministicDeployment: false,
  });

  if ((await MyContract.owner()) != parameters.owner) {
    await (await MyContract.transferOwnership(parameters.owner, true, false)).wait();
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MyContract"];
deployFunction.dependencies = [];
