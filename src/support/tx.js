/** @module support/tx */
const tx = {};
module.exports = tx;
/* eslint-disable import/no-extraneous-dependencies */
// FIXME, we could chain the promises a little bit better in this module
/**
 * The blockchain transaction receipt.
 * @typedef {Object} TransactionReceipt
 * @property {string} blockHash - The hash (32 Bytes) of the block where this transaction was in.
 * @property {number} blockNumber - The block number where this transaction was in.
 * @property {string} transactionHash - The hash (32 Bytes) of the transaction.
 * @property {number} transactionIndex - An integer of the transactions index position in the block.
 * @property {string} from - The address of the sender.
 * @property {string} to - The address of the receiver, null when its a contract creation transaction.
 * @property {number} cumulativeGasUsed - The total amount of gas used when this transaction was executed in the block.
 * @property {number} gasUsed - The amount of gas used by this specific transaction alone.
 * @property {string} contractAddress - The contract address (20 Bytes) created,
 * if the transaction was a contract creation, otherwise null.
 * @property {Array} logs - Array of log objects, which this transaction generated.
 */

/**
 * The blockchain transaction options.
 * @typedef {Object} TransactionOptions
 * @property {number} [nonce] - The transaction sequence number.
 * @property {number} [gas] - The gas value provided by the sender.
 * @property {number} [gasPrice] - The gas price value provided by the sender in Wei.
 * @property {number} [chainId] - The network chain id according to EIP-155.
 */

/**
 * The blockchain raw transaction object.
 * @typedef {Object} RawTransaction
 * @property {number} nonce - The hexadecimal transaction sequence number.
 * The number of transactions made by the sender prior to this one.
 * @property {string} from - The address of the sender.
 * @property {string} to - The address of the receiver.
 * @property {string} value - The hexadecimal value transferred in Wei.
 * @property {string} gasPrice - The hexadecimal gas price value provided by the sender in Wei.
 * @property {string} gas - The hexadecimal value of gas provided by the sender.
 * @property {string} [data] - The hexadecimal data sent along with the transaction.
 * @property {string} [chainId] - The network chain id according to EIP-155.
 */

const util = require('util');
// This shim is necessary so that marketplaceTx can be imported in the browser
// See https://github.com/serverless-heaven/serverless-webpack/issues/291#issuecomment-348790713
// See https://github.com/alexjlockwood/avocado/commit/7455bea1052c4d271fe0e6db59f3fb3efdd0349d
require('util.promisify').shim();
const path = require('path');
const truffleContract = require('truffle-contract');
const _ = require('lodash');

const nonceManager = require('./nonce');
const { CONTRACTS } = require('./constants');
const logger = require('../logger');
const { mapError, CvcError, NotDeployedError, NoNetworkInContractError } = require('./errors');
const config = require('../config')();

// Default chainID is 0, otherwise take it from the environment variables.
const TX_CHAIN_ID = parseInt(process.env.CHAIN_ID, 10) || 0;
// Gas price per tx
const TX_GAS_PRICE = process.env.GAS_PRICE || config.gasPrice || 1e9;
// Default tx gas limit, should be enough for heavy tx such as escrow.place, pricing.setPrice
const TX_GAS_LIMIT = process.env.GAS || config.gas || 300000;
// default mining timeout
const TX_MINING_TIMEOUT = process.env.TX_MINING_TIMEOUT || config.txMiningTimeout || 120;

/**
 * Checks the contract's address and verify deployed code property is not
 * empty.
 * @param contractAddress
 * @returns {Promise<void>}
 */
const assertCodeAtAddress = async contractAddress => {
  const getCodePromise = util.promisify(cb => tx.web3.eth.getCode(contractAddress, cb));
  const code = await getCodePromise();
  // this caters for the cases where code = "0x", "0x0" or ""
  if (parseInt(code + 0, 16) === 0) {
    throw new NotDeployedError(contractAddress);
  }
};

/**
 * Returns the contract instance deployed to current network.
 * @param {object} contract - The contract definition.
 * @param {string} contractName - The contact name.
 * @returns {Promise<object>} The contract object.
 * @throws NoNetworkInContractError
 */
