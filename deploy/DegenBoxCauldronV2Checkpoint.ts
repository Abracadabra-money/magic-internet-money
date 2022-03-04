import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { CauldronV2Checkpoint, DegenBox, MagicCRV } from "../typechain";
import { ChainId, impersonate, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    mim: "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3",
    feeTo: "0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4", // Ethereum Withdrawer
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("DegenBoxCauldronV2Checkpoint", {
    from: deployer,
    args: [parameters.degenBox, parameters.mim],
    log: true,
    contract: "CauldronV2Checkpoint",
    deterministicDeployment: false,
  });

  const CauldronV2Checkpoint = await ethers.getContract<CauldronV2Checkpoint>("DegenBoxCauldronV2Checkpoint");
  await (await CauldronV2Checkpoint.setFeeTo(parameters.feeTo)).wait();

  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);

  const degenBoxOwner = await DegenBox.owner();
  await impersonate(degenBoxOwner);
  const degenBoxOwnerSigner = await ethers.getSigner(degenBoxOwner);
  await DegenBox.connect(degenBoxOwnerSigner).whitelistMasterContract(CauldronV2Checkpoint.address, true);

  /*if ((await CauldronV2Checkpoint.owner()) != xMerlin) {
    await (await CauldronV2Checkpoint.transferOwnership(xMerlin, true, false)).wait();
  }*/
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["DegenBoxCauldronV2Checkpoint"];
deployFunction.dependencies = [];
