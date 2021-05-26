const { network } = require("hardhat")
const { expect } = require("chai")
const { getBigNumber, createFixture, ADDRESS_ZERO } = require("@sushiswap/hardhat-framework")

let cmd, fixture

describe("ChainLink Oracle", function () {
    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy("oracle", "ChainlinkOracle")
            const SUSHI_ETH = "0xe572CeF69f43c2E488b33924AF04BDacE19079cf"
            this.oracleData = await this.oracle.getDataParameter(SUSHI_ETH, ADDRESS_ZERO, getBigNumber(1, 36))
            this.oracleData2 = await this.oracle.getDataParameter(ADDRESS_ZERO, SUSHI_ETH, getBigNumber(1))
        })
    })

    beforeEach(async function () {
        cmd = await fixture()
    })

    it("Assigns name to Chainlink", async function () {
        expect(await this.oracle.name(this.oracleData)).to.equal("Chainlink")
    })

    it("Assigns symbol to LINK", async function () {
        expect(await this.oracle.symbol(this.oracleData)).to.equal("LINK")
    })

    if (!network.config.forking) {
        console.trace("*** chain forking not available, skipping tests ***")
        return
    }

    it("should return SUSHI Price on rate request", async function () {
        await this.oracle.get(this.oracleData)
        const [success, rate] = await this.oracle.peek(this.oracleData)
        expect(success).to.be.true
        expect(rate).to.be.equal("8323810000000000")
    })

    it("should return ETH Price in SUSHI on rate request", async function () {
        await this.oracle.get(this.oracleData2)
        const [success, rate] = await this.oracle.peek(this.oracleData2)
        expect(success).to.be.true
        expect(rate).to.be.equal("120137292898324204901")
    })
})
