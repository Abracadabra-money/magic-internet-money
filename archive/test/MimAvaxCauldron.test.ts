/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, IERC20, MimAvaxSwapper, MimAvaxLevSwapper, CauldronV2 } from "../typechain";
import { expect } from "chai";

// Top holders at the given fork block
const MIM_WHALE = "0x27C215c8b6e39f54C42aC04EB651211E9a566090";
const MIMAVAX_LP_WHALE = "0xE8BFacc1b9e3F2B7112Df51Cbbae4784a3ec38D6";

describe("Lev/Liquidation MimAvax Swappers and Cauldron", async () => {
  let snapshotId;
  let Cauldron: CauldronV2;
  let MIM: IERC20;
  let MIMAVAX: IERC20;
  let MimAvaxSwapper: MimAvaxSwapper;
  let MimAvaxLevSwapper: MimAvaxLevSwapper;
  let DegenBox: BentoBoxV1;
  let mimShare;
  let mimAvaxShare;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 6809282,
          },
        },
      ],
    });

    await deployments.fixture(["MimAvaxSwappers", "MimAvaxCauldron"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("MimAvaxCauldron")).address);

    MimAvaxSwapper = await ethers.getContract<MimAvaxSwapper>("MimAvaxSwapper");
    MimAvaxLevSwapper = await ethers.getContract<MimAvaxLevSwapper>("MimAvaxLevSwapper");
    DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    MIMAVAX = await ethers.getContractAt<IERC20>("ERC20", "0x781655d802670bbA3c89aeBaaEa59D3182fD755D");

    await impersonate(MIM_WHALE);
    await impersonate(MIMAVAX_LP_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const usdcAvaxWhaleSigner = await ethers.getSigner(MIMAVAX_LP_WHALE);

    // Deposit USDCAVAX lp in DegenBox for UsdcAvaxSwapper
    mimAvaxShare = await DegenBox.toShare(MIMAVAX.address, getBigNumber(2), true);
    await MIMAVAX.connect(usdcAvaxWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(usdcAvaxWhaleSigner).deposit(MIMAVAX.address, MIMAVAX_LP_WHALE, MimAvaxSwapper.address, 0, mimAvaxShare);

    // Deposit MIM in DegenBox for UsdcAvaxLevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(500_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, MimAvaxLevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);
    console.log(Cauldron.address);
    expect(await Cauldron.collateral()).to.eq("0x781655d802670bbA3c89aeBaaEa59D3182fD755D");
    expect(await Cauldron.oracle()).to.not.eq(ethers.constants.AddressZero);
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
  });

  it("should liquidate the MIM/AVAX collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountMimAvaxBefore = (await DegenBox.totals(MIMAVAX.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await MimAvaxSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, mimAvaxShare);

    const amountMimAvaxAfter = (await DegenBox.totals(MIMAVAX.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${amountMimAfter.sub(amountMimBefore).toString()} MIM from Liquidation Swapper`);

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountMimAvaxAfter).to.be.lt(amountMimAvaxBefore);
  });

  it("should swap MIM for MIM/AVAX and deposit back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountMimAvaxBefore = (await DegenBox.totals(MIMAVAX.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await MimAvaxLevSwapper.swap(alice, 0, mimShare);

    const amountMimAvaxAfter = (await DegenBox.totals(MIMAVAX.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${amountMimAvaxAfter.sub(amountMimAvaxBefore).toString()} MIM/AVAX from Leverage Swapper`);

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountMimAvaxAfter).to.be.gt(amountMimAvaxBefore);
  });
});
