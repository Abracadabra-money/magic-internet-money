const { deployments, ethers } = require("hardhat")
const { expect, assert } = require("chai")
const { ADDRESS_ZERO, getApprovalDigest, getDomainSeparator, createFixture } = require("@sushiswap/hardhat-framework")
const { ecsign } = require("ethereumjs-util")

let cmd, fixture

describe("ERC20", function () {
    before(async function () {
        fixture = await createFixture(deployments, this, async (cmd) => {
            await cmd.deploy("weth9", "WETH9Mock")
            await cmd.deploy("token", "ERC20Mock", 10000)
        })
    })

    beforeEach(async function () {
        cmd = await fixture()
    })

    // You can nest describe calls to create subsections.
    describe("Deployment", function () {
        it("Assigns the total supply of tokens to the alice", async function () {
            const ownerBalance = await this.token.balanceOf(this.alice.address)
            expect(await this.token.totalSupply()).to.equal(ownerBalance)
        })

        it("Succeeds in creating over 2^256 - 1 (max) tokens", async function () {
            // 2^256 - 1
            const token = await cmd.deploy(
                "tokenTest",
                "ERC20Mock",
                "115792089237316195423570985008687907853269984665640564039457584007913129639935"
            )
            expect(await token.totalSupply()).to.be.equal("115792089237316195423570985008687907853269984665640564039457584007913129639935")
        })
    })

    describe("Transfer", function () {
        it("Succeeds transfering 10000 tokens from alice to bob", async function () {
            await expect(() => this.token.transfer(this.bob.address, 10000)).to.changeTokenBalances(
                this.token,
                [this.alice, this.bob],
                [-10000, 10000]
            )
        })

        it("Returns true on success", async function () {
            expect(await this.token.callStatic.transfer(this.bob.address, 10000)).to.be.true
        })

        it("Fails transfering 10001 tokens from alice to bob", async function () {
            await expect(this.token.transfer(this.bob.address, 10001)).to.be.revertedWith("ERC20: balance too low")
        })

        it("Succeeds for zero value transfer", async function () {
            await expect(() => this.token.transfer(this.bob.address, 0)).to.changeTokenBalances(this.token, [this.alice, this.bob], [-0, 0])
        })

        it("Emits Transfer event with expected arguments", async function () {
            await expect(this.token.transfer(this.bob.address, 2666))
                .to.emit(this.token, "Transfer")
                .withArgs(this.alice.address, this.bob.address, 2666)
        })

        it("Emits Transfer event with expected arguments for zero value transfer ", async function () {
            await expect(this.token.transfer(this.bob.address, 0))
                .to.emit(this.token, "Transfer")
                .withArgs(this.alice.address, this.bob.address, 0)
        })
    })

    describe("TransferFrom", function () {
        it("transferFrom should fail if balance is too low", async function () {
            await expect(this.token.transferFrom(this.alice.address, this.bob.address, 10001)).to.be.revertedWith("ERC20: balance too low")
        })
    })

    describe("Approve", function () {
        it("approvals: msg.sender should approve 100 to this.bob.address", async function () {
            await this.token.approve(this.bob.address, 100)
            expect(await this.token.allowance(this.alice.address, this.bob.address)).to.equal(100)
        })

        it("approvals: msg.sender approves this.bob.address of 100 & withdraws 20 once.", async function () {
            const balance0 = await this.token.balanceOf(this.alice.address)
            assert.strictEqual(balance0, 10000)

            await this.token.approve(this.bob.address, 100) // 100
            const balance2 = await this.token.balanceOf(this.carol.address)
            assert.strictEqual(balance2, 0, "balance2 not correct")

            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 20, {
                from: this.bob.address,
            }) // -20
            const allowance01 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance01, 80) // =80

            const balance22 = await this.token.balanceOf(this.carol.address)
            assert.strictEqual(balance22, 20)

            const balance02 = await this.token.balanceOf(this.alice.address)
            assert.strictEqual(balance02, 9980)
        })

        // should approve 100 of msg.sender & withdraw 50, twice. (should succeed)
        it("approvals: msg.sender approves this.bob.address of 100 & withdraws 20 twice.", async function () {
            await this.token.approve(this.bob.address, 100)
            const allowance01 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance01, 100)

            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 20, {
                from: this.bob.address,
            })
            const allowance012 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance012, 80)

            const balance2 = await this.token.balanceOf(this.carol.address)
            assert.strictEqual(balance2, 20)

            const balance0 = await this.token.balanceOf(this.alice.address)
            assert.strictEqual(balance0, 9980)

            // FIRST tx done.
            // onto next.
            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 20, {
                from: this.bob.address,
            })
            const allowance013 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance013, 60)

            const balance22 = await this.token.balanceOf(this.carol.address)
            assert.strictEqual(balance22, 40)

            const balance02 = await this.token.balanceOf(this.alice.address)
            assert.strictEqual(balance02, 9960)
        })

        // should approve 100 of msg.sender & withdraw 50 & 60 (should fail).
        it("approvals: msg.sender approves this.bob.address of 100 & withdraws 50 & 60 (2nd tx should fail)", async function () {
            await this.token.approve(this.bob.address, 100)
            const allowance01 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance01, 100)

            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 50, {
                from: this.bob.address,
            })
            const allowance012 = await this.token.allowance(this.alice.address, this.bob.address)
            assert.strictEqual(allowance012, 50)

            const balance2 = await this.token.balanceOf(this.carol.address)
            assert.strictEqual(balance2, 50)

            let balance0 = await this.token.balanceOf(this.alice.address)
            assert.strictEqual(balance0, 9950)

            await expect(
                this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 60, {
                    from: this.bob.address,
                })
            ).to.be.revertedWith("ERC20: allowance too low")
        })

        it("approvals: attempt withdrawal from account with no allowance (should fail)", async function () {
            await expect(
                this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 60, {
                    from: this.bob.address,
                })
            ).to.be.revertedWith("ERC20: allowance too low")
        })

        it("approvals: allow this.bob.address 100 to withdraw from this.alice.address. Withdraw 60 and then approve 0 & attempt transfer.", async function () {
            await this.token.approve(this.bob.address, 100)
            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 60, {
                from: this.bob.address,
            })
            await this.token.approve(this.bob.address, 0)

            await expect(
                this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 10, {
                    from: this.bob.address,
                })
            ).to.be.revertedWith("ERC20: allowance too low")
        })

        it("approvals: approve max (2^256 - 1)", async function () {
            await this.token.approve(this.bob.address, "115792089237316195423570985008687907853269984665640564039457584007913129639935")

            expect(await this.token.allowance(this.alice.address, this.bob.address)).to.equal(
                "115792089237316195423570985008687907853269984665640564039457584007913129639935"
            )
        })

        // should approve max of msg.sender & withdraw 20 with changing allowance (should succeed).
        it("approvals: msg.sender approves this.bob.address of max (2^256 - 1) & withdraws 20", async function () {
            const balance0 = await this.token.balanceOf(this.alice.address)
            expect(balance0).to.equal(10000)

            const max = "115792089237316195423570985008687907853269984665640564039457584007913129639935"
            await this.token.approve(this.bob.address, max)
            const balance2 = await this.token.balanceOf(this.carol.address)
            expect(balance2).to.equal(0)

            await this.token.connect(this.bob).transferFrom(this.alice.address, this.carol.address, 20, {
                from: this.bob.address,
            })

            const allowance01 = await this.token.allowance(this.alice.address, this.bob.address)
            expect(allowance01).to.equal(max)

            const balance22 = await this.token.balanceOf(this.carol.address)
            expect(balance22).to.equal(20)

            const balance02 = await this.token.balanceOf(this.alice.address)
            expect(balance02).to.equal(9980)
        })

        it("Emits Approval event with expected arguments", async function () {
            await expect(
                this.token.connect(this.alice).approve(this.bob.address, "2666", {
                    from: this.alice.address,
                })
            )
                .to.emit(this.token, "Approval")
                .withArgs(this.alice.address, this.bob.address, 2666)
        })
    })

    describe("Permit", function () {
        // This is a test of our utility function.
        it("Returns correct DOMAIN_SEPARATOR for token and chainId", async function () {
            expect(await this.token.DOMAIN_SEPARATOR()).to.be.equal(getDomainSeparator(this.token.address, this.bob.provider._network.chainId))
        })

        it("Reverts when address zero is passed as alice argument", async function () {
            const nonce = await this.token.nonces(this.carol.address)

            const deadline = (await this.bob.provider._internalBlockNumber).respTime + 10000

            const digest = await getApprovalDigest(
                this.token,
                {
                    owner: this.carol.address,
                    spender: this.bob.address,
                    value: 1,
                },
                nonce,
                deadline,
                this.bob.provider._network.chainId
            )

            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(this.carolPrivateKey.replace("0x", ""), "hex"))

            await expect(
                this.token.connect(this.carol).permit(ADDRESS_ZERO, this.bob.address, 1, deadline, v, r, s, {
                    from: this.carol.address,
                })
            ).to.be.revertedWith("Owner cannot be 0")
        })

        it("Succeessfully executes a permit", async function () {
            const nonce = await this.token.nonces(this.carol.address)

            const deadline = (await this.bob.provider._internalBlockNumber).respTime + 10000

            const digest = await getApprovalDigest(
                this.token,
                {
                    owner: this.carol.address,
                    spender: this.bob.address,
                    value: 1,
                },
                nonce,
                deadline,
                this.bob.provider._network.chainId
            )
            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(this.carolPrivateKey.replace("0x", ""), "hex"))

            await this.token.connect(this.carol).permit(this.carol.address, this.bob.address, 1, deadline, v, r, s, {
                from: this.carol.address,
            })
        })

        it("Emits Approval event with expected arguments on successful execution of permit", async function () {
            const nonce = await this.token.nonces(this.carol.address)

            const deadline = (await this.bob.provider._internalBlockNumber).respTime + 10000

            const digest = await getApprovalDigest(
                this.token,
                {
                    owner: this.carol.address,
                    spender: this.bob.address,
                    value: 1,
                },
                nonce,
                deadline,
                this.bob.provider._network.chainId
            )

            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(this.carolPrivateKey.replace("0x", ""), "hex"))

            await expect(
                this.token.connect(this.carol).permit(this.carol.address, this.bob.address, 1, deadline, v, r, s, {
                    from: this.carol.address,
                })
            )
                .to.emit(this.token, "Approval")
                .withArgs(this.carol.address, this.bob.address, 1)
        })

        it("Reverts on expired deadline", async function () {
            let nonce = await this.token.nonces(this.carol.address)

            const deadline = 0

            const digest = await getApprovalDigest(
                this.token,
                {
                    owner: this.carol.address,
                    spender: this.bob.address,
                    value: 1,
                },
                nonce,
                deadline,
                this.bob.provider._network.chainId
            )
            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(this.carolPrivateKey.replace("0x", ""), "hex"))

            await expect(
                this.token.connect(this.carol).permit(this.carol.address, this.bob.address, 1, deadline, v, r, s, {
                    from: this.carol.address,
                })
            ).to.be.revertedWith("Expired")
        })

        it("Reverts on invalid signiture", async function () {
            let nonce = await this.token.nonces(this.carol.address)

            const deadline = (await this.carol.provider._internalBlockNumber).respTime + 10000

            const digest = await getApprovalDigest(
                this.token,
                {
                    owner: this.carol.address,
                    spender: this.bob.address,
                    value: 1,
                },
                nonce,
                deadline,
                this.bob.provider._network.chainId
            )
            const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(this.carolPrivateKey.replace("0x", ""), "hex"))

            await expect(
                this.token.connect(this.carol).permit(this.carol.address, this.bob.address, 10, deadline, v, r, s, {
                    from: this.carol.address,
                })
            ).to.be.revertedWith("Invalid Signature")
        })
    })
})
