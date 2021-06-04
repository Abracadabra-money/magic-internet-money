const { weth, getBigNumber } = require("@sushiswap/hardhat-framework")

module.exports = async function (hre) {
    /*
    const factory_abi = [
        {
            inputs: [],
            name: "pairCodeHash",
            outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
            stateMutability: "pure",
            type: "function",
        },
    ]
    */

    const signers = await hre.ethers.getSigners()
    const deployer = signers[0]
    const funder = signers[1]

    console.log("START")

    const chainId = await hre.getChainId()
    if (chainId == "31337" || hre.network.config.forking) {
        return
    }
    if (!weth(chainId)) {
        console.log("No WETH address for chain", chainId)
        return
    }
    console.log("Chain:", chainId)
    console.log("Balance:", (await funder.getBalance()).div("1000000000000000000").toString())
    const deployerBalance = await deployer.getBalance()

    let mimOwner = "0xfddfE525054efaAD204600d00CA86ADb1Cc2ea8a"
    if (chainId == "1") {
        let mimOwner = "0x5f0DeE98360d8200b20812e174d139A1a633EDd2"
    }

    let gasPrice = await funder.provider.getGasPrice()
    if (chainId == 1) {
        gasPrice = gasPrice.add("20000000000")
    }
    let multiplier = hre.network.tags && hre.network.tags.staging ? 2 : 1
    let finalGasPrice = gasPrice.mul(multiplier)

    const gasLimit = 5000000 + 5500000 + 5500000 + 1000000 + 300000 - 2500000
    //gasLimit = 5700000
    if (chainId == "88" || chainId == "89") {
        finalGasPrice = getBigNumber("10000", 9)
    }
    console.log("Gasprice:", gasPrice.toString(), " with multiplier ", multiplier, "final", finalGasPrice.toString())

    /*
    let factory = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"
    if (chainId == "1") {
        factory = "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"
    }

    const initCodeHash = await new ethers.Contract(factory, factory_abi, deployer).pairCodeHash()
    console.log("InitCodeHash is", initCodeHash)
    */

    console.log("Deployer balance", deployerBalance.toString())
    console.log("Needed", finalGasPrice.mul(gasLimit).toString(), finalGasPrice.toString(), gasLimit.toString())
    /*
    if (deployerBalance.lt(finalGasPrice.mul(gasLimit))) {
        console.log("Sending native token to fund deployment:", finalGasPrice.mul(gasLimit).sub(deployerBalance).toString())
        let tx = await funder.sendTransaction({
            to: deployer.address,
            value: finalGasPrice.mul(gasLimit).sub(deployerBalance),
            gasPrice: gasPrice.mul(multiplier),
        })
        await tx.wait()
    }

    /*
    console.log("Deploying MIM contract")
    tx = await hre.deployments.deploy("MagicInternetMoneyV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 2500000,
        gasPrice: finalGasPrice,
    })
    */

    const mim = (await hre.ethers.getContractFactory("MagicInternetMoneyV1")).attach((await deployments.get("MagicInternetMoneyV1")).address)

    const spell = (await hre.ethers.getContractFactory("SpellV1")).attach("0x090185f2135308BaD17527004364eBcC2D37e5F6")

    const bentobox = (await hre.ethers.getContractFactory("BentoBoxV1")).attach("0xF5BCE5077908a1b7370B9ae04AdC565EBd643966")

    /*
    console.log("Deploying sSpell contract, using Spell", spell.address)
    tx = await hre.deployments.deploy("sSpellV1", {
        from: deployer.address,
        args: [spell.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 2500000,
        gasPrice: finalGasPrice,
    }) 

    console.log("Deploying Cauldron Medium Risk contract, using BentoBox and MIM", bentobox.address, mim.address)
    tx = await hre.deployments.deploy("CauldronMediumRiskV1", {
        from: deployer.address,
        args: [bentobox.address, mim.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })
    

    console.log("Deploying Cauldron Low Risk contract, using BentoBox and MIM", bentobox.address, mim.address)
    tx = await hre.deployments.deploy("CauldronLowRiskV1", {
        from: deployer.address,
        args: [bentobox.address, mim.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })
    
    /*
    console.log("Deploying YearnChainlinkOracle contract")
    tx = await hre.deployments.deploy("YearnChainlinkOracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    }) 
    console.log("Deploying YearnChainlinkOracle contract")
    tx = await hre.deployments.deploy("YearnChainlinkOracleV2", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    }) */
    
    const mediumRisk = (await hre.ethers.getContractFactory("CauldronMediumRiskV1")).attach(
        (await deployments.get("CauldronMediumRiskV1")).address
    )

    console.log("Update mediumRisk Owner")
    tx = await mediumRisk.connect(deployer).transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    const lowRisk = (await hre.ethers.getContractFactory("CauldronLowRiskV1")).attach(
        (await deployments.get("CauldronLowRiskV1")).address
    )

    console.log("Update lowRisk Owner")
    tx = await lowRisk.connect(deployer).transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()
    
    /*
    console.log("Update mim Owner")
    tx = await mim.connect(deployer).transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()
    */
    /*
    console.log("Deploying Bentobox contract")
    tx = await hre.deployments.deploy("BentoBoxV1", {
        from: deployer.address,
        args: [weth(chainId)],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5000000,
        gasPrice: finalGasPrice,
    })

    const bentobox = (await hre.ethers.getContractFactory("BentoBoxV1")).attach((await deployments.get("BentoBoxV1")).address)
    */
    /*
    const bentobox = (await hre.ethers.getContractFactory("BentoBoxV1")).attach("0xF5BCE5077908a1b7370B9ae04AdC565EBd643966")
    console.log("Deploying KashiPair contract, using BentoBox", bentobox.address)
    tx = await hre.deployments.deploy("KashiPairMediumRiskV1", {
        from: deployer.address,
        args: [bentobox.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })
    */
    /*
    console.log("Deploying Swapper contract")
    tx = await hre.deployments.deploy("SushiSwapSwapperV1", {
        from: deployer.address,
        args: [bentobox.address, factory, initCodeHash],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1300000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying PeggedOracle contract")
    tx = await hre.deployments.deploy("PeggedOracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 300000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying SimpleSLPTWAP0Oracle contract")
    tx = await hre.deployments.deploy("SimpleSLPTWAP0OracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying SimpleSLPTWAP1Oracle contract")
    tx = await hre.deployments.deploy("SimpleSLPTWAP1OracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying ChainlinkOracle contract")
    tx = await hre.deployments.deploy("ChainlinkOracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 500000,
        gasPrice: finalGasPrice,
    })

    console.log("Deploying BoringHelper contract")
    tx = await hre.deployments.deploy("BoringHelperV1", {
        from: deployer.address,
        args: [
            chainId == 1 ? "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd" : "0x80C7DD17B01855a6D2347444a0FCC36136a314de",
            chainId == 1 ? "0xE11fc0B43ab98Eb91e9836129d1ee7c3Bc95df50" : "0x1b9d177CcdeA3c79B6c8F40761fc8Dc9d0500EAa",
            chainId == 1 ? "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2" : "0x0769fd68dFb93167989C6f7254cd0D766Fb2841F",
            weth(chainId),
            chainId == 1
                ? "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
                : chainId == 3
                ? "0xbde8bb00a7ef67007a96945b3a3621177b615c44"
                : "0x0000000000000000000000000000000000000000",
            chainId == 1
                ? "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac"
                : chainId == 3
                ? "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"
                : "0x0000000000000000000000000000000000000000",
            chainId == 1
                ? "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
                : chainId == 3
                ? "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
                : "0x0000000000000000000000000000000000000000",
            chainId == 1 ? "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272" : "0x1be211D8DA40BC0ae8719c6663307Bfc987b1d6c",
            bentobox.address,
        ],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5200000,
        gasPrice: finalGasPrice,
    })
*/  
    /*
    const kashipair = (await hre.ethers.getContractFactory("KashiPairMediumRiskV1")).attach(
        (await deployments.get("KashiPairMediumRiskV1")).address
    )
    const swapper = (await hre.ethers.getContractFactory("SushiSwapSwapperV1")).attach((await deployments.get("SushiSwapSwapperV1")).address)
     
    const swapper = (await hre.ethers.getContractFactory("SushiSwapSwapperV1")).attach("0x1766733112408b95239aD1951925567CB1203084")
    console.log("Whitelisting Swapper")
    tx = await kashipair.connect(deployer).setSwapper(swapper.address, true, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    console.log("Update KashiPair Owner")
    tx = await kashipair.connect(deployer).transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()
    */
    /*
    console.log("Whitelisting KashiPair")
    tx = await bentobox.whitelistMasterContract(kashipair.address, true, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    console.log("Update BentoBox Owner")
    await bentobox.transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })*/
    /*
    console.log("Deploying ChainlinkOracle contract")
    tx = await hre.deployments.deploy("ChainlinkOracleV2", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 450000,
        gasPrice: finalGasPrice,
    })*/
}

