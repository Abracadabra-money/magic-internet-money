import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { ChainId } from "../utilities";
import { MultichainWithdrawer } from "../typechain";
describe("Boba / Moonriver Fork Tests", async () => {
  it("should fork Boba", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://mainnet.boba.network/",
            blockNumber: 207485,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Boba.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    const Withdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

    expect(Withdrawer.address).to.not.eq(ethers.constants.AddressZero);
  });

  it("should fork Moonriver", async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://rpc.moonriver.moonbeam.network",
            blockNumber: 1008990,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Moonriver.toString());
    await deployments.fixture(["MultichainWithdrawer"]);
    const { deployer } = await getNamedAccounts();
    const Withdrawer = await ethers.getContract<MultichainWithdrawer>("MultichainWithdrawer");

    expect(Withdrawer.address).to.not.eq(ethers.constants.AddressZero);
  });
});
