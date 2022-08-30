/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { BaseStargateLpMimPool, DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, IStargatePool, ISwapperGeneric, MainnetStargateLpMimPool } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ParametersPerChain } from "../deploy/MainnetStargateSwapperV2";

const globalParametersPerChain = {
  [ChainId.Arbitrum]: {
    enabled: false,
    jsonRpcUrl: process.env.ARBITRUM_RPC_URL,
    blockNumber: 10570348,
    mimWhale: "0xf46BB6dDA9709C49EfB918201D97F6474EAc5Aea",
  },
  [ChainId.Mainnet]: {
    enabled: true,
    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
    blockNumber: 14762605,
    mimWhale: "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5",
  },
  [ChainId.Avalanche]: {
    enabled: false,
    jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockNumber: 13882968,
    mimWhale: "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C",
  },
};
// In order:
// 0: name
// 1: collateral whale address
// 2: the maximum collateral token amount to liquidate for MIM
// 3: the maximum MIM amount to leverage for collateral token amount
// 4: oracle price - Beware that its value is based on the value of the plp at FORKBLOCK
const cauldronsPerChain = {
  [ChainId.Mainnet]: [
    ["USDC Pool", "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b"],
    ["USDT Pool", "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b"],
  ],
  [ChainId.Avalanche]: [
    ["USDC Pool", "0x8731d54E9D02c286767d56ac03e8037C07e01e98"],
    ["USDT Pool", "0x8731d54E9D02c286767d56ac03e8037C07e01e98"],
  ],
  [ChainId.Arbitrum]: [
    ["USDC Pool", "0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176"],
    ["USDT Pool", "0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176"],
  ],
};

forEach(Object.keys(cauldronsPerChain)).describe("Stargate ChainId %s Cauldrons", async (_chainId: ChainId) => {
  const globalParameters = globalParametersPerChain[_chainId];
  const cases = ParametersPerChain[_chainId].cauldrons.map((c, index) => [
    ...cauldronsPerChain[_chainId][index],
    c,
    ParametersPerChain[_chainId],
  ]);

  const describeFn = globalParameters.enabled ? "describe" : "xdescribe";

  forEach(cases)[describeFn]("%s Cauldron", async (_name, collateralWhale, cauldronParams, globalCauldronParams) => {
    let snapshotId;
    let MIM: ERC20Mock;
    let MimPool: BaseStargateLpMimPool;
    let CollateralToken: IStargatePool;
    let CollateralTokenAsERC20: ERC20Mock;

    let Swapper: ISwapperGeneric;
    let LevSwapper: ILevSwapperGeneric;
    let DegenBox: DegenBox;
    let ProxyOracle: IOracle;

    let mimShare: BigNumber;
    let collateralShare: BigNumber;
    let mimWhaleSigner;
    let collateralWhaleSigner;
    let collateralPrice;
    let collateralDecimals;

    before(async () => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              enabled: true,
              jsonRpcUrl: globalParameters.jsonRpcUrl,
              blockNumber: globalParameters.blockNumber,
            },
          },
        ],
      });
      hre.getChainId = () => Promise.resolve(_chainId.toString());

      await deployments.fixture(["StargateSwapperV2"]);

      Swapper = await ethers.getContract<ISwapperGeneric>(`Stargate${cauldronParams.deploymentNamePrefix}SwapperV2`);
      ProxyOracle = await ethers.getContractAt<IOracle>("IOracle", cauldronParams.oracle);
      CollateralToken = await ethers.getContractAt<IStargatePool>("IStargatePool", cauldronParams.collateral);
      CollateralTokenAsERC20 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", cauldronParams.collateral);
      MimPool = await ethers.getContract<MainnetStargateLpMimPool>("MainnetStargateLpMimPoolV1");
      DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", globalCauldronParams.degenBox);
      MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", globalCauldronParams.mim);

      await impersonate(globalParameters.mimWhale);
      await impersonate(collateralWhale);

      mimWhaleSigner = await ethers.getSigner(globalParameters.mimWhale);
      collateralWhaleSigner = await ethers.getSigner(collateralWhale);

      collateralDecimals = parseInt((await CollateralToken.localDecimals()).toString());

      const spot = await ProxyOracle.peekSpot("0x");
      collateralPrice = 1 / parseFloat(ethers.utils.formatUnits(spot, collateralDecimals));
      console.log(`Collateral Price = $${collateralPrice} usd`);

      // Deposit collateral for liquidation swapper
      const collateralAmountToLiquidate = await CollateralTokenAsERC20.balanceOf(collateralWhaleSigner.address);
      collateralShare = await DegenBox.toShare(cauldronParams.collateral, collateralAmountToLiquidate, true);
      await CollateralTokenAsERC20.connect(collateralWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(collateralWhaleSigner).deposit(CollateralToken.address, collateralWhale, Swapper.address, 0, collateralShare);

      await MIM.connect(mimWhaleSigner).transfer(MimPool.address, getBigNumber(260_000_000));
      
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the collateral and deposit MIM back to degenbox", async () => {
      const { alice } = await getNamedAccounts();

      const collateralAmount = await DegenBox.toAmount(CollateralToken.address, collateralShare, false);
      const totalLiquidationPrice = collateralPrice * parseFloat(ethers.utils.formatUnits(collateralAmount, collateralDecimals));

      console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of collateral tokens...`);
      const amountCollateralBefore = (await DegenBox.totals(CollateralToken.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

      const amountCollateralAfter = (await DegenBox.totals(CollateralToken.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      console.log(
        `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
      );

      expect(amountMimAfter).to.be.gt(amountMimBefore);
      expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
    });
  });
});
