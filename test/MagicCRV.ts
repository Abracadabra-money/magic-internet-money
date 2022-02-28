import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { ChainId, impersonate } from "../utilities";
import { CRVLocker, CurveVoter, IERC20, MagicCRV } from "../typechain";
import { ISmartWalletWhitelist } from "../typechain/ISmartWalletWhitelist";

const CrvWhale = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";

describe("MagicCRV", async () => {
  let snapshotId;
  let CurveVoter: CurveVoter;
  let CRVLocker: CRVLocker;
  let MagicCRV: MagicCRV;
  let CRV: IERC20;
  let deployerSigner;

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

    const crvWhaleSigner = await ethers.getSigner(CrvWhale);
    CRV = await ethers.getContractAt<IERC20>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");

    await impersonate(CrvWhale);
    await CRV.connect(crvWhaleSigner).transfer(alice, (await CRV.balanceOf(CrvWhale)).div(2));

    CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
    CRVLocker = await ethers.getContract<CRVLocker>("CRVLocker");
    MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");

    const aliceSigner = await ethers.getSigner(alice);
    await CRV.connect(aliceSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);

    // Authorize voter smart contract
    await impersonate(CurveDao);
    const curveDaoSigner = await ethers.getSigner(CurveDao);
    const Whitelist = await ethers.getContractAt<ISmartWalletWhitelist>("ISmartWalletWhitelist", CurveSmartWalletWhitelist);
    await Whitelist.connect(curveDaoSigner).approveWallet(CurveVoter.address);
    expect(await Whitelist.check(CurveVoter.address)).to.be.true;

    const balance = await CRV.balanceOf(alice);
    await expect(MagicCRV.connect(aliceSigner).deposit(balance)).to.be.revertedWith("No existing lock found");

    // Create initial lock
    await CRV.connect(crvWhaleSigner).transfer(CurveVoter.address, 1);
    await CurveVoter.createMaxLock(1);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should deposit CRV and receive the same amount in magicCRV tokens", async () => {
    const [, alice] = await ethers.getSigners();

    const totalSupplyBefore = await MagicCRV.totalSupply();
    const crvBefore = await CRV.balanceOf(alice.address);
    const mCRVBefore = await MagicCRV.balanceOf(alice.address);

    await MagicCRV.connect(alice).deposit(crvBefore);
    const crvAfter = await CRV.balanceOf(alice.address);
    const mCRVAfter = await MagicCRV.balanceOf(alice.address);
    const totalSupplyAfter = await MagicCRV.totalSupply();

    expect(crvAfter).to.be.eq(0);
    expect(mCRVAfter.sub(mCRVBefore)).to.be.eq(crvBefore);
    expect(totalSupplyAfter.sub(totalSupplyBefore)).to.be.eq(crvBefore);
  });
});
