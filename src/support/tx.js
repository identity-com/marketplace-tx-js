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

const path = require('path');
const truffleContract = require('truffle-contract');
const _ = require('lodash');

const nonceManager = require('./nonce');
const { CONTRACTS } = require('./constants');
const logger = require('../logger/index');
const { mapError, CvcError, NotDeployedError, NoNetworkInContractError } = require('./errors');
const config = require('../../config/index')();

// Default chainID is 0, otherwise take it from the environment variables.
const TX_CHAIN_ID = parseInt(process.env.CHAIN_ID, 10) || 0;
// Gas price per tx
const TX_GAS_PRICE = process.env.GAS_PRICE || config.gasPrice || 1e9;
// Default tx gas limit, should be enough for heavy tx such as escrow.place, pricing.setPrice
const TX_GAS_LIMIT = process.env.GAS || config.gas || 300000;
// default mining timeout
const TX_MINING_TIMEOUT = process.env.TX_MINING_TIMEOUT || config.txMiningTimeout || 120;

/**
 * Checks the contract's address and verify deployed code property is not empty.
 * @param {object} deployedContract Truffle contract.
 * @returns {Promise<object|NotDeployedError>} A promise of deployed contract or error.
 */
const assertCodeAtAddress = deployedContract =>
  new Promise((resolve, reject) => {
    tx.web3.eth.getCode(deployedContract.address, (error, code) => {
      if (error) reject(error);

      // this caters for the cases where code = "0x", "0x0" or ""
      if (parseInt(code + 0, 16) === 0) {
        reject(new NotDeployedError(deployedContract.address));
      }

      resolve(deployedContract);
    });
  });

/**
 * Returns the contract instance deployed to current network.
 * @param {object} contract - The contract definition.
 * @param {string} contractName - The contact name.
 * @returns {Promise<object>} The contract object.
 * @throws NoNetworkInContractError
 */
const fallbackToAutodetectDeployedContract = (contract, contractName) =>
  contract
    .deployed()
    .catch(error => {
      logger.debug('Current network not found in truffle-contract json');
      throw new NoNetworkInContractError(contractName, error);
    })
    .then(assertCodeAtAddress);

/**
 * Returns the contract artifact
 * @param {string} contractName - The contact name.
 * @returns {Promise<object>} The contract artifact.
 */
// eslint-disable-next-line consistent-return
const getContractArtifact = contractName => {
  if (config.contracts.url) {
    // For frontend apps you can pass the url of the contracts
    // eslint-disable-next-line no-undef
    return fetch(`${config.contracts.url}/${contractName}.json`)
      .then(res => res.json())
      .then(data => Promise.resolve(data))
      .catch(err => Promise.reject(err));
  } else if (config.contracts.dir) {
    // For backend servers you can pass the path of the contracts
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return Promise.resolve(require(`./${path.join(config.contracts.dir, `${contractName}.json`)}`));
  }
};

/**
 * Returns the contract instance by name.
 * @type {Function}
 */
