const { weth, getBigNumber } = require("@sushiswap/hardhat-framework")
const { defaultAbiCoder } = require("ethers/lib/utils")

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

    const bentoAddresses = {
        1: "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
        43114: "0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f"
    }

    const degenAddresses = {
        1: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
        43114: "0x1fC83f75499b7620d53757f0b01E2ae626aAE530"
    }

    const cauldronV2 = {
        1: "0x63905bb681b9e68682f392Df2B22B7170F78D300",
        43114: "0xc568a699c5B43A0F1aE40D3254ee641CB86559F4"
    }

    const cauldronV2Degen = {
        1: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F",
    }

    const safe = {
        1: "0x5f0DeE98360d8200b20812e174d139A1a633EDd2"
    }

    const cauldronV2CheckpointV1 = "0x1DF188958A8674B5177f77667b8D173c3CdD9e51"

    const chainId = await hre.getChainId()
    if (chainId == "31337" || hre.network.config.forking) {
        return
    }

    
    /*console.log("Deploying UsdcAvaxOracleV1...");
    tx = await hre.deployments.deploy("UsdcAvaxOracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false
    })
    const UsdcAvaxOracleV1Addresss = tx.address;
    console.log(`UsdcAvaxOracleV1Addresss: ${UsdcAvaxOracleV1Addresss}`);

    console.log("Deploying LPChainlinkOracleV1...");
    tx = await hre.deployments.deploy("LPChainlinkOracleV1", {
        from: deployer.address,
        args: [
            "0xa389f9430876455c36478deea9769b7ca4e3ddb1", // trader joe USDC.e-WAVAX pair
            UsdcAvaxOracleV1Addresss
        ],
        log: true,
        deterministicDeployment: false
    })


    return;*/

    /*
    if (!weth(chainId)) {
        console.log("No WETH address for chain", chainId)
        return
    } */
    console.log("Chain:", chainId)
    console.log("Balance:", (await funder.getBalance()).div("1000000000000000000").toString())
    const deployerBalance = await deployer.getBalance()

    let mimOwner = "0xfddfE525054efaAD204600d00CA86ADb1Cc2ea8a"
    if (chainId == "1") {
        let mimOwner = "0x5f0DeE98360d8200b20812e174d139A1a633EDd2"
    }

    let gasPrice = await funder.provider.getGasPrice()
    if (chainId == 1) {
        gasPrice = gasPrice.add("30000000000")
    }
    let multiplier = hre.network.tags && hre.network.tags.staging ? 2 : 1
    let finalGasPrice = gasPrice //.mul(multiplier)

    const gasLimit = 5000000
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

    console.log("Deployer balance", deployerBalance.toString(), deployer.address)
    console.log("Needed", finalGasPrice.mul(gasLimit).toString(), finalGasPrice.toString(), gasLimit.toString(), deployerBalance.lt(finalGasPrice.mul(gasLimit)))
    //console.log("Deploying Cauldron Medium Risk contract, using BentoBox and MIM", bentobox.address, mim.address)
    /*tx = await hre.deployments.deploy("ThreeCryptoLevSwapper", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1200000,
        gasPrice: finalGasPrice,
    }) */
    /*
    tx = await hre.deployments.deploy("ArbEthSwapper", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    })
    tx = await hre.deployments.deploy("ArbEthLevSwapper", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    }) */
    /*
    let tx = await hre.deployments.deploy("ProxyOracle", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    })
    
    tx = await hre.deployments.deploy("ShibUniV3ChainlinkOracle", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    }) 

    tx = await hre.deployments.deploy("ShibLevSwapper", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    }) 

    tx = await hre.deployments.deploy("ShibSwapper", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
    }) 
    */
    /*
    tx = await hre.deployments.deploy("CauldronV2", {
        from: deployer.address,
        args: ["0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3"],
        log: true,
        deterministicDeployment: false,
    }) 
    */
    // 0x890f4e345B1dAED0367A877a1612f86A1f86985f
    //const oracle = ((await hre.ethers.getContractFactory("ProxyOracle")).attach((await deployments.get("ProxyOracle")).address))
    //await oracle.changeOracleImplementation((await deployments.get("ShibUniV3ChainlinkOracle")).address)
    //await oracle.transferOwnership(safe[chainId], true, false)
    
    let collateral = "0xa47c8bf37f92aBed4A126BDA807A7b7498661acD"
    let oracle = {"address": "0x4f51264B07DB8b2910E892eEEF22460DE23268a7"}
    let oracleData = "0x0000000000000000000000000000000000000000"
    const INTEREST_CONVERSION = 1e18/(365.25*3600*24)/100
    let interest = parseInt(2*INTEREST_CONVERSION)
    const OPENING_CONVERSION = 1e5/100
    let opening = 0.5 * OPENING_CONVERSION
    let liquidation = 5 *1e3+1e5
    let collateralization = 90 * 1e3

    console.log("Deploy CauldronV2")
    const bentobox = (await hre.ethers.getContractFactory("BentoBoxV1")).attach(degenAddresses[chainId])

    let initData = defaultAbiCoder.encode(["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"], [collateral, oracle.address, oracleData, interest, liquidation, collateralization, opening])
    console.log(initData)
    tx = await bentobox.deploy(cauldronV2Degen[chainId], initData, true)
    const res = await tx.wait()
    const cloneAddress = res.events[0].args[2]
    console.log("Deployed address: ", cloneAddress)



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

    //const mim = (await hre.ethers.getContractFactory("MagicInternetMoneyV1")).attach((await deployments.get("MagicInternetMoneyV1")).address)

    //const spell = (await hre.ethers.getContractFactory("SpellV1")).attach("0x090185f2135308BaD17527004364eBcC2D37e5F6")

    //const bentobox = (await hre.ethers.getContractFactory("BentoBoxV1")).attach("0xF5BCE5077908a1b7370B9ae04AdC565EBd643966")

    //console.log("Deploying Cauldron Medium Risk contract, using BentoBox and MIM", bentobox.address, mim.address)
    /*tx = await hre.deployments.deploy("KashiPairMediumRiskV2", {
        from: deployer.address,
        args: ["0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616"],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    }) */
    /*
    tx = await hre.deployments.deploy("CauldronV2Multichain", {
        from: deployer.address,
        args: ["0x74c764D41B77DBbb4fe771daB1939B00b146894A", "0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a"],
        log: true,
        deterministicDeployment: false,
        // gasLimit: 5000000,
        // gasPrice: finalGasPrice,
    })

    /*
    console.log("Deploying Cauldron Checkpoint contract, using BentoBox and MIM", bentobox.address, mim.address)
    tx = await hre.deployments.deploy("CauldronV2CheckpointV1", {
        from: deployer.address,
        args: [bentobox.address, mim.address],
        log: true,
        deterministicDeployment: false,
        gasLimit: 5500000,
        gasPrice: finalGasPrice,
    })
    console.log("Deploying ThreeCrvOracleV1 contract")
    tx = await hre.deployments.deploy("ThreeCrvOracleV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })
    console.log("Deploying ThreeCrvLevSwapperV1 contract")
    tx = await hre.deployments.deploy("ThreeCrvLevSwapperV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })
    console.log("Deploying ThreeCrvSwapperV1 contract")
    tx = await hre.deployments.deploy("ThreeCrvSwapperV1", {
        from: deployer.address,
        args: [],
        log: true,
        deterministicDeployment: false,
        gasLimit: 1000000,
        gasPrice: finalGasPrice,
    })
    */
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
    
    /*
    const mediumRisk = (await hre.ethers.getContractFactory("CauldronV2Multichain")).attach(
        (await deployments.get("CauldronV2Multichain")).address
    )

    console.log("Update multichain Owner")
    tx = await mediumRisk.connect(deployer).transferOwnership("0xfddfE525054efaAD204600d00CA86ADb1Cc2ea8a", true, false, {
        //gasLimit: 100000,
        //gasPrice: finalGasPrice,
    })
    await tx.wait() */
    /*
    const lowRisk = (await hre.ethers.getContractFactory("CauldronLowRiskV1")).attach(
        (await deployments.get("CauldronLowRiskV1")).address
    )

    console.log("Update lowRisk Owner")
    tx = await lowRisk.connect(deployer).transferOwnership(mimOwner, true, false, {
        gasLimit: 100000,
        gasPrice: finalGasPrice,
    })
    await tx.wait()

    */
    
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
