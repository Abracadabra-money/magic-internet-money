import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";

import { advanceTime, getBigNumber, impersonate } from "../utilities";
import { Cauldron, CauldronV2, EthereumWithdrawer, IERC20, SSpell } from "../typechain";
import { EthereumMIMDeployer } from "./constants";

const MimProvider = "0x5f0DeE98360d8200b20812e174d139A1a633EDd2";

const CauldronMasterContracts = [
  "0x63905bb681b9e68682f392Df2B22B7170F78D300", // CauldronV2Flat
  "0x1DF188958A8674B5177f77667b8D173c3CdD9e51", // CauldronV2CheckpointV1
  "0x469a991a6bB8cbBfEe42E7aB846eDEef1bc0B3d3", // CauldronLowRiskV1
  "0x4a9Cb5D0B755275Fd188f87c0A8DF531B0C7c7D2", // CauldronMediumRiskV1
  "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F", // Cauldron V2
];

describe("Ethereum Cauldron Fee Withdrawer", async () => {
  let snapshotId;
  let Withdrawer: EthereumWithdrawer;
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
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 13718364,
          },
        },
      ],
    });

    await deployments.fixture(["EthereumWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
    SPELL = await ethers.getContractAt<IERC20>("ERC20", "0x090185f2135308BaD17527004364eBcC2D37e5F6");
    sSPELL = await ethers.getContractAt<IERC20>("ERC20", "0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9");

    Withdrawer = await ethers.getContract<EthereumWithdrawer>("EthereumWithdrawer");

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
    await Withdrawer.withdraw(true);
    const mimAfter = await MIM.balanceOf(Withdrawer.address);

    expect(mimAfter).to.be.gt(mimBefore);

    console.log("MIM Withdrawn:", mimAfter.sub(mimBefore).toString());
  });

  it("should be able to rescue token", async () => {
    const { deployer } = await getNamedAccounts();
    const mimBefore = await MIM.balanceOf(deployer);
    await Withdrawer.withdraw(true);

    const amountToRescue = await MIM.balanceOf(Withdrawer.address);
    await Withdrawer.connect(deployerSigner).rescueTokens(MIM.address, deployer, amountToRescue);
    const mimAfter = await MIM.balanceOf(deployer);
    expect(mimAfter.sub(mimBefore)).to.eq(amountToRescue);
  });

  it("should not allow swapping from unauthorized account", async () => {
    const { alice } = await getNamedAccounts();
    const aliceSigner = await ethers.getSigner(alice);
    const tx = Withdrawer.connect(aliceSigner).swapMimForSpell(0, 0, 0, 0, false);
    await expect(tx).to.be.revertedWith("Only verified operators");
  });

  it("should swap the whole mim balance in multiple steps", async () => {
    await Withdrawer.withdraw(true);
    const withdrawnMimAmount = await MIM.balanceOf(Withdrawer.address);

    const swap = async (mimToSwapOnSushi, mimToSwapOnUniswap) => {
      console.log(`Swapping ${mimToSwapOnSushi.toString()} MIM on sushiswap and ${mimToSwapOnUniswap.toString()} MIM on uniswap...`);
      const mimBefore = await MIM.balanceOf(Withdrawer.address);
      const totalSwapped = mimToSwapOnSushi.add(mimToSwapOnUniswap);

      await Withdrawer.swapMimForSpell(mimToSwapOnSushi, mimToSwapOnUniswap, 0, 0, true);
      const mimAfter = await MIM.balanceOf(Withdrawer.address);
      expect(mimBefore.sub(mimAfter)).to.eq(totalSwapped);
    };

    const spellAmountinSSpellBefore = await SPELL.balanceOf(sSPELL.address);
    let mimAmount = await MIM.balanceOf(Withdrawer.address);
    await swap(mimAmount.mul(10).div(100), mimAmount.mul(20).div(100));

    mimAmount = await MIM.balanceOf(Withdrawer.address);
    await swap(mimAmount.div(2), getBigNumber(0));

    mimAmount = await MIM.balanceOf(Withdrawer.address);
    await swap(getBigNumber(0), mimAmount);
    const spellAmountinSSpellAfter = await SPELL.balanceOf(sSPELL.address);

    const spellBought = spellAmountinSSpellAfter.sub(spellAmountinSSpellBefore);
    console.log(
      `Swapped ${ethers.utils.formatUnits(withdrawnMimAmount)} MIM to ${ethers.utils.formatUnits(
        spellBought
      )} SPELL into sSPELL for an avg price of ${(parseInt(withdrawnMimAmount.toString()) / parseInt(spellBought.toString())).toFixed(4)} MIM`
    );
    const mimBalance = await MIM.balanceOf(Withdrawer.address);
    expect(mimBalance).eq(0);
  });

  it("should prevent frontrunning when swapping", async () => {
    await Withdrawer.withdraw(true);
    const withdrawnMimAmount = await MIM.balanceOf(Withdrawer.address);

    await expect(Withdrawer.swapMimForSpell(0, withdrawnMimAmount, 0, ethers.constants.MaxUint256, true)).to.be.revertedWith(
      "Too little received"
    );
    await expect(Withdrawer.swapMimForSpell(withdrawnMimAmount, 0, ethers.constants.MaxUint256, 0, true)).to.be.revertedWith(
      "Too little received"
    );

    await expect(
      Withdrawer.swapMimForSpell(withdrawnMimAmount.div(2), withdrawnMimAmount.div(2), getBigNumber(100), ethers.constants.MaxUint256, true)
    ).to.be.revertedWith("Too little received");
    await expect(
      Withdrawer.swapMimForSpell(withdrawnMimAmount.div(2), withdrawnMimAmount.div(2), ethers.constants.MaxUint256, getBigNumber(100), true)
    ).to.be.revertedWith("Too little received");

    await expect(Withdrawer.swapMimForSpell(withdrawnMimAmount.div(2), withdrawnMimAmount.div(2), 0, 0, true)).to.not.be.revertedWith(
      "Too little received"
    );
  });
});