const detectDeployedContract = (contract, contractName) =>
  contract
    .deployed()
    .catch(error => {
      logger.debug('Current network not found in truffle-contract json');
      throw new NoNetworkInContractError(contractName, error);
    })
    .then(async deployedContract => {
      await assertCodeAtAddress(deployedContract.address);
      return deployedContract;
    });

/**
 * Returns the contract artifact
 * @param {string} contractName - The contact name.
 * @returns {Promise<object>} The contract artifact.
 */
// eslint-disable-next-line consistent-return
const getContractArtifact = async contractName => {
  if (config.contracts.url) {
    // For frontend apps you can pass the url of the contracts
    // eslint-disable-next-line no-undef
    return (await fetch(`${config.contracts.url}/${contractName}.json`)).json();
  } else if (config.contracts.dir) {
    // For backend servers you can pass the path of the contracts
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path.join(config.contracts.dir, `${contractName}.json`));
  }
};

/**
 * Returns the contract instance by name.
 * @type {Function}
 */
tx.contractInstance = _.memoize(async contractName => {
  try {
    // Assert valid contract name.
    if (!/^\w+$/.test(contractName)) {
      throw new Error(`Invalid contract name "${contractName}"`);
    }
    // Load contract artifact file.
    const contractArtifact = await getContractArtifact(contractName);
    // Create contract object.
    const contract = truffleContract(contractArtifact);
    contract.setProvider(tx.web3.currentProvider);

    // Load contract by static address if configured.
    if (_.has(config, ['contracts', 'addresses', contractName])) {
      const contractAddress = config.contracts.addresses[contractName];
      try {
        await assertCodeAtAddress(contractAddress);
        return contract.at(contractAddress);
      } catch (error) {
        logger.debug(
          // eslint-disable-next-line max-len
          `Contract '${contractName}' could not be found at configured address: '${contractAddress}'. Using autodetect...`
        );
        return detectDeployedContract(contract, contractName);
      }
    }

    logger.debug(`Address is not configured for '${contractName}' contract. Using autodetect...`);
    return detectDeployedContract(contract, contractName);
  } catch (error) {
    logger.error(`Error loading contract ${contractName}`, error);
    if (error instanceof CvcError) {
      throw error;
    } else {
      throw new CvcError(`Error loading contract: ${contractName}`, error);
    }
  }
});

/**
 * Retrieves a set of contracts by name. This can be used as follows:
 *
 * <pre>
 * const contracts = await contractInstances('CvcPricing', 'CvcEscrow');
 * const contracts.CvcToken.transfer(...)
 * const contracts.CvcEscrow.place(...)
 * </pre>
 *
 * @param {Array<string>} contractNames - The names of the contracts to retrieve.
 * @return {Promise<Object>} A promise of an object of the form { contractName : contractInstance}
 */
tx.contractInstances = async function(...contractNames) {
  const contractInstances = await Promise.all(contractNames.map(tx.contractInstance));
  return _.zipObject(contractNames, contractInstances);
};

/**
 * Initialises all contracts found in the contracts directory,
 * throwing an error if any are not found on the blockchain.
 * @returns {Promise<Object>} A promise of an object of the form { contractName : contractInstance}
 */
tx.loadContracts = () => tx.contractInstances(...CONTRACTS);

/**
 * Return latest known block number from the current network.
 * @returns {Promise<number>} Block number.
 */
tx.blockNumber = util.promisify(cb => tx.web3.eth.getBlockNumber(cb))();

/**
 * Returns an event produced by specific smart contract.
 * @param {string} contractName - The target contract name.
 * @param {string} eventName - The event name.
 * @param {object} filterBy - A filter object to filter events by indexed property match.
 * @param {object} additionalFilterObject - A filter options object.
 * @param {number|string} additionalFilterObject.fromBlock - The number of the earliest block
 * (latest may be given to mean the most recent and pending currently mining, block). By default latest.
 * @param {number|string} additionalFilterObject.toBlock - The number of the latest block
 * (latest may be given to mean the most recent and pending currently mining, block). By default latest.
 * @returns {Promise<object>} A promise of list.
 */
