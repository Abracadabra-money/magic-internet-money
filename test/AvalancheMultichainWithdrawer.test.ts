import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { ChainId, impersonate } from "../utilities";
import { CauldronV2, MultichainWithdrawer, IERC20 } from "../typechain";

const MimProvider = "0x27C215c8b6e39f54C42aC04EB651211E9a566090";

const CauldronMasterContracts = [
  "0xc568a699c5B43A0F1aE40D3254ee641CB86559F4", // CauldronV2Multichain BentoBox
  "0x02E07B6F27E5eC37CA6E9f846b6D48704031625A", // CauldronV2Multichain DegenBox
];

describe("Avalanche Cauldron Fee Withdrawer", async () => {
  let snapshotId;
  let Withdrawer: MultichainWithdrawer;
  let MIM: IERC20;
  let SPELL: IERC20;
  let sSPELL: IERC20;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 7650378,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x130966628846bfd36ff31a822705796e8cb8c18d");

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
    const mimBefore = await MIM.balanceOf(Withdrawer.address);
    await Withdrawer.withdraw(true, false);
    const mimAfter = await MIM.balanceOf(Withdrawer.address);

    expect(mimAfter).to.be.gt(mimBefore);

    console.log("MIM Withdrawn:", mimAfter.sub(mimBefore).toString());
  });

  it("should be able to rescue token", async () => {
    const { deployer } = await getNamedAccounts();
    const mimBefore = await MIM.balanceOf(deployer);
    await Withdrawer.withdraw(true, false);

    const amountToRescue = await MIM.balanceOf(Withdrawer.address);
    await Withdrawer.connect(deployerSigner).rescueTokens(MIM.address, deployer, amountToRescue);
    const mimAfter = await MIM.balanceOf(deployer);
    expect(mimAfter.sub(mimBefore)).to.eq(amountToRescue);
  });

  xit("should withdraw mim from all cauldrons and bridge to mainnnet", async () => {
    await Withdrawer.withdraw(true, false);
    let mimAfter = await MIM.balanceOf(Withdrawer.address);
    expect(mimAfter).to.be.gt(0);

    await Withdrawer.bridgeMimToEthereum(await MIM.balanceOf(Withdrawer.address));
    expect(mimAfter).to.eq(0);
  });
  
});
