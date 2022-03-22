import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { advanceTime, ChainId, duration, getBigNumber, impersonate } from "../utilities";
import { CurveVoter, DegenBox, ERC20Mock, IFeeDistributor, MagicCRV, ISmartWalletWhitelist } from "../typechain";

const CrvWhale = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const Crv3Whale = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";

describe("MagicCRV", async () => {
  let snapshotId;
  let CurveVoter: CurveVoter;
  let MagicCRV: MagicCRV;
  let CRV: ERC20Mock;
  let CRV3: ERC20Mock;
  let FeeDistibutor: IFeeDistributor;
  let DegenBox: DegenBox;
  let deployerSigner;
  let curveDaoSigner;
  let crvWhaleSigner;
  let crv3WhaleSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14296556,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["MagicCRV"]);
    const { deployer, alice } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    crvWhaleSigner = await ethers.getSigner(CrvWhale);
    crv3WhaleSigner = await ethers.getSigner(Crv3Whale);

    CRV = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");
    CRV3 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490");
    FeeDistibutor = await ethers.getContractAt<IFeeDistributor>("IFeeDistributor", "0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc");

    await impersonate(CrvWhale);
    await impersonate(Crv3Whale);
    await CRV.connect(crvWhaleSigner).transfer(alice, (await CRV.balanceOf(CrvWhale)).div(2));

    CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
    MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");

    const aliceSigner = await ethers.getSigner(alice);
    await CRV.connect(aliceSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);

    // Authorize voter smart contract
    await impersonate(CurveDao);
    curveDaoSigner = await ethers.getSigner(CurveDao);
    const Whitelist = await ethers.getContractAt<ISmartWalletWhitelist>("ISmartWalletWhitelist", CurveSmartWalletWhitelist);
    await Whitelist.connect(curveDaoSigner).approveWallet(CurveVoter.address);
    expect(await Whitelist.check(CurveVoter.address)).to.be.true;

    const balance = await CRV.balanceOf(alice);
    await expect(MagicCRV.connect(aliceSigner).mint(balance)).to.be.revertedWith("No existing lock found");

    await CRV.connect(crvWhaleSigner).transfer(CurveVoter.address, 1);
    await expect(CurveVoter.connect(aliceSigner).createMaxLock(1)).to.be.revertedWith("Ownable: caller is not the owner");

    // Create initial lock
    await CurveVoter.createMaxLock(1);

    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should not be able to create another lock", async () => {
    await expect(CurveVoter.connect(deployerSigner).createMaxLock(1)).to.be.revertedWith("Withdraw old tokens first");
  });

});