function verify(apikey, address, source, contractname, license, runs) {
    var request = require("request")
    request.post(
        "//api.etherscan.io/api",
        {
            apikey: apikey, //A valid API-Key is required
            module: "contract", //Do not change
            action: "verifysourcecode", //Do not change
            contractaddress: address, //Contract Address starts with 0x...
            sourceCode: source, //Contract Source Code (Flattened if necessary)
            contractname: contractname, //ContractName (if codeformat=solidity-standard-json-input, then enter contractname as ex: erc20.sol:erc20)
            compilerversion: "v0.6.12+commit.27d51765", // see https://etherscan.io/solcversions for list of support versions
            optimizationUsed: 1, //0 = No Optimization, 1 = Optimization used (applicable when codeformat=solidity-single-file)
            runs: runs, //set to 200 as default unless otherwise  (applicable when codeformat=solidity-single-file)
            constructorArguements: $("#constructorArguements").val(), //if applicable
            evmversion: $("#evmVersion").val(), //leave blank for compiler default, homestead, tangerineWhistle, spuriousDragon, byzantium, constantinople, petersburg, istanbul (applicable when codeformat=solidity-single-file)
            licenseType: license, //Valid codes 1-12 where 1=No License .. 12=Apache 2.0, see https://etherscan.io/contract-license-types
        },
        function (err, res, body) {
            console.log(res)
            /*if (result.status == "1") {
            //1 = submission success, use the guid returned (result.result) to check the status of your submission.
            // Average time of processing is 30-60 seconds
            document.getElementById("postresult").innerHTML = result.status + ";" + result.message + ";" + result.result;
            // result.result is the GUID receipt for the submission, you can use this guid for checking the verification status
        } else {
            //0 = error
            document.getElementById("postresult").innerHTML = result.status + ";" + result.message + ";" + result.result;
        }
        console.log("status : " + result.status);
        console.log("result : " + result.result);*/
        }
    )
}
