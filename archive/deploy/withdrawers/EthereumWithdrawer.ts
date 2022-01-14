import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { EthereumWithdrawer } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    bentoBoxCauldronsV2: [
      "0xc1879bf24917ebE531FbAA20b0D05Da027B592ce", // AGLD
      "0x7b7473a76d6ae86ce19f7352a1e89f6c9dc39020", // ALCX
      "0x920D9BD936Da4eAFb5E25c6bDC9f6CB528953F9f", // yvWETH
      "0x806e16ec797c69afa8590A55723CE4CC1b54050E", // cvx3Pool v1
      "0x6371EfE5CD6e3d2d7C477935b7669401143b7985", // CVX3Pool v2
      "0x257101F20cB7243E2c7129773eD5dBBcef8B34E0", // cvx3pool v3
      "0x35a0Dd182E4bCa59d5931eae13D0A2332fA30321", // cvxRenCrv
      "0x4EAeD76C3A388f4a841E9c765560BBe7B3E4B3A0", // cvxTricrypto2
      "0x05500e2Ee779329698DF35760bEdcAAC046e7C27", // FTM
      "0x9617b633EF905860D919b88E1d9d9a6191795341", // FTT
      "0x252dCf1B621Cc53bc22C256255d2bE5C8c32EaE4", // SHIB
      "0x3410297D89dCDAf4072B805EFc1ef701Bb3dd9BF", // sSPELL
      "0xc319eea1e792577c319723b5e60a15da3857e7da", // sSPELL old
      "0x003d5A75d284824Af736df51933be522DE9Eed0f", // wsOHM
      "0x98a84EfF6e008c5ed0289655CcdCa899bcb6B99F", // xSUSHI
      "0xEBfDe87310dc22404d918058FAa4D56DC4E93f0A", // yvcrvIB
      "0x0BCa8ebcB26502b013493Bf8fE53aA2B1ED401C1", // yvstETH
    ],
    bentoBoxCauldronsV1: [
      "0x551a7CfF4de931F32893c928bBc3D25bF1Fc5147", // yvUSDT
      "0x6Ff9061bB8f97d948942cEF376d98b51fA38B91f", // Weth
      "0xFFbF4892822e0d552CFF317F65e1eE7b5D3d9aE6", // yvYFI
      "0x6cbAFEE1FaB76cA5B5e144c43B3B50d42b7C8c8f", // yvUSDC
      "0xbb02A884621FB8F5BFd263A67F58B65df5b090f3", // xSUSHI
    ],
    degenBoxCauldrons: [
      "0xCfc571f3203756319c231d3Bc643Cee807E74636", // SPELL
      "0xbc36FdE44A7FD8f545d459452EF9539d7A14dd63", // UST v1
      "0x59E9082E068Ddb27FC5eF1690F9a9f22B32e573f", // UST v2
    ],
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];
  
  await deploy("EthereumWithdrawer", {
    from: deployer,
    args: [
      parameters.bentoBoxCauldronsV2,
      parameters.bentoBoxCauldronsV1,
      parameters.degenBoxCauldrons
    ],
    log: true,
    deterministicDeployment: false,
  });

  const EthereumWithdrawer = await ethers.getContract<EthereumWithdrawer>("EthereumWithdrawer");

  if ((await EthereumWithdrawer.owner()) != xMerlin && network.name !== "hardhat") {
    await EthereumWithdrawer.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["EthereumWithdrawer"];
deployFunction.dependencies = [];
