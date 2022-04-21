/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "ethers";

// Top holders at the given fork block
const MIM_WHALE = "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C";
const USDCAVAX_LP_WHALE = "0x4483f0b6e2F5486D06958C20f8C39A7aBe87bf8F";

const LIQUIDATION_LP_AMOUNT = getBigNumber(1, 17);
const LEVERAGE_MIM_AMOUNT = getBigNumber(4_000_000);

describe("Lev/Liquidation UsdcAvax Swappers V2", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let USDCAVAX: ERC20Mock;
  let UsdceAvaxSwapperV1: ISwapperGeneric;
  let UsdceAvaxLevSwapperV1: ILevSwapperGeneric;
  let UsdceAvaxSwapperV2: ISwapperGeneric;
  let UsdceAvaxLevSwapperV2: ILevSwapperGeneric;
  let DegenBox: DegenBox;
  let ProxyOracle: IOracle;
  let mimShare: BigNumber;
  let collateralShare: BigNumber;
  let mimWhaleSigner;
  let usdcAvaxWhaleSigner;
  let collateralPrice;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 13687582,
          },
        },
      ],
    });
    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["PopsicleUsdceWavaxV2"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    UsdceAvaxSwapperV1 = await ethers.getContractAt<ISwapperGeneric>("ISwapperGeneric", "0x4Ec0000Da67399AfCf4Ad04dA6089AFD63bEf901");
    UsdceAvaxLevSwapperV1 = await ethers.getContractAt<ILevSwapperGeneric>("ILevSwapperGeneric", "0xc845C5bAf57f61eB925D400AeBff0501C0e9d2Ba");
    UsdceAvaxSwapperV2 = await ethers.getContract<ISwapperGeneric>("PopsicleUsdcAvaxSwapperV2");
    UsdceAvaxLevSwapperV2 = await ethers.getContract<ILevSwapperGeneric>("PopsicleUsdcAvaxLevSwapperV2");

    ProxyOracle = await ethers.getContractAt<IOracle>("IOracle", "0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85");
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4");
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    USDCAVAX = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1");

    await impersonate(MIM_WHALE);
    await impersonate(USDCAVAX_LP_WHALE);

    mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    usdcAvaxWhaleSigner = await ethers.getSigner(USDCAVAX_LP_WHALE);

    const spot = await ProxyOracle.peekSpot("0x");
    collateralPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
    console.log(`Collateral Price = $${collateralPrice} usd`);
  });

  const leverageSwap = async (collateral: ERC20Mock, levSwapper: ILevSwapperGeneric) => {
    const mimShares = [
      // cannot use full mimShare as we are the only depositor on limone
      // mimShare
      mimShare.div(2),
      mimShare.div(5),
      mimShare.div(10),
      mimShare.div(20),
    ];
    const { alice } = await getNamedAccounts();

    for (let i = 0; i < mimShares.length; i++) {
      const shareAmount = mimShares[i];
      console.log(` > From ${parseFloat(ethers.utils.formatEther(shareAmount)).toLocaleString()} MIM shares`);

      const amountCollateralBefore = (await DegenBox.totals(collateral.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      const estimateGas = await levSwapper.estimateGas.swap(alice, 0, shareAmount);
      await levSwapper.swap(alice, 0, shareAmount);
      const amountCollateralAfter = (await DegenBox.totals(collateral.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
      console.log(`Got ${amountOut.toLocaleString()} Token from Leverage Swapper ($${(collateralPrice * amountOut).toLocaleString()})`);
      console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

      expect(amountMimAfter).to.be.lt(amountMimBefore);
      expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

      await network.provider.send("evm_revert", [snapshotId]);
    }
  };

  const liquidationSwap = async (collateral: ERC20Mock, swapper: ISwapperGeneric) => {
    const { alice } = await getNamedAccounts();

    const collateralAmount = await DegenBox.toAmount(collateral.address, collateralShare, false);
    const totalLiquidationPrice = collateralPrice * parseFloat(ethers.utils.formatEther(collateralAmount));

    console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of collateral tokens...`);
    const amountCollateralBefore = (await DegenBox.totals(collateral.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

    const amountCollateralAfter = (await DegenBox.totals(collateral.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(
      `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
    );

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  };

  const setup = async (swapper: ISwapperGeneric, levSwapper: ILevSwapperGeneric) => {
    // Deposit collateral for liquidation swapper
    collateralShare = await DegenBox.toShare(MIM.address, LIQUIDATION_LP_AMOUNT, true);
    await USDCAVAX.connect(usdcAvaxWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(usdcAvaxWhaleSigner).deposit(USDCAVAX.address, USDCAVAX_LP_WHALE, swapper.address, 0, collateralShare);

    // Deposit MIM in DegenBox for leverage swapper
    mimShare = await DegenBox.toShare(MIM.address, LEVERAGE_MIM_AMOUNT, true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, levSwapper.address, 0, mimShare);
  };

  xdescribe("Using V1", () => {
    before(async () => {
      await setup(UsdceAvaxSwapperV1, UsdceAvaxLevSwapperV1);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox", async () => {
      await liquidationSwap(USDCAVAX, UsdceAvaxSwapperV1);
    });

    it("should swap MIM for USDC.e/AVAX and deposit back to degenbox", async () => {
      await leverageSwap(USDCAVAX, UsdceAvaxLevSwapperV1);
    });
  });

  /**
    V1 Results:
    Liquidating for $2,171,035.702 worth of collateral tokens...
      Got 1,611,009.403 MIM from Liquidation Swapper
            √ should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox (4427ms)
      > From 2,000,000 MIM shares
      Got 0.07 Token from Leverage Swapper ($1,508,469.54)
      Gas Cost 405,367
      > From 800,000 MIM shares
      Got 0.032 Token from Leverage Swapper ($705,204.97)
      Gas Cost 405,364
      > From 400,000 MIM shares
      Got 0.014 Token from Leverage Swapper ($296,170.719)
      Gas Cost 370,916
      > From 200,000 MIM shares
      Got 0.006 Token from Leverage Swapper ($136,546.616)
      Gas Cost 370,916
   */
  describe("Using V2", () => {
    before(async () => {
      await setup(UsdceAvaxSwapperV2, UsdceAvaxLevSwapperV2);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox", async () => {
      await liquidationSwap(USDCAVAX, UsdceAvaxSwapperV2);
    });

    it("should swap MIM for USDC.e/AVAX and deposit back to degenbox", async () => {
      await leverageSwap(USDCAVAX, UsdceAvaxLevSwapperV2);
    });
  });
});
