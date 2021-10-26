const { ethers, deployments } = require("hardhat")
const { expect, assert } = require("chai")
const {
    addr,
    getBigNumber,
    sansBorrowFee,
    sansSafetyAmount,
    advanceBlock,
    ADDRESS_ZERO,
    advanceTime,
    KashiPairPermit,
    setMasterContractApproval,
    setKashiPairContractApproval,
    createFixture,
    KashiPair,
} = require("@sushiswap/hardhat-framework")

let cmd, fixture

async function balances(thisObject, token, address) {
    address = addr(address)
    let txt =
        "Free: " +
        (await token.balanceOf(address)).toString() +
        " - " +
        "Bento Share: " +
        (await thisObject.bentoBox.balanceOf(token.address, address)).toString()

    if (token == thisObject.a) {
        txt = txt + " - Collateral: " + (await thisObject.pairAB.contract.userCollateralShare(address)).toString()
    }

    return txt
}

async function debugInfo(thisObject) {
    console.log("Alice A", await balances(thisObject, thisObject.a, thisObject.alice))
    console.log("Bob A", await balances(thisObject, thisObject.a, thisObject.bob))
    console.log(
        "Swapper Collateral in Bento",
        (await thisObject.bentoBox.balanceOf(thisObject.a.address, thisObject.swapper.address)).toString()
    )
    console.log("Bento Collateral in Bento", (await thisObject.bentoBox.balanceOf(thisObject.a.address, thisObject.bentoBox.address)).toString())
    console.log(
        "Pair Collateral in Bento",
        (await thisObject.bentoBox.balanceOf(thisObject.a.address, thisObject.pairAB.contract.address)).toString()
    )
    console.log()
    console.log("Total Collateral Amount", (await thisObject.bentoBox.totals(thisObject.a.address)).elastic.toString())
    console.log("Total Collateral Share", (await thisObject.bentoBox.totals(thisObject.a.address)).base.toString())
    console.log()
    console.log("Alice Asset in Bento", (await thisObject.bentoBox.balanceOf(thisObject.b.address, thisObject.alice.address)).toString())
    console.log("Bob Asset in Bento", (await thisObject.bentoBox.balanceOf(thisObject.b.address, thisObject.bob.address)).toString())
    console.log("Swapper Asset in Bento", (await thisObject.bentoBox.balanceOf(thisObject.b.address, thisObject.swapper.address)).toString())
    console.log("Bento Asset in Bento", (await thisObject.bentoBox.balanceOf(thisObject.b.address, thisObject.bentoBox.address)).toString())
    console.log(
        "Pair Asset in Bento",
        (await thisObject.bentoBox.balanceOf(thisObject.b.address, thisObject.pairAB.contract.address)).toString()
    )
    console.log()
    console.log("Alice CollateralShare in Pair", (await thisObject.pairAB.contract.userCollateralShare(thisObject.alice.address)).toString())
    console.log("Alice BorrowPart in Pair", (await thisObject.pairAB.contract.userBorrowPart(thisObject.alice.address)).toString())
    console.log("Alice Solvent", (await thisObject.pairAB.contract.isSolvent(thisObject.alice.address, false)).toString())
}

rpcToObj = function (rpc_obj, obj) {
    if (!obj) {
        obj = {}
    }
    for (let i in rpc_obj) {
        if (isNaN(i)) {
            // Not always correct, but overall useful
            try {
                obj[i] = rpc_obj[i].toString()
            } catch (e) {
                console.log("pcToObj error", rpc_obj[i], typeof rpc_obj[i])
            }
        }
    }
    return obj
}

describe("Scenario 1", function () {
    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy("weth9", "WETH9Mock")
            await cmd.deploy("bentoBox", "BentoBoxMock", this.weth9.address)

            await cmd.addToken("a", "Token A", "A", 18, this.ReturnFalseERC20Mock)
            await cmd.addToken("b", "Token B", "B", 8, this.RevertingERC20Mock)
            await cmd.addToken("c", "Token C", "C", 6, this.RevertingERC20Mock)
            await cmd.addToken("d", "Token D", "D", 0, this.RevertingERC20Mock)
            await cmd.addPair("ammpairAB", this.a, this.b, 50000, 50000)
            await cmd.addPair("ammpairAC", this.a, this.c, 50000, 50000)

            await cmd.deploy("kashiPair", "KashiPairMock", this.bentoBox.address)
            await cmd.deploy("oracle", "OracleMock")

            await this.oracle.set(getBigNumber(1, 28))
            this.oracleData = await this.oracle.getDataParameter()
        })
        cmd = await fixture()
    })

    it("Sets up fixtures, tokens, etc", async function () {
        await cmd.addKashiPair("pairAB", this.bentoBox, this.kashiPair, this.a, this.b, this.oracle, this.oracleData)

        // Two different ways to approve the kashiPair
        await setMasterContractApproval(this.bentoBox, this.alice, this.alice, this.alicePrivateKey, this.kashiPair.address, true)
        await setMasterContractApproval(this.bentoBox, this.bob, this.bob, this.bobPrivateKey, this.kashiPair.address, true)

        await this.a.approve(this.bentoBox.address, getBigNumber(1000000))
        await this.b.approve(this.bentoBox.address, getBigNumber(1000000, 8))
        await this.a.connect(this.bob).approve(this.bentoBox.address, getBigNumber(1000000))
        await this.b.connect(this.bob).approve(this.bentoBox.address, getBigNumber(1000000, 8))
        await this.a.connect(this.carol).approve(this.bentoBox.address, getBigNumber(1000000))
        await this.b.connect(this.carol).approve(this.bentoBox.address, getBigNumber(1000000, 8))
    })

    it("should allow adding of balances to the BentoBox", async function () {
        await this.bentoBox.deposit(this.a.address, this.alice.address, this.alice.address, getBigNumber(1000), 0)
        await this.bentoBox.deposit(this.b.address, this.alice.address, this.alice.address, getBigNumber(800, 8), 0)
    })

    /*  it("should allow adding profit to the BentoBox", async function () {
    await this.a.transfer(this.bentoBox.address, getBigNumber(328))
    await this.bentoBox.deposit(this.a.address, this.bentoBox.address, ADDRESS_ZERO, getBigNumber(328), 0)
    await this.b.transfer(this.bentoBox.address, getBigNumber(450))
    await this.bentoBox.deposit(this.b.address, this.bentoBox.address, ADDRESS_ZERO, getBigNumber(450), 0)
  })

  it("should allow adding balance to BentoBox with correct amount/share ratio", async function () {
    await this.bentoBox.connect(this.bob).deposit(this.a.address, this.bob.address, this.bob.address, getBigNumber(500), 0)
  })

  it("should allow adding assets to Lending", async function () {
    await debugInfo(this)

    await this.pairAB.contract.addAsset(this.alice.address, false, getBigNumber(800))

    await debugInfo(this)
  })

  it("should allow adding collateral to Lending", async function () {
    await debugInfo(this)

    await this.pairAB.contract.connect(this.bob).addCollateral(this.bob.address, false, getBigNumber(370))

    await debugInfo(this)
  })

  it("should allow shorting", async function () {
    await debugInfo(this)

    await this.pairAB.as(this.bob).short(this.swapper, getBigNumber(625), 0)

    let info = await this.helper.getPairs(this.bob.address, [this.pairAB.contract.address])
    console.log(rpcToObj(info[0]))
    await debugInfo(this)
  })*/
})
