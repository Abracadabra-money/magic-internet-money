import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, CauldronV2, CauldronV2Checkpoint, ConvexStakingWrapperAbra, ERC20Mock, IConvexStakingWrapperAbra, IERC20, IOracle } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { StkFrax3CrvSwapper } from "../typechain/StkFrax3CrvSwapper";
import { StkFrax3CrvLevSwapper } from "../typechain/StkFrax3CrvLevSwapper";

// Top holders at the given fork block
const MIM_WHALE = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";
const FRAX_3CRV_WHALE = "0xBBbAf1adf4d39B2843928CCa1E65564e5ce99ccC";

describe("Frax3Crv Cauldron", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let Frax3CRV: IERC20;
  let Cauldron: CauldronV2Checkpoint;
  let ProxyOracle: IOracle;
  let Swapper: StkFrax3CrvSwapper;
  let LevSwapper: StkFrax3CrvLevSwapper;
  let BentoBox: BentoBoxV1;
  let ConvextStakingWrapper: ConvexStakingWrapperAbra;
  let mimShare: BigNumber;
  let frax3crvShare: BigNumber;
  let deployerSigner;
  let frax3CrvPrice;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14081761,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["Frax3CrvCauldron"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("Frax3CrvCauldron")).address);
    ProxyOracle = await ethers.getContractAt<IOracle>("IOracle", "0x66a809a31E6909C835219cC09eA0f52135fF0a11");
    BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966");
    ConvextStakingWrapper = await ethers.getContractAt<IConvexStakingWrapperAbra>("IConvexStakingWrapperAbra", "0xb24BE15aB68DC8bC5CC62183Af1eBE9Ecd043250");
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
    Frax3CRV = await ethers.getContractAt<IERC20>("ERC20Mock", "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B");

    await impersonate(MIM_WHALE);
    await impersonate(FRAX_3CRV_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const frax3crvWhaleSigner = await ethers.getSigner(FRAX_3CRV_WHALE);
    const frax3crvAmount = getBigNumber(1_000_000);

    await Frax3CRV.connect(frax3crvWhaleSigner).approve(ConvextStakingWrapper.address, frax3crvAmount);
    // must have cauldron before deposit and set
    await ConvextStakingWrapper.connect(frax3crvWhaleSigner).deposit(frax3crvAmount, FRAX_3CRV_WHALE);

    expect(await ConvextStakingWrapper.balanceOf(FRAX_3CRV_WHALE)).to.be.eq(frax3crvAmount);

    Swapper = await ethers.getContract<StkFrax3CrvSwapper>("StkFrax3CrvSwapper");
    LevSwapper = await ethers.getContract<StkFrax3CrvLevSwapper>("StkFrax3CrvLevSwapper");

    // Deposit collateral in BentoBox for Frax3CrvSwapper, Convert Frax3Crv to StkFrax3Crv beforehand
    await Frax3CRV.connect(frax3crvWhaleSigner).approve(ConvextStakingWrapper.address, ethers.constants.MaxUint256);
    await ConvextStakingWrapper.connect(frax3crvWhaleSigner).deposit(frax3crvAmount, FRAX_3CRV_WHALE);

    frax3crvShare = await BentoBox.toShare(ConvextStakingWrapper.address, frax3crvAmount, true);
    await ConvextStakingWrapper.connect(frax3crvWhaleSigner).approve(BentoBox.address, ethers.constants.MaxUint256);
    await BentoBox.connect(frax3crvWhaleSigner).deposit(ConvextStakingWrapper.address, FRAX_3CRV_WHALE, Swapper.address, 0, frax3crvShare);

    // Deposit MIM in BentoBox for LevSwapper
    mimShare = await BentoBox.toShare(MIM.address, getBigNumber(5_000_000), true);
    await MIM.connect(mimWhaleSigner).approve(BentoBox.address, ethers.constants.MaxUint256);
    await BentoBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);

    frax3CrvPrice = 1 / parseFloat(ethers.utils.formatEther(await ProxyOracle.peekSpot("0x")));
    console.log(`1 stkcvxFRAX3CRV-f = $${frax3CrvPrice} usd`);
    
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should liquidate the collateral and deposit MIM back to BentoBox", async () => {
    const { alice } = await getNamedAccounts();

    const amountCollateralBefore = (await BentoBox.totals(ConvextStakingWrapper.address)).elastic;
    const amountMimBefore = (await BentoBox.totals(MIM.address)).elastic;

    await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, frax3crvShare);

    const amountCollateralAfter = (await BentoBox.totals(ConvextStakingWrapper.address)).elastic;
    const amountMimAfter = (await BentoBox.totals(MIM.address)).elastic;

    console.log(`Got ${ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))} MIM from Liquidation Swapper`);

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  });

  it("should swap MIM for collateral and deposit back to BentoBox", async () => {
    const { alice } = await getNamedAccounts();

    const shareAmount = mimShare;
    console.log(` > From ${ethers.utils.formatEther(shareAmount)} MIM shares`);

    const amountCollateralBefore = (await BentoBox.totals(ConvextStakingWrapper.address)).elastic;
    const amountMimBefore = (await BentoBox.totals(MIM.address)).elastic;

    const estimateGas = await LevSwapper.estimateGas.swap(alice, 0, shareAmount);
    await LevSwapper.swap(alice, 0, shareAmount);

    const amountCollateralAfter = (await BentoBox.totals(ConvextStakingWrapper.address)).elastic;
    const amountMimAfter = (await BentoBox.totals(MIM.address)).elastic;

    const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
    console.log(`Got ${amountOut} stkFrax3Crv from Leverage Swapper ($${(frax3CrvPrice * amountOut).toLocaleString()})`);
    console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

    await network.provider.send("evm_revert", [snapshotId]);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);

    expect(await Cauldron.collateral()).to.eq(ConvextStakingWrapper.address);
    expect(await Cauldron.oracle()).to.eq(ProxyOracle.address);
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
  });
});