tx.getEvent = async function(contractName, eventName, filterBy = {}, additionalFilterObject = {}) {
  // Set marketplace deployment block as default starting point to search events from.
  _.defaults(additionalFilterObject, { fromBlock: config.marketplaceDeploymentBlock });

  try {
    const instance = await tx.contractInstance(contractName);
    const contract = tx.web3.eth.contract(instance.abi).at(instance.address);
    const event = contract[eventName](filterBy, additionalFilterObject);

    return util.promisify(cb => event.get(cb))();
  } catch (error) {
    throw mapError(error);
  }
};

/**
 * Returns the list of all events produced by specific smart contract.
 * @param {string} contractName - The target contract name.
 * @param {object} additionalFilterObject - A filter options object.
 * @param {number|string} additionalFilterObject.fromBlock - The number of the earliest block
 * (latest may be given to mean the most recent and pending currently mining, block). By default latest.
 * @param {number|string} additionalFilterObject.toBlock - The number of the latest block
 * (latest may be given to mean the most recent and pending currently mining, block). By default latest.
 * @returns {Promise<object[]>} A promise of list.
 */
tx.getAllEvents = async function(contractName, additionalFilterObject) {
  // Set marketplace deployment block as default starting point to search events from.
  _.defaults(additionalFilterObject, { fromBlock: config.marketplaceDeploymentBlock });

  try {
    const instance = await tx.contractInstance(contractName);
    const contract = tx.web3.eth.contract(instance.abi).at(instance.address);
    const events = contract.allEvents(additionalFilterObject);

    return util.promisify(cb => events.get(cb))();
  } catch (error) {
    throw mapError(error);
  }
};

/**
 * Makes a read call to specified contract method.
 * @param {string} contractName - The contract name.
 * @param {string} method - The contract's method name.
 * @param {Array<*>} params - The contract method params.
 * @returns {Promise<*>} The method call result.
 */
tx.call = async function(contractName, method, params) {
  try {
    return (await tx.contractInstance(contractName))[method](...params);
  } catch (error) {
    throw mapError(error);
  }
};

/**
 * Creates transactions that need to be run one after another from the single address.
 * Example usage:
 * tx.createTxChain(fromAddress, [
 *   { contract: 'CvcToken', method: 'approve', args: [escrowContract.address, amount] },
 *   { contract: 'CvcEscrow', method: 'place', args: [idvAddress, userId, attestationId, amount] }
 * ])
 * Returning promise will resolve into array of RawTx objects.
 * txOptions are not sent through as each transaction has it's own gas and gasPrice values
 * @param {Object} params - The transaction chain parameters.
 * @param {string} params.fromAddress - The address of the sender.
 * @param {Object[]} transactions - The transaction chain parameters.
 * @param {string} transactions.contractName - The target contract name.
 * @param {string} transactions.method - The target contract method name.
 * @param {Array<string|number>} transactions.args - An array of contract method arguments.
 * @param {boolean} [params.assignedNonce = false] - Use this to specify that the transaction should be given a nonce
 * (e.g. for external signing).
 * @param {TransactionOptions} [params.txOptions = {}] - Transaction options.
 * @returns {Promise<RawTransaction>} A promise of transaction chain.
 */
tx.createTxChain = function({ fromAddress, transactions, assignedNonce = false, txOptions = {} }) {
  // Each array element represents transaction parameters.
  // To reduce it, create Tx from provided parameter and push to resulting accumulator array.
  const reducer = (promise, transaction) =>
    promise.then(resultArray =>
      tx
        .createTx({
          fromAddress,
          contractName: transaction.contract,
          method: transaction.method,
          args: transaction.args ? transaction.args : [],
          assignedNonce,
          txOptions
        })
        .then(createdTx => [...resultArray, createdTx])
    );

  // Start with empty array-promise as initial value
  return transactions.reduce(reducer, Promise.resolve([]));
};

// return a transaction that includes a nonce if the nonce exists
const withOptionalNonce = (nonce, transaction) =>
  _.isNil(nonce) ? transaction : { nonce: `0x${nonce.toString(16)}`, ...transaction };

