/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../../utilities";
import { BentoBoxV1, IERC20, AvaxUsdtLevSwapper, AvaxUsdtSwapper, CauldronV2 } from "../../typechain";
import { expect } from "chai";

// Top holders at the given fork block
const MIM_WHALE = "0x27C215c8b6e39f54C42aC04EB651211E9a566090";
const AVAXUSDT_LP_WHALE = "0x7Fe69733f5A2B632527Eae2D6818548875eB140f";

describe("Lev/Liquidation AvaxUsdt Swappers", async () => {
  let snapshotId;
  let Cauldron: CauldronV2;
  let MIM: IERC20;
  let AVAXUSDT: IERC20;
  let WAVAX: IERC20;
  let USDT: IERC20;
  let AvaxUsdtSwapper: AvaxUsdtSwapper;
  let AvaxUsdtLevSwapper: AvaxUsdtLevSwapper;
  let DegenBox: BentoBoxV1;
  let mimShare;
  let avaxUsdtShare;
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

    await deployments.fixture(["AvaxUsdtSwappers", "AvaxUsdtCauldron"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("AvaxUsdtCauldron")).address);

    AvaxUsdtSwapper = await ethers.getContract<AvaxUsdtSwapper>("AvaxUsdtSwapper");
    AvaxUsdtLevSwapper = await ethers.getContract<AvaxUsdtLevSwapper>("AvaxUsdtLevSwapper");
    DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    WAVAX = await ethers.getContractAt<IERC20>("ERC20", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    USDT = await ethers.getContractAt<IERC20>("ERC20", "0xc7198437980c041c805A1EDcbA50c1Ce5db95118");
    AVAXUSDT = await ethers.getContractAt<IERC20>("ERC20", "0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256");

    await impersonate(MIM_WHALE);
    await impersonate(AVAXUSDT_LP_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const avaxUsdtWhaleSigner = await ethers.getSigner(AVAXUSDT_LP_WHALE);

    // Deposit lp in DegenBox for Swapper
    const avaxUsdtBalance = await AVAXUSDT.balanceOf(AVAXUSDT_LP_WHALE);
    avaxUsdtShare = await DegenBox.toShare(AVAXUSDT.address, avaxUsdtBalance, true);
    await AVAXUSDT.connect(avaxUsdtWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(avaxUsdtWhaleSigner).deposit(AVAXUSDT.address, AVAXUSDT_LP_WHALE, AvaxUsdtSwapper.address, 0, avaxUsdtShare);

    // Deposit MIM in DegenBox for LevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(500_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, AvaxUsdtLevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);
    console.log(Cauldron.address)
    expect(await Cauldron.collateral()).to.eq("0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256");
    expect(await Cauldron.oracle()).to.not.eq(ethers.constants.AddressZero);
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
  });

  it("should liquidate the AVAX/USDT collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountUsdcAvaxBefore = (await DegenBox.totals(AVAXUSDT.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await AvaxUsdtSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, avaxUsdtShare);

    const amountUsdcAvaxAfter = (await DegenBox.totals(AVAXUSDT.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${amountMimAfter.sub(amountMimBefore).toString()} MIM from Liquidation Swapper`);
    console.log(
      `Remaining in the contract: ${(await MIM.balanceOf(AvaxUsdtSwapper.address)).toString()} MIM, ${(
        await WAVAX.balanceOf(AvaxUsdtSwapper.address)
      ).toString()} AVAX, ${(await AVAXUSDT.balanceOf(AvaxUsdtSwapper.address)).toString()} LP`
    );

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.lt(amountUsdcAvaxBefore);
  });

  it("should swap MIM for AVAX/USDT and deposit back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountUsdcAvaxBefore = (await DegenBox.totals(AVAXUSDT.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await AvaxUsdtLevSwapper.swap(alice, 0, mimShare);

    const amountUsdcAvaxAfter = (await DegenBox.totals(AVAXUSDT.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${amountUsdcAvaxAfter.sub(amountUsdcAvaxBefore).toString()} AVAX/USDT from Leverage Swapper`);
    console.log(
      `Remaining in the contract: ${(await MIM.balanceOf(AvaxUsdtSwapper.address)).toString()} MIM, ${(
        await WAVAX.balanceOf(AvaxUsdtSwapper.address)
      ).toString()} AVAX, ${(await USDT.balanceOf(AvaxUsdtSwapper.address)).toString()} USDT, `
    );

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.gt(amountUsdcAvaxBefore);
  });
});
