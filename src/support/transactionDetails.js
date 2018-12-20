const transactionDetails = {};
module.exports = transactionDetails;

const util = require('util');
// This shim is necessary so that marketplaceTx can be imported in the browser
// See https://github.com/serverless-heaven/serverless-webpack/issues/291#issuecomment-348790713
// See https://github.com/alexjlockwood/avocado/commit/7455bea1052c4d271fe0e6db59f3fb3efdd0349d
require('util.promisify').shim();
const ethUtil = require('ethereumjs-util');
const _ = require('lodash');
const { TX_STATUS } = require('./constants');
const tx = require('./tx');

const txPoolStatuses = [TX_STATUS.PENDING, TX_STATUS.QUEUED];
const formatResult = (status, details) => ({ status, details });

/**
 * Get transaction details from either txPool.content or getTransactionReceipt
 * @param {string} fromAddress - The address of the sender.
 * @param txHash
 * @returns {Promise<object>}
 */
transactionDetails.getTransaction = async function(fromAddress, txHash) {
  const receipt = await tx.getTransactionReceipt(txHash);
  if (receipt) {
    // The transaction hash was found via getTransactionReceipt and therefore has been mined
    return formatResult(TX_STATUS.MINED, receipt);
  }

  // Otherwise check the txPool
  const txPoolContentPromise = util.promisify(cb => tx.web3.txpool.content(cb));

  try {
    const result = await txPoolContentPromise();
    // Convert the fromAddress to the correct casing in order to find it by key notation
    const checksumFromAddress = ethUtil.toChecksumAddress(fromAddress);
    const foundTransaction = searchTxPoolContentResult(result, checksumFromAddress, txHash);

    return foundTransaction || formatResult(TX_STATUS.UNKNOWN, null);
  } catch (error) {
    if (error.message.includes('Method txpool_content not supported.')) {
      return formatResult(TX_STATUS.UNSUPPORTED, null);
    }
    throw error;
  }
};

/**
 * Look into the txpool and find a transaction's status.
 * @param {string} fromAddress - The address of the sender.
 * @param nonce
 * @returns {Promise<string>}
 */
// eslint-disable-next-line consistent-return
transactionDetails.getTransactionStatus = async function(fromAddress, nonce) {
  const txPoolInspectPromise = util.promisify(cb => tx.web3.txpool.inspect(cb));

  try {
    const result = await txPoolInspectPromise();
    // Convert the fromAddress to the correct casing in order to find it by key notation
    const checksumFromAddress = ethUtil.toChecksumAddress(fromAddress);

    // Find the status which contains the transaction, otherwise default to Unknown
    const transactionPoolStatus = getTransactionPoolStatus(result, checksumFromAddress, nonce);

    // If the transaction was found in the txPool, resolve with corresponding status
    if (transactionPoolStatus !== TX_STATUS.UNKNOWN) {
      return transactionPoolStatus;
    }

    // getTransactionCount could include a pending transaction, so we assert this after checking the txPool
    const txCount = await tx.getTransactionCount(fromAddress);
    return nonce < txCount ? TX_STATUS.MINED : TX_STATUS.UNKNOWN;
  } catch (error) {
    if (error.message.includes('Method txpool_inspect not supported.')) {
      return TX_STATUS.UNSUPPORTED;
    }
    throw error;
  }
};

/**
 * Search a txPool.Content result for matching address and txHash, return it and corresponding status.
 * @param txPoolContentResult
 * @param {string} fromAddress - The address of the sender.
 * @param txHash
 * @returns {object}
 */
function searchTxPoolContentResult(txPoolContentResult, fromAddress, txHash) {
  // This is a predicate for use with a find function and a collection of possible txPoolStatuses to search
  // values() creates an array of transactions instead of an object with nonce keyed transactions
  // find() then effectively searches across all nonces for the txHash
  const getTransactionByStatus = statusToFind =>
    _.chain(txPoolContentResult)
      .get([statusToFind, fromAddress])
      .values()
      .find(['hash', txHash])
      .value();

  // For each txPool status, search using getTransactionByStatus and set foundTransaction if found.
  let foundTransaction;
  _.each(txPoolStatuses, status => {
    const transaction = getTransactionByStatus(status);
    if (transaction) {
      foundTransaction = formatResult(status, transaction);
      return false;
    }
    return true;
  });
  return foundTransaction;
}

/**
 * Search a txPool.Inspect result for matching address and nonce, return the corresponding status.
 * @param txPoolInspectResult
 * @param {string} fromAddress - The address of the sender.
 * @param txHash
 * @returns {string}
 */
function getTransactionPoolStatus(txPoolInspectResult, fromAddress, nonce) {
  // This is a predicate for use with a find function and a collection of possible txPoolStatuses to search
  const transactionIsInStatus = statusToFind => _.get(txPoolInspectResult, [statusToFind, fromAddress, nonce]);

  return _.chain(txPoolStatuses)
    .find(transactionIsInStatus)
    .defaultTo(TX_STATUS.UNKNOWN)
    .value();
}