/**
 * Creates a single transaction to call the specific method of the contract.
 * Return a raw transaction that needs to be signed by private key before sending.
 * @param {Object} params - The transaction parameters.
 * @param {string} params.fromAddress - The address of the sender.
 * @param {string} params.contractName - The target contract name.
 * @param {string} params.method - The target contract method name.
 * @param {Array<string|number>} params.args - An array of contract method arguments.
 * @param {boolean} [params.assignedNonce = false] - Use this to specify that the transaction should be given a nonce
 * (e.g. for external signing).
 * @param {TransactionOptions} [params.txOptions = {}] - Transaction options.
 * @returns {Promise<RawTransaction>} The promise of raw transaction object.
 */
tx.createTx = async function({ fromAddress, contractName, method, args, assignedNonce = false, txOptions = {} }) {
  // merging txOptions
  const updatedTxOptions = _.defaults({}, txOptions, {
    gas: TX_GAS_LIMIT,
    gasPrice: TX_GAS_PRICE,
    chainId: TX_CHAIN_ID
  });

  // determining contract instance promise
  const instancePromise = tx.contractInstance(contractName);

  // determining tx nonce promise
  let noncePromise = Promise.resolve();
  let nonceReleasePromise = Promise.resolve();
  if (updatedTxOptions.nonce) {
    // Use nonce provided by client.
    noncePromise = Promise.resolve(updatedTxOptions.nonce);
  } else if (assignedNonce) {
    // Let nonce manager to decide nonce value.
    noncePromise = nonceManager.getNonceForAccount(fromAddress);
    nonceReleasePromise = nonce => nonceManager.releaseAccountNonce(fromAddress, nonce);
  }

  // create a transaction from the input parameters, the contract instance, and an optional nonce
  const createTransaction = async (instance, nonce) => {
    try {
      return withOptionalNonce(nonce, {
        from: fromAddress,
        to: instance.address,
        value: '0x0',
        data: instance.contract[method].getData.apply(instance, args),
        gas: `0x${updatedTxOptions.gas.toString(16)}`,
        gasPrice: `0x${updatedTxOptions.gasPrice.toString(16)}`,
        chainId: `0x${updatedTxOptions.chainId.toString(16)}`
      });
    } catch (error) {
      logger.error(`Error during creating tx: ${error.message}`, error, {
        fromAddress,
        contractName,
        method,
        args,
        updatedTxOptions
      });

      await nonceReleasePromise(nonce);
      throw mapError(error);
    }
  };

  try {
    const [instance, nonce] = await Promise.all([instancePromise, noncePromise]);
    return createTransaction(instance, nonce);
  } catch (error) {
    throw mapError(error);
  }
};

/**
 * Creates platform coin (e.g. ETH) transfer raw transaction.
 * @param {Object} params - The transaction parameters.
 * @param {string} params.fromAddress - The address of the sender.
 * @param {string} params.toAddress - The address of the receiver.
 * @param {string} params.value - The value transferred in Wei.
 * @param {boolean} [params.assignedNonce = false] - Use this to specify that the transaction should be given a nonce
 * (e.g. for external signing). Defaults to false.
 * @param {TransactionOptions} [params.txOptions = {}] - Transaction options.
 * @returns {RawTransaction} The raw transaction object.
 */
tx.createPlatformCoinTransferTx = async function({
  fromAddress,
  toAddress,
  value,
  assignedNonce = false,
  txOptions = {}
}) {
  // Merging txOptions
  const updatedTxOptions = _.defaults({}, txOptions, { gasPrice: TX_GAS_PRICE, chainId: TX_CHAIN_ID });

  // determining tx nonce promise
  let noncePromise = Promise.resolve();
  let nonceReleasePromise = Promise.resolve();
  if (updatedTxOptions.nonce) {
    // Use nonce provided by client.
    noncePromise = Promise.resolve(updatedTxOptions.nonce);
  } else if (assignedNonce) {
    // Let nonce manager to decide nonce value.
    noncePromise = nonceManager.getNonceForAccount(fromAddress);
    nonceReleasePromise = nonce => nonceManager.releaseAccountNonce(fromAddress, nonce);
  }

  const createTransaction = async nonce => {
    try {
      return withOptionalNonce(nonce, {
        from: fromAddress,
        to: toAddress,
        value,
        gas: '0x5208', // 21000
        gasPrice: `0x${updatedTxOptions.gasPrice.toString(16)}`,
        chainId: `0x${updatedTxOptions.chainId.toString(16)}`
      });
    } catch (error) {
      logger.error(`Error during creating tx: ${error.message}`, error, {
        fromAddress,
        toAddress,
        value,
        updatedTxOptions
      });

      await nonceReleasePromise(nonce);
      throw mapError(error);
    }
  };

  try {
    const nonce = await noncePromise;
    return createTransaction(nonce);
  } catch (error) {
    throw mapError(error);
  }
};

