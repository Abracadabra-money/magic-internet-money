import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { MultiChainWithdrawer } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Avalanche]: {
    bentoBox: "0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f",
    degenBox: "0x1fC83f75499b7620d53757f0b01E2ae626aAE530",
    mim: "0x130966628846BFd36ff31a822705796e8cb8C18D",
    anyswapRouter: "0xB0731d50C681C45856BFc3f7539D5f61d4bE81D8",
    mimProvider: "0x27C215c8b6e39f54C42aC04EB651211E9a566090",
    bentoBoxCauldronsV2: [
      "0x3CFEd0439aB822530b1fFBd19536d897EF30D2a2", // AVAX
      "0x56984F04d2d04B2F63403f0EbeDD3487716bA49d", // wMEMO v1
      "0x35fA7A723B3B39f15623Ff1Eb26D8701E7D6bB21", // wMEMO v2
    ],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [
      "0x3b63f81Ad1fc724E44330b4cf5b5B6e355AD964B", // xJOE
      "0x0a1e6a80E93e62Bd0D3D3BFcF4c362C40FB1cF3D", // AVAX/USDT
      "0xd2F54B443C50F4b61F3be99Ab96e5C25EfE396d9", // USDC/AVAX
      "0x2450Bf8e625e98e14884355205af6F97E3E68d07", // MIM/AVAX
    ],
    owner: xMerlin,
  },
  [ChainId.BSC]: {
    bentoBox: "",
    degenBox: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
    mim: "",
    anyswapRouter: "",
    mimProvider: "",
    bentoBoxCauldronsV2: [],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [],
    owner: xMerlin,
  },
  [ChainId.Fantom]: {
    bentoBox: "",
    degenBox: "0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616",
    mim: "",
    anyswapRouter: "",
    mimProvider: "",
    bentoBoxCauldronsV2: [],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [],
    owner: xMerlin,
  },
  [ChainId.Arbitrum]: {
    bentoBox: "0x74c764D41B77DBbb4fe771daB1939B00b146894A",
    degenBox: "",
    mim: "",
    anyswapRouter: "",
    mimProvider: "",
    bentoBoxCauldronsV2: [],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [],
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  console.log("WARNING: Change to receipient to EthereumWithdrawer address")

  await deploy("MultichainWithdrawer", {
    from: deployer,
    args: [
      parameters.bentoBox,
      parameters.degenBox,
      parameters.mim,
      parameters.anyswapRouter,
      parameters.mimProvider,
      parameters.mimProvider, // Change to EthereumWithdrawer address
      parameters.bentoBoxCauldronsV2,
      parameters.bentoBoxCauldronsV1,
      parameters.degenBoxCauldrons,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const MultichainWithdrawer = await ethers.getContract<MultiChainWithdrawer>("MultichainWithdrawer");

  if ((await MultichainWithdrawer.owner()) != parameters.owner && network.name !== "hardhat") {
    await MultichainWithdrawer.transferOwnership(parameters.owner, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MultichainWithdrawer"];
deployFunction.dependencies = [];
