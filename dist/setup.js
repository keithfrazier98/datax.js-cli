"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPool = exports.deployContract = exports.getBalance = exports.getAccounts = exports.setupGanache = void 0;
const ganache_1 = __importDefault(require("ganache"));
const web3_1 = __importDefault(require("@dataxfi/datax.js/node_modules/web3"));
const DTFactory_json_1 = __importDefault(require("@oceanprotocol/contracts/artifacts/DTFactory.json"));
const DataTokenTemplate_json_1 = __importDefault(require("@oceanprotocol/contracts/artifacts/DataTokenTemplate.json"));
const BFactory_json_1 = __importDefault(require("@oceanprotocol/contracts/artifacts/BFactory.json"));
const BPool_json_1 = __importDefault(require("@oceanprotocol/contracts/artifacts/BPool.json"));
const datax_js_1 = require("@dataxfi/datax.js");
const Datatokens_1 = require("@dataxfi/datax.js/dist/Datatokens");
const Logger_1 = require("@dataxfi/datax.js/dist/utils/Logger");
function setupGanache() {
    return new web3_1.default(ganache_1.default.provider());
}
exports.setupGanache = setupGanache;
function getAccounts(web3) {
    return web3.eth.getAccounts();
}
exports.getAccounts = getAccounts;
function getBalance(address, web3) {
    return web3.eth.getBalance(address);
}
exports.getBalance = getBalance;
function deployContract(web3, abi, minter, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const contract = new web3.eth.Contract(abi);
        const deploy = contract.deploy(options);
        const estGas = yield deploy.estimateGas((err, estGas) => {
            if (err)
                throw err;
            return estGas;
        });
        console.log("ESTIMATED GAS:", estGas);
        const address = yield deploy
            .send({
            from: minter,
            gas: estGas + 100000,
            gasPrice: "3000000000",
        })
            .then((contract) => {
            return contract.options.address;
        });
        return [address, contract];
    });
}
exports.deployContract = deployContract;
function setupPool(contract, acct, baseAddress, baseAmt, baseWeight, otherAddress, otherAmt, otherWeight, fee) {
    return __awaiter(this, void 0, void 0, function* () {
        const estGas = yield contract.methods.setup(otherAddress, otherAmt, otherWeight, baseAddress, baseWeight, baseAmt, fee).estimateGas({ from: acct }, (err, estGas) => {
            err ? 10000000 : estGas + 1000;
        });
        const setupTx = yield contract.methods.setup(otherAddress, otherAmt, otherWeight, baseAddress, baseWeight, baseAmt, fee).send({ from: acct, gas: estGas });
        return setupTx;
    });
}
exports.setupPool = setupPool;
const provider = setupGanache();
getAccounts(provider).then((res) => __awaiter(void 0, void 0, void 0, function* () {
    getBalance(res[0], provider).then(console.log);
    const dtAmount = "10";
    const dtWeight = "3";
    const oceanAmount = (parseFloat(dtAmount) * (10 - parseFloat(dtWeight))) / parseFloat(dtWeight);
    const fee = "0.01";
    const oceanWeight = "3";
    const [dtTemplateAddress, dtTemplateContract] = yield deployContract(provider, DataTokenTemplate_json_1.default.abi, res[0], {
        data: DataTokenTemplate_json_1.default.bytecode,
        arguments: ["Template Contract", "TEMPLATE", res[0], 1400000000, "https://something.nothing", res[0]],
    });
    const [factoryAddress, factoryContract] = yield deployContract(provider, DTFactory_json_1.default.abi, res[0], {
        data: DTFactory_json_1.default.bytecode,
        arguments: [dtTemplateAddress, res[0]],
    });
    const [examplePoolAddress, examplePoolContract] = yield deployContract(provider, BPool_json_1.default.abi, res[2], { data: BPool_json_1.default.bytecode });
    const [balancerFactoryAddress, balancerFactoryContract] = yield deployContract(provider, BFactory_json_1.default.abi, res[0], {
        data: BFactory_json_1.default.bytecode,
        arguments: [examplePoolAddress],
    });
    const Datatoken = new Datatokens_1.DataTokens(factoryAddress, DTFactory_json_1.default.abi, DataTokenTemplate_json_1.default.abi, provider, new Logger_1.Logger());
    const oceanToken = yield Datatoken.create("https://thisIsWhereMyMetadataIs.com", res[0], "1400000000", "OCEAN Token", "OCEAN");
    const coolToken = yield Datatoken.create("https://thisIsWhereMyMetadataIs.com", res[0], "1400000000", "Keith", "COOL");
    yield Datatoken.mint(oceanToken, res[0], "10000000", res[2]);
    yield Datatoken.mint(coolToken, res[0], "10000000", res[2]);
    const ocean = new datax_js_1.Ocean(provider, 1337, balancerFactoryAddress, oceanToken);
    const acct2Ocean = yield ocean.getBalance(oceanToken, res[2]);
    const acct2COOL = yield ocean.getBalance(coolToken, res[2]);
    console.log(`Account 3 balances: 
  COOL: ${acct2COOL}
  OCEAN: ${acct2Ocean}
  `);
    yield ocean.approve(oceanToken, examplePoolAddress, "10000000", res[2]);
    yield ocean.approve(coolToken, examplePoolAddress, "10000000", res[2]);
    const oceanLimit = yield ocean.getAllowance(oceanToken, res[2], examplePoolAddress);
    const coolLimit = yield ocean.getAllowance(coolToken, res[2], examplePoolAddress);
    console.log(`Account 3 allowances: 
  COOL: ${coolLimit}
  OCEAN: ${oceanLimit}`);
    examplePoolContract.options.address = examplePoolAddress;
    const totalSharesInPoolBefore = yield ocean.getTotalPoolShares(examplePoolAddress);
    console.log("Total shares in coolOceanPool before", totalSharesInPoolBefore);
    const coolOceanPool = yield setupPool(examplePoolContract, res[2], oceanToken, provider.utils.toWei(String(oceanAmount)), provider.utils.toWei(String(oceanWeight)), coolToken, provider.utils.toWei(String(dtAmount)), provider.utils.toWei(String(dtWeight)), provider.utils.toWei(String(fee)));
    const totalSharesInPoolAfter = yield ocean.getTotalPoolShares(examplePoolAddress);
    console.log("Total shares in coolOceanPool after", totalSharesInPoolAfter);
    const sharesVal = yield ocean.getTokensRemovedforPoolShares(examplePoolAddress, "100");
    console.log("Tokens removed for pool shares", sharesVal);
    yield Datatoken.mint(oceanToken, res[0], "10000000", res[3]);
    yield ocean.stakeOcean(res[3], examplePoolAddress, "1");
    const acct3Shares = yield ocean.getMyPoolSharesForPool(examplePoolAddress, res[3]);
    const acct3Liq = yield ocean.getOceanRemovedforPoolShares(examplePoolAddress, acct3Shares);
    console.log(acct3Shares, acct3Liq);
}));
//# sourceMappingURL=setup.js.map