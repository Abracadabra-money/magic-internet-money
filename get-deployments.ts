import fs from 'fs'
import path from "path"

const ChainName: any = {
  "1": "Mainnet",
  "43114": "Avax",
  "250": "Fantom",
  "137": "Polygon",
  "42161": "Arbitrum",
  "31337": "Hardhat"
};

const inputPath = "./deployments/"
const dirs = fs.readdirSync(inputPath)
let output = {}

for (var i in dirs) {
  const chain = fs.readFileSync(inputPath + dirs[i] + "/.chainId",  'utf8')
  const files = fs.readdirSync(inputPath + dirs[i])
  // @ts-ignore
  output[chain] = {}
  // @ts-ignore
  output[chain].name = ChainName[chain]
  for (var j in files) {
    if(path.extname(files[j]) == ".json") {
      const json = JSON.parse(fs.readFileSync(inputPath + dirs[i] + "/" + files[j], { encoding: 'utf8' }))
      const address = json["address"]
      //console.log(chain, address, path.basename(files[j], ".json") )
      // @ts-ignore
      output[chain][address] = path.basename(files[j], ".json") 
    }
  }
}

fs.writeFileSync("output.json", JSON.stringify(output, null, 4))