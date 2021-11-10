/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import {
  BentoBoxV1,
  CauldronV2,
  IERC20,
  IOracle,
  IPopsicle,
  PopsicleUSDCWETHLevSwapper,
  PopsicleUSDCWETHSwapper,
  UsdcAvaxLevSwapper,
  UsdcAvaxSwapper,
} from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";

// Top holders at the given fork block
const MIM_WHALE = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const USDC_WETH_WHALE = "0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0";

describe("Popsicle USDC/WETH Cauldron", async () => {
  let snapshotId;
  let MIM: IERC20;
  let PLP: IPopsicle;
  let WETH: IERC20;
  let USDC: IERC20;
  let Cauldron: CauldronV2;
  let Oracle: IOracle;
  let PLPSwapper: PopsicleUSDCWETHSwapper;
  let PLPLevSwapper: PopsicleUSDCWETHLevSwapper;
  let DegenBox: BentoBoxV1;
  let mimShare: BigNumber;
  let plpShare: BigNumber;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            blockNumber: 13557427,
          },
        },
      ],
    });

    await deployments.fixture(["PopsicleUSDCWETH"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("PopsicleUSDCWETHCauldron")).address);
    Oracle = await ethers.getContract<IOracle>("PopsicleUSDCWETHOracle");
    DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
    PLP = await ethers.getContractAt<IPopsicle>("IPopsicle", "0xaE7b92C8B14E7bdB523408aE0A6fFbf3f589adD9");

    USDC = await ethers.getContractAt<IERC20>("ERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    WETH = await ethers.getContractAt<IERC20>("ERC20", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    PLPSwapper = await ethers.getContract<PopsicleUSDCWETHSwapper>("PopsicleUSDCWETHSwapper");
    PLPLevSwapper = await ethers.getContract<PopsicleUSDCWETHLevSwapper>("PopsicleUSDCWETHLevSwapper");

    await impersonate(MIM_WHALE);
    await impersonate(USDC_WETH_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const usdcWethWhaleSigner = await ethers.getSigner(USDC_WETH_WHALE);

    await USDC.connect(usdcWethWhaleSigner).approve(PLP.address, ethers.constants.MaxUint256);
    await WETH.connect(usdcWethWhaleSigner).approve(PLP.address, ethers.constants.MaxUint256);
    await PLP.connect(usdcWethWhaleSigner).deposit(getBigNumber(5_000_000, 6), getBigNumber(115), USDC_WETH_WHALE);

    const plpAmount = await PLP.balanceOf(USDC_WETH_WHALE);
    console.log("plpAmount", plpAmount.toString());

    // Deposit plp in DegenBox for PopsicleUSDCWETHSwapper
    plpShare = await DegenBox.toShare(PLP.address, plpAmount, true);
    await PLP.connect(usdcWethWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(usdcWethWhaleSigner).deposit(PLP.address, USDC_WETH_WHALE, PLPSwapper.address, 0, plpShare);

    // Deposit MIM in DegenBox for PLPLevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, PLPLevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should liquidate the USDC/WETH PLP collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountCollateralBefore = (await DegenBox.totals(PLP.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await PLPSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, plpShare);

    const amountCollateralAfter = (await DegenBox.totals(PLP.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${amountMimAfter.sub(amountMimBefore).toString()} MIM from Liquidation Swapper`);

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  });

  it("should swap MIM for USDC/WETH PLP and deposit back to degenbox", async () => {
    const mimShares = [
      mimShare,
      mimShare.div(5),
      mimShare.div(10),
      mimShare.div(20),
      mimShare.div(100),
      mimShare.div(1000),
      mimShare.div(10000),
      mimShare.div(100000),
    ];
    const { alice } = await getNamedAccounts();

    for (let i = 0; i < mimShares.length; i++) {
      const shareAmount = mimShares[i];
      console.log(` > From ${ethers.utils.formatEther(shareAmount)} MIM shares`);

      const amountCollateralBefore = (await DegenBox.totals(PLP.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      const estimateGas = await PLPLevSwapper.estimateGas.swap(alice, 0, shareAmount);
      await PLPLevSwapper.swap(alice, 0, shareAmount);

      const amountCollateralAfter = (await DegenBox.totals(PLP.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      console.log(`Got ${ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore))} PLP from Leverage Swapper`);

      console.log(
        "Remaining in the swapping contract:",
        ethers.utils.formatUnits(await USDC.balanceOf(PLPLevSwapper.address), 6),
        "USDC, ",
        ethers.utils.formatEther(await USDC.balanceOf(PLPLevSwapper.address)),
        "WETH"
      );

      console.log("Gas Cost", estimateGas.toString());
      expect(amountMimAfter).to.be.lt(amountMimBefore);
      expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

      await network.provider.send("evm_revert", [snapshotId]);
    }
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);

    expect(await Cauldron.collateral()).to.eq(PLP.address);
    expect(await Cauldron.oracle()).to.eq(Oracle.address);
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
  });
});
