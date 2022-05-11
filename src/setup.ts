import ganache from "ganache";
import Web3 from "@dataxfi/datax.js/node_modules/web3";
import { AbiItem } from "web3-utils/types";
import factory from "@oceanprotocol/contracts/artifacts/DTFactory.json";
import datatokensTemplate from "@oceanprotocol/contracts/artifacts/DataTokenTemplate.json";
import bFactory from "@oceanprotocol/contracts/artifacts/BFactory.json";
import proxy from "@dataxfi/datax.js/dist/abi/DataxRouter.json";
import bPool from "@oceanprotocol/contracts/artifacts/BPool.json";
import { Ocean, Config } from "@dataxfi/datax.js";
import { DataTokens } from "@dataxfi/datax.js/dist/Datatokens";
import { Logger } from "@dataxfi/datax.js/dist/utils/Logger";

export function setupGanache(): Web3 {
  return new Web3(ganache.provider() as any);
}

export function getAccounts(web3: Web3): Promise<string[]> {
  return web3.eth.getAccounts();
}

export function getBalance(address: string, web3: Web3): Promise<string> {
  return web3.eth.getBalance(address);
}

export async function deployContract(web3: Web3, abi: AbiItem[] | AbiItem, minter: string, options: any): Promise<any> {
  const contract = new web3.eth.Contract(abi);
  const deploy = contract.deploy(options);
  const estGas = await deploy.estimateGas((err, estGas) => {
    if (err) throw err;
    return estGas;
  });

  console.log("ESTIMATED GAS:", estGas);
  const address = await deploy
    .send({
      from: minter,
      gas: estGas + 100000,
      gasPrice: "3000000000",
    })
    .then((contract) => {
      return contract.options.address;
    });

  return [address, contract];
}

export async function setupPool(
  contract: any,
  acct: string,
  baseAddress: string,
  baseAmt: string,
  baseWeight: string,
  otherAddress: string,
  otherAmt: string,
  otherWeight: string,
  fee: string
) {
  const estGas = await contract.methods.setup(otherAddress, otherAmt, otherWeight, baseAddress, baseWeight, baseAmt, fee).estimateGas({ from: acct }, (err: any, estGas: any) => {
    err ? 10000000 : estGas + 1000;
  });

  const setupTx = await contract.methods.setup(otherAddress, otherAmt, otherWeight, baseAddress, baseWeight, baseAmt, fee).send({ from: acct, gas: estGas });
  return setupTx;
}

const provider = setupGanache();
getAccounts(provider).then(async (res: string[]) => {
  getBalance(res[0], provider).then(console.log);

  const dtAmount = "10";
  const dtWeight = "3";
  const oceanAmount = (parseFloat(dtAmount) * (10 - parseFloat(dtWeight))) / parseFloat(dtWeight);
  const fee = "0.01";
  const oceanWeight = "3";

  const [dtTemplateAddress, dtTemplateContract] = await deployContract(provider, datatokensTemplate.abi as AbiItem[], res[0], {
    data: datatokensTemplate.bytecode,
    arguments: ["Template Contract", "TEMPLATE", res[0], 1400000000, "https://something.nothing", res[0]],
  });

  // deploy factory contract
  const [factoryAddress, factoryContract] = await deployContract(provider, factory.abi as AbiItem[], res[0], {
    data: factory.bytecode,
    arguments: [dtTemplateAddress, res[0]],
  });

  // deploy balancer contracts
  const [examplePoolAddress, examplePoolContract] = await deployContract(provider, bPool.abi as AbiItem[], res[2], { data: bPool.bytecode });
  // const examplePoolProxy = await deployContract(provider, proxy.abi as AbiItem[], res[0], { data: proxy.bytecode, arguments: [examplePoolAddress] });

  // deploy balancer factory contract
  // arguments needs an address, even though the abi says 'never[]'
  const [balancerFactoryAddress, balancerFactoryContract] = await deployContract(provider, bFactory.abi as AbiItem[], res[0], {
    data: bFactory.bytecode,
    arguments: [examplePoolAddress],
  });

  // create ocean token
  const Datatoken = new DataTokens(factoryAddress, factory.abi as AbiItem[], datatokensTemplate.abi as AbiItem[], provider as Web3, new Logger());
  const oceanToken = await Datatoken.create("https://thisIsWhereMyMetadataIs.com", res[0], "1400000000", "OCEAN Token", "OCEAN"); // create a ocean token

  // create another token
  const coolToken = await Datatoken.create("https://thisIsWhereMyMetadataIs.com", res[0], "1400000000", "Keith", "COOL");

  // mint tokens to account 2
  await Datatoken.mint(oceanToken, res[0], "10000000", res[2]);
  await Datatoken.mint(coolToken, res[0], "10000000", res[2]);

  const ocean = new Ocean(provider, 1337, balancerFactoryAddress, oceanToken);

  const acct2Ocean = await ocean.getBalance(oceanToken, res[2]);
  const acct2COOL = await ocean.getBalance(coolToken, res[2]);

  console.log(`Account 3 balances: 
  COOL: ${acct2COOL}
  OCEAN: ${acct2Ocean}
  `);

  await ocean.approve(oceanToken, examplePoolAddress, "10000000", res[2]);
  await ocean.approve(coolToken, examplePoolAddress, "10000000", res[2]);

  const oceanLimit = await ocean.getAllowance(oceanToken, res[2], examplePoolAddress);
  const coolLimit = await ocean.getAllowance(coolToken, res[2], examplePoolAddress);

  console.log(`Account 3 allowances: 
  COOL: ${coolLimit}
  OCEAN: ${oceanLimit}`);

  examplePoolContract.options.address = examplePoolAddress;

  const totalSharesInPoolBefore = await ocean.getTotalPoolShares(examplePoolAddress);
  console.log("Total shares in coolOceanPool before", totalSharesInPoolBefore);

  const coolOceanPool = await setupPool(
    examplePoolContract,
    res[2],
    oceanToken,
    provider.utils.toWei(String(oceanAmount)),
    provider.utils.toWei(String(oceanWeight)),
    coolToken,
    provider.utils.toWei(String(dtAmount)),
    provider.utils.toWei(String(dtWeight)),
    provider.utils.toWei(String(fee))
  );

  const totalSharesInPoolAfter = await ocean.getTotalPoolShares(examplePoolAddress);
  console.log("Total shares in coolOceanPool after", totalSharesInPoolAfter);
  const sharesVal = await ocean.getTokensRemovedforPoolShares(examplePoolAddress, "100");
  console.log("Tokens removed for pool shares", sharesVal);

  await Datatoken.mint(oceanToken, res[0], "10000000", res[3]);
  await ocean.stakeOcean(res[3], examplePoolAddress, "1");
  const acct3Shares = await ocean.getMyPoolSharesForPool(examplePoolAddress, res[3]);
  const acct3Liq = await ocean.getOceanRemovedforPoolShares(examplePoolAddress, acct3Shares)
  console.log(acct3Shares, acct3Liq)
});