tx.contractInstance = _.memoize(contractName => {
  try {
    if (!/^\w+$/.test(contractName)) {
      throw new Error(`Invalid contract name "${contractName}"`);
    }
    // Load contract artifact file.
    return getContractArtifact(contractName).then(contractArtifact => {
      // Create contract object.
      const contract = truffleContract(contractArtifact);
      contract.setProvider(tx.web3.currentProvider);

      if (_.has(config, ['contracts', 'addresses', contractName])) {
        const contractAddress = config.contracts.addresses[contractName];
        try {
          return contract.at(contractAddress).then(assertCodeAtAddress);
        } catch (e) {
          logger.debug(
            `Contract '${contractName}' could not be found at configured '${contractAddress}'. 
            Falling back to autodetect`
          );
          return fallbackToAutodetectDeployedContract(contract, contractName);
        }
      } else {
        logger.debug(`Address not configured for '${contractName}' contract. Using autodetect...`);
        return fallbackToAutodetectDeployedContract(contract, contractName);
      }
    });
  } catch (error) {
    logger.error(`Error loading contract ${contractName}`, error);
    return Promise.reject(new CvcError(`Error loading contract: ${contractName}`, error));
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
tx.contractInstances = function(...contractNames) {
  const contractInstancePromises = contractNames.map(tx.contractInstance);
  return Promise.all(contractInstancePromises).then(contractInstances => _.zipObject(contractNames, contractInstances));
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
tx.blockNumber = function() {
  return new Promise((resolve, reject) => {
    tx.web3.eth.getBlockNumber((error, result) => {
      if (error) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
    });
  });
};

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
tx.getEvent = function(contractName, eventName, filterBy = {}, additionalFilterObject = {}) {
  // Set marketplace deployment block as default starting point to search events from.
  _.defaults(additionalFilterObject, { fromBlock: config.marketplaceDeploymentBlock });
  return tx
    .contractInstance(contractName)
    .then(instance => {
      const contract = tx.web3.eth.contract(instance.abi).at(instance.address);
      const event = contract[eventName](filterBy, additionalFilterObject);
      return new Promise((resolve, reject) => {
        event.get((error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
    })
    .catch(error => {
      throw mapError(error);
    });
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
tx.getAllEvents = function(contractName, additionalFilterObject) {
  // Set marketplace deployment block as default starting point to search events from.
  _.defaults(additionalFilterObject, { fromBlock: config.marketplaceDeploymentBlock });
  return tx
    .contractInstance(contractName)
    .then(instance => {
      const contract = tx.web3.eth.contract(instance.abi).at(instance.address);
      const events = contract.allEvents(additionalFilterObject);
      return new Promise((resolve, reject) => {
        events.get((error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
    })
    .catch(error => {
      throw mapError(error);
    });
};

/**
 * Makes a read call to specified contract method.
 * @param {string} contractName - The contract name.
 * @param {string} method - The contract's method name.
 * @param {Array<*>} params - The contract method params.
 * @returns {Promise<*>} The method call result.
 */
tx.call = function(contractName, method, params) {
  return tx
    .contractInstance(contractName)
    .then(instance => instance[method](...params))
    .catch(error => {
      throw mapError(error);
    });
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
tx.createTx = function({ fromAddress, contractName, method, args, assignedNonce = false, txOptions = {} }) {
  // merging txOptions
  const updatedTxOptions = _.merge({}, { gas: TX_GAS_LIMIT, gasPrice: TX_GAS_PRICE, chainId: TX_CHAIN_ID }, txOptions);

  // determining nonce and instance promises
  const instancePromise = tx.contractInstance(contractName);
  let noncePromise = updatedTxOptions.nonce ? Promise.resolve(updatedTxOptions.nonce) : undefined;
  if (!noncePromise) {
    noncePromise = assignedNonce ? nonceManager.getNonceForAccount(fromAddress) : Promise.resolve();
  }

  // create a transaction from the input parameters, the contract instance, and an optional nonce
  const createTransaction = ([instance, nonce]) => {
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
      if (!_.has(txOptions, 'nonce') && assignedNonce) {
        nonceManager.getAccount(fromAddress).releaseNonce(nonce);
      }
      throw mapError(error);
    }
  };

  return Promise.all([instancePromise, noncePromise])
    .then(createTransaction)
    .catch(error => {
      throw mapError(error);
    });
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
tx.createPlatformCoinTransferTx = function({ fromAddress, toAddress, value, assignedNonce = false, txOptions = {} }) {
  // Merging txOptions
  const updatedTxOptions = _.merge({}, { gasPrice: TX_GAS_PRICE, chainId: TX_CHAIN_ID }, txOptions);

  // Generating nonce if required
  let noncePromise = updatedTxOptions.nonce ? Promise.resolve(updatedTxOptions.nonce) : undefined;
  if (!noncePromise) {
    noncePromise = assignedNonce ? nonceManager.getNonceForAccount(fromAddress) : Promise.resolve();
  }

  const createTransaction = nonce =>
    withOptionalNonce(nonce, {
      from: fromAddress,
      to: toAddress,
      value,
      gas: '0x5208', // 21000
      gasPrice: `0x${updatedTxOptions.gasPrice.toString(16)}`,
      chainId: `0x${updatedTxOptions.chainId.toString(16)}`
    });

  return noncePromise.then(createTransaction).catch(error => {
    throw mapError(error);
  });
};

/**
 * Returns the transaction receipt by transaction hash.
 * @param {string} txHash - A hash of the transaction to get receipt for.
 * @returns {Promise<TransactionReceipt|CvcError|Error>} A promise of the transaction receipt or error.
 */
tx.getTransactionReceipt = function(txHash) {
  return new Promise((resolve, reject) => {
    tx.web3.eth.getTransactionReceipt(txHash, (error, result) => {
      if (error) {
        logger.error(`Error retrieving transaction receipt for ${txHash}.`, error);
        return reject(mapError(error));
      }
      return resolve(result);
    });
  });
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

  const transactionReceiptAsync = function(resolve, reject, attemptCount = 0) {
    return tx.getTransactionReceipt(txHash).then(receipt => {
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
    });
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
tx.getTransactionCount = address =>
  new Promise((resolve, reject) => {
    tx.web3.eth.getTransactionCount(address, (error, txCount) => {
      if (error) {
        logger.error(`Error retrieving transaction count for ${address}.`, error);
        return reject(mapError(error));
      }
      return resolve(txCount);
    });
  });

/**
 * Waits for transaction to be mined on blockchain and returns the transaction receipt.
 * @param {Promise} txSendPromise - A promise of transaction sending function.
 * @param {number} timeout - Max allowed waiting time before error.
 * @returns {Promise<TransactionReceipt|CvcError|Error>} A promise of the transaction receipt or error.
 */
tx.waitForMine = (txSendPromise, timeout = TX_MINING_TIMEOUT) =>
  txSendPromise
    .then(({ transactionHash: txHash }) => tx.getTransactionReceiptMined(txHash, timeout))
    .then(tx.assertTxReceipt);

/**
 * Checks transaction status & rises error if transaction failed.
 * @param {TransactionReceipt} receipt - A transaction receipt object.
 * @returns {TransactionReceipt} A transaction receipt object.
 * @throws {Error}
 */
tx.assertTxReceipt = receipt => {
  // There are 2 new statuses introduced in Byzantium: 0x0 = fail; 0x1 = success.
  if (Number(receipt.status) === 0) {
    throw new Error('Tx failed');
  }

  return receipt;
};