/**
 * Returns the transaction receipt by transaction hash.
 * @param {string} txHash - A hash of the transaction to get receipt for.
 * @returns {Promise<TransactionReceipt|CvcError|Error>} A promise of the transaction receipt or error.
 */
tx.getTransactionReceipt = function(txHash) {
  const getTransactionReceiptPromise = util.promisify(cb => tx.web3.eth.getTransactionReceipt(txHash, cb));
  try {
    return getTransactionReceiptPromise();
  } catch (error) {
    logger.error(`Error retrieving transaction receipt for ${txHash}.`, error);
    throw mapError(error);
  }
};

/**
 * Returns the transaction receipt.
 * Periodically polls blockchain until the receipt is received or timeout is reached, whichever comes first.
 * @param {string} txHash - The transaction hash.
 * @param {number} timeout - Max allowed timeout to wait for transaction receipt.
 * @returns {Promise<TransactionReceipt|CvcError|Error>} A promise of the transaction receipt or error.
 */
tx.getTransactionReceiptMined = function(txHash, timeout = TX_MINING_TIMEOUT) {
  // Poll blockchain every 500 ms for the receipt.
  const interval = 500;
  // How many attempts to perform: timeout in seconds times attempts per second.
  const attemptLimit = Math.ceil(timeout * (1000 / interval));

  const transactionReceiptAsync = async function(resolve, reject, attemptCount = 0) {
    const receipt = await tx.getTransactionReceipt(txHash);
    if (receipt) {
      // Receipt is retrieved successfully.
      resolve(receipt);
    } else if (attemptCount >= attemptLimit) {
      // We reached the allowed timeout - error out.
      reject(`getTransactionReceiptMined timeout for ${txHash}`);
    } else {
      // Increment attempt count and try to get receipt again.
      setTimeout(() => transactionReceiptAsync(resolve, reject, attemptCount + 1), interval);
    }
  };

  if (Array.isArray(txHash)) {
    return Promise.all(txHash.map(oneTxHash => tx.getTransactionReceiptMined(oneTxHash, timeout)));
  } else if (typeof txHash === 'string') {
    return new Promise(transactionReceiptAsync);
  } else if (typeof txHash === 'object' && typeof txHash.blockHash === 'string') {
    // already mined, txHash provided is a receipt.
    return Promise.resolve(txHash);
  }
  return Promise.reject(Error(`Error waiting for tx to be mined. Invalid Type: ${txHash}`));
};

/**
 * Returns the numbers of transactions sent from the address.
 * @param {string} address - The address to get the numbers of transactions from.
 * @returns {Promise<number|CvcError|Error>} A promise of the transaction count or error.
 */
tx.getTransactionCount = address => {
  const getTransactionCountPromise = util.promisify(cb => tx.web3.eth.getTransactionCount(address, cb));
  try {
    return getTransactionCountPromise();
  } catch (error) {
    logger.error(`Error retrieving transaction count for ${address}.`, error);
    throw mapError(error);
  }
};

/**
 * Waits for transaction to be mined on blockchain and returns the transaction receipt.
 * @param {Promise} txSendPromise - A promise of transaction sending function.
 * @param {number} timeout - Max allowed waiting time before error.
 * @returns {Promise<TransactionReceipt|CvcError|Error>} A promise of the transaction receipt or error.
 */
tx.waitForMine = async (txSendPromise, timeout = TX_MINING_TIMEOUT) => {
  const { transactionHash: txHash } = await txSendPromise;
  const receipt = await tx.getTransactionReceiptMined(txHash, timeout);
  // There are 2 new statuses introduced in Byzantium: 0x0 = fail; 0x1 = success.
  if (Number(receipt.status) === 0) {
    throw new Error('Tx failed');
  }

  return receipt;
};
