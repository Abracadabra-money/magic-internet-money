import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { DegenBox, CauldronV2MultiChain } from "../typechain";

const ParametersPerChain = {
  [ChainId.Polygon]: {
    weth: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    mim: "0x01288e04435bFcd4718FF203D6eD18146C17Cd4b",
    degenBox: "0x7a3b799E929C9bef403976405D8908fa92080449",
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("DegenBox", {
    from: deployer,
    args: [parameters.weth],
    log: true,
    deterministicDeployment: false,
  });

  const DegenBox = await ethers.getContract<DegenBox>("DegenBox");

  // Deploy CauldronV2MultiChain MasterContract
  await deploy("CauldronV2MultiChain", {
    from: deployer,
    args: [parameters.degenBox, parameters.mim],
    log: true,
    deterministicDeployment: false,
  });

  const CauldronV2MultiChain = await ethers.getContract<CauldronV2MultiChain>("CauldronV2MultiChain");
  await CauldronV2MultiChain.setFeeTo(parameters.owner);

  await DegenBox.whitelistMasterContract(CauldronV2MultiChain.address, true);

  if (network.name !== "hardhat") {
    if ((await CauldronV2MultiChain.owner()) != parameters.owner) {
      await CauldronV2MultiChain.transferOwnership(parameters.owner, true, false);
    }

    if ((await DegenBox.owner()) != parameters.owner) {
      await DegenBox.transferOwnership(parameters.owner, true, false);
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["CauldronV2MultiChainMC"];
deployFunction.dependencies = [];
