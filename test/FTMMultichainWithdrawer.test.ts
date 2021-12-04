import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { ChainId, impersonate } from "../utilities";
import { CauldronV2, MultichainWithdrawer, IERC20, ERC20 } from "../typechain";

const MimProvider = "0xb4ad8B57Bd6963912c80FCbb6Baea99988543c1c";

const CauldronMasterContracts = [
  "0xe802823719f9d2520415854E6f95baE498FF1D52", // CauldronV2FTM
];

describe("FTM Cauldron Fee Withdrawer", async () => {
  let snapshotId;
  let Withdrawer: MultichainWithdrawer;
  let MIM: ERC20;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://rpc.ankr.com/fantom",
            blockNumber: 23877544,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Fantom.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    MIM = await ethers.getContractAt<ERC20>("ERC20", "0x82f0B8B456c1A451378467398982d4834b6829c1");

    Withdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

    // change cauldron master contracts feeTo to withdrawer address
    for (let i = 0; i < CauldronMasterContracts.length; i++) {
      const cauldronMasterContract = await ethers.getContractAt<CauldronV2>("CauldronV2", CauldronMasterContracts[i]);
      const owner = await cauldronMasterContract.owner();
      await impersonate(owner);
      const signer = await ethers.getSigner(owner);
      await cauldronMasterContract.connect(signer).setFeeTo(Withdrawer.address);
    }

    // Set MIM provider allowance for transferring MIM to withdrawer
    await impersonate(MimProvider);
    const mimProviderSigner = await ethers.getSigner(MimProvider);
    await MIM.connect(mimProviderSigner).approve(Withdrawer.address, ethers.constants.MaxUint256);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should withdraw mim from all cauldrons", async () => {
    const tx = await Withdrawer.withdraw();
    const events = (await tx.wait()).events || [];
    const mimWithdrawnEvent = events[events.length - 1];

    expect(mimWithdrawnEvent.args).not.to.be.undefined;
    expect(mimWithdrawnEvent.args && mimWithdrawnEvent.args[0]).to.be.gt(0);
  });

  it("should be able to rescue token", async () => {
    const { deployer } = await getNamedAccounts();

    const mimBefore = await MIM.balanceOf(deployer);

    await impersonate(MimProvider);
    const mimProviderSigner = await ethers.getSigner(MimProvider);
    await MIM.connect(mimProviderSigner).transfer(Withdrawer.address, await MIM.balanceOf(MimProvider));

    const amountToRescue = await MIM.balanceOf(Withdrawer.address);
    await Withdrawer.connect(deployerSigner).rescueTokens(MIM.address, deployer, amountToRescue);
    const mimAfter = await MIM.balanceOf(deployer);
    expect(mimAfter.sub(mimBefore)).to.eq(amountToRescue);
  });

  it("should withdraw mim from all cauldrons and bridge to mainnnet", async () => {
    // bridging burns the token, so the supply should lower
    const mimSupplyBefore = await MIM.totalSupply();

    await Withdrawer.withdraw();
    expect(await MIM.balanceOf(Withdrawer.address)).to.eq(0);

    const mimSupplyAfter = await MIM.totalSupply();
    expect(mimSupplyAfter).to.be.lt(mimSupplyBefore);
  });
});
