const { expect } = require("chai")
const { getBigNumber, createFixture } = require("@sushiswap/hardhat-framework")

describe("PeggedOracle", function () {
    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy("oracle", "PeggedOracle")
            this.oracleData = await this.oracle.getDataParameter(getBigNumber(1))
        })
    })

    beforeEach(async function () {
        cmd = await fixture()
    })

    it("Assigns name to Pegged", async function () {
        expect(await this.oracle.name(this.oracleData)).to.equal("Pegged")
    })

    it("Assigns symbol to PEG", async function () {
        expect(await this.oracle.symbol(this.oracleData)).to.equal("PEG")
    })

    it("should return 1e18 on rate request", async function () {
        const [success, rate] = await this.oracle.peek(this.oracleData)
        expect(success).to.be.true
        expect(rate).to.be.equal(getBigNumber(1))
    })
})
