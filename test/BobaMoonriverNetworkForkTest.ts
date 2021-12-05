import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { ChainId } from "../utilities";
import { ERC20, MultichainWithdrawer } from "../typechain";
describe("Boba / Moonriver Fork Tests", async () => {
  it("should fork Moonriver", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://rpc.moonriver.moonbeam.network",
            blockNumber: 1022585,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Moonriver.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    const Withdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

    const USDC = await ethers.getContractAt<ERC20>("ERC20", "0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D");
    console.log((await USDC.totalSupply()).toString());
    
    expect(Withdrawer.address).to.not.eq(ethers.constants.AddressZero);
  });

  it("should fork Boba", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://lightning-replica.boba.network/",
            blockNumber: 207485,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Boba.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    const Withdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

    const USDC = await ethers.getContractAt<ERC20>("ERC20", "0x66a2A913e447d6b4BF33EFbec43aAeF87890FBbc");
    console.log((await USDC.totalSupply()).toString());
    expect(Withdrawer.address).to.not.eq(ethers.constants.AddressZero);
  });
});
