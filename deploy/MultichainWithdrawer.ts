import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { MultichainWithdrawer } from "../typechain";

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
    bentoBox: ethers.constants.AddressZero,
    degenBox: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
    mim: "0xfE19F0B51438fd612f6FD59C1dbB3eA319f433Ba",
    anyswapRouter: "0xd1C5966f9F5Ee6881Ff6b261BBeDa45972B1B5f3",
    mimProvider: "0x9d9bC38bF4A128530EA45A7d27D0Ccb9C2EbFaf6",
    bentoBoxCauldronsV2: [],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [
      "0x692CF15F80415D83E8c0e139cAbcDA67fcc12C90", // CAKE
      "0xF8049467F3A9D50176f4816b20cDdd9bB8a93319" // wBNB
    ],
    owner: xMerlin,
  },
  [ChainId.Fantom]: {
    bentoBox: "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
    degenBox: "0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616",
    mim: "0x82f0B8B456c1A451378467398982d4834b6829c1",
    anyswapRouter: "0x1CcCA1cE62c62F7Be95d4A67722a8fDbed6EEcb4",
    mimProvider: "0xb4ad8B57Bd6963912c80FCbb6Baea99988543c1c",
    bentoBoxCauldronsV2: [
      "0x8E45Af6743422e488aFAcDad842cE75A09eaEd34", // wFTM 1
      "0xd4357d43545F793101b592bACaB89943DC89d11b", // wFTM 2
      "0xed745b045f9495B8bfC7b58eeA8E0d0597884e12", // yvWFTM
    ],
    bentoBoxCauldronsV1: [],
    degenBoxCauldrons: [],
    owner: xMerlin,
  },
  [ChainId.Arbitrum]: {
    bentoBox: "0x74c764D41B77DBbb4fe771daB1939B00b146894A",
    degenBox: ethers.constants.AddressZero,
    mim: "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A",
    anyswapRouter: "0xC931f61B1534EB21D8c11B24f3f5Ab2471d4aB50",
    mimProvider: "0xf46BB6dDA9709C49EfB918201D97F6474EAc5Aea",
    bentoBoxCauldronsV2: [
      "0xC89958B03A55B5de2221aCB25B58B89A000215E6" // wETH
    ],
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

  await deploy("MultichainWithdrawer", {
    from: deployer,
    args: [
      parameters.bentoBox,
      parameters.degenBox,
      parameters.mim,
      parameters.anyswapRouter,
      parameters.mimProvider,
      "0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4", // EthereumWithdrawer as recipient
      parameters.bentoBoxCauldronsV2,
      parameters.bentoBoxCauldronsV1,
      parameters.degenBoxCauldrons,
    ],
    log: true,
    deterministicDeployment: false,
  });

  const MultichainWithdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

  if ((await MultichainWithdrawer.owner()) != parameters.owner && network.name !== "hardhat") {
    await MultichainWithdrawer.transferOwnership(parameters.owner, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MultichainWithdrawer"];
deployFunction.dependencies = [];
