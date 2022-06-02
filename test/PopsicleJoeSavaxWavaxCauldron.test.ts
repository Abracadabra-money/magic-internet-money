/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { CauldronV3, DegenBox, ERC20Mock, ILevSwapperGeneric, ProxyOracle, ISwapperGeneric } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { ParametersPerChain } from "../deploy/PopsicleJoeSavaxWavaxCauldron";
import { Constants } from "./constants";

// Top holders at the given fork block
const MIM_WHALE = "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C";
const FORKBLOCK = 15245643;

// In order:
// 0: name
// 1: hardhat deployment script name
// 2: token whale
// 3: oracle price - Beware that its value is based on the value at FORKBLOCK
const cases = [
  [
    "TraderJoe sAVAX/wAVAX",
    "PopsicleJoeSavaxWavaxCauldron",
    "0x188bED1968b795d5c9022F6a0bb5931Ac4c18F00",
    "21500542291329291",
    ParametersPerChain[ChainId.Avalanche],
  ],
];

forEach(cases).describe("%s Cauldron", async (_name, deploymentName, collateralWhale, oracleExpectedPrice, parameters) => {
  let snapshotId;
  let MIM: ERC20Mock;
  let Collateral: ERC20Mock;
  let Cauldron: CauldronV3;
  let ProxyOracle: ProxyOracle;
  let Swapper: ISwapperGeneric;
  let LevSwapper: ILevSwapperGeneric;
  let DegenBox: DegenBox;
  let mimShare: BigNumber;
  let collateralShare: BigNumber;
  let deployerSigner;
  let tokenPrice;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: FORKBLOCK,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());
    await deployments.fixture([deploymentName]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV3>("CauldronV3", (await ethers.getContract(parameters.cauldronDeploymentName)).address);

    ProxyOracle = await ethers.getContractAt<ProxyOracle>("ProxyOracle", await Cauldron.oracle());
    const spot = await ProxyOracle.peekSpot("0x");
    tokenPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
    console.log(`1 lp = $${tokenPrice.toLocaleString()} usd`);
    console.log("spot: ", spot.toString());
    expect(spot).to.be.eq(oracleExpectedPrice);

    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.fantom.mim);
    Collateral = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.fantom.spiritswap.fUSDTUSDC);

    Swapper = await ethers.getContract<ISwapperGeneric>(parameters.swapperName);
    LevSwapper = await ethers.getContract<ILevSwapperGeneric>(parameters.levSwapperName);

    await impersonate(MIM_WHALE);
    await impersonate(collateralWhale);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const collateralWhaleSigner = await ethers.getSigner(collateralWhale);

    const collateralAmount = (await Collateral.balanceOf(collateralWhale)).div(3);
    collateralShare = await DegenBox.toShare(Collateral.address, collateralAmount, true);
    await Collateral.connect(collateralWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(collateralWhaleSigner).deposit(Collateral.address, collateralWhale, Swapper.address, 0, collateralShare);

    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should liquidate the collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const tokenAmount = await DegenBox.toAmount(Collateral.address, collateralShare, false);
    const totalLiquidationPrice = tokenPrice * parseFloat(ethers.utils.formatEther(tokenAmount));

    console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of collateral...`);
    const amountCollateralBefore = (await DegenBox.totals(Collateral.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

    const amountCollateralAfter = (await DegenBox.totals(Collateral.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(
      `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
    );

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  });

  it("should swap MIM for collateral and deposit back to degenbox", async () => {
    const mimShares = [
      mimShare.div(5),
      mimShare.div(10),
      mimShare.div(20),
      mimShare.div(100),
      mimShare.div(1000),
      mimShare.div(10000),
    ];
    const { alice } = await getNamedAccounts();

    for (let i = 0; i < mimShares.length; i++) {
      const shareAmount = mimShares[i];
      console.log(` > From ${parseFloat(ethers.utils.formatEther(shareAmount)).toLocaleString()} MIM shares`);

      const amountCollateralBefore = (await DegenBox.totals(Collateral.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      const estimateGas = await LevSwapper.estimateGas.swap(alice, 0, shareAmount);
      await LevSwapper.swap(alice, 0, shareAmount);

      const amountCollateralAfter = (await DegenBox.totals(Collateral.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
      console.log(`Got ${amountOut.toFixed(18).toLocaleString()} Collateral Token from Leverage Swapper ($${(tokenPrice * amountOut).toLocaleString()})`);
      console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

      expect(amountMimAfter).to.be.lt(amountMimBefore);
      expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

      await network.provider.send("evm_revert", [snapshotId]);
    }
  });
});
