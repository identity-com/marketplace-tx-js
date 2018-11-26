/* eslint-disable import/no-extraneous-dependencies */
// FIXME we could chain the promises a little bit better in this module
const util = require('util');
const EthTx = require('ethereumjs-tx');
// This shim is necessary so that marketplaceTx can be imported in the browser
// See https://github.com/serverless-heaven/serverless-webpack/issues/291#issuecomment-348790713
// See https://github.com/alexjlockwood/avocado/commit/7455bea1052c4d271fe0e6db59f3fb3efdd0349d
require('util.promisify').shim();

const serializeError = require('serialize-error');

const _ = require('lodash');

const { timeout } = require('./util');
const nonceManager = require('./nonce');
const tx = require('./tx');
const logger = require('../logger');
const { mapError, InvalidNonceError, FailedTxChainError, SignerSenderAddressMismatchError } = require('./errors');
const config = require('../config')();

// Defaults:
// Wait for mine timeout value between chained transactions (in seconds)
const TX_CHAIN_MINING_TIMEOUT = process.env.TX_MINING_TIMEOUT || config.txMiningTimeout || 120;
// Let signing to take up to one minute
const TX_SIGNING_TIMEOUT = process.env.TX_SIGNING_TIMEOUT || config.txSigningTimeout || 60000;
// Gas limit required to send ETH coin
const ETH_TX_GAS_LIMIT = 21000;

/**
 * Sends signed transaction to blockchain node.
 * @param hex Signed transaction
 * @returns {Promise<any>}
 */
function sendRawTransaction(hex) {
  logger.debug('marketplace-tx sendRawTransaction sending raw tx: ', hex);
  const sendRawTransactionPromise = util.promisify(cb => {
    logger.debug('Calling tx.web3.eth.sendRawTransaction.', hex);
    return tx.web3.eth.sendRawTransaction(hex, cb);
  });

  return sendRawTransactionPromise()
    .then(txHash => {
      logger.info(`Transaction hash: ${txHash}`, hex);
      return { transactionHash: txHash };
    })
    .catch(error => {
      logger.error('sendRawTransactionPromise rejected: ', error, hex);
      throw mapError(error);
    });
}

/**
 * Signs a transaction (online) and sends to the blockchain node
 * @param transaction a transaction to sign and send to the blockchain.
 * @returns {Promise<any>}
 */
function signAndSend(transaction) {
  const sendTransactionPromise = util.promisify(cb => tx.web3.eth.sendTransaction(transaction, cb));

  return sendTransactionPromise()
    .then(txHash => {
      logger.info(`Transaction hash: ${txHash}`, transaction);
      return { transactionHash: txHash };
    })
    .catch(error => {
      throw mapError(error);
    });
}

// Make sure we used fromAddress's private key to sign tx
const assertSignerMatchesSender = expectedFromAddress => signedTx => {
  const ethtx = new EthTx(signedTx);
  const signerAddress = `0x${ethtx.getSenderAddress().toString('hex')}`;
  if (signerAddress !== expectedFromAddress) {
    throw new SignerSenderAddressMismatchError(signerAddress, expectedFromAddress);
  }

  return signedTx;
};

/**
 * @param {Array|Object} arrayOrObject
 * @returns {Object}
 */
function destructArray(arrayOrObject) {
  return _.isArray(arrayOrObject) ? _.head(arrayOrObject) : arrayOrObject;
}

function TransactionChainToSend({ fromAddress, signTx, transactions, txOptions = {} }) {
  // Merging txOptions
  const updatedTxOptions = _.merge({}, { waitForMineTimeout: TX_CHAIN_MINING_TIMEOUT }, txOptions);

  const unprocessedTransactions = _.clone(transactions);
  let unprocessedRawTransactions = [];

  // if a signTx callback exists, the transactions are externally signed,
  // otherwise they can be sent directly to web3 to sign and send
  const externallySigned = !!signTx;

  // given a signed transaction, send it and wait for mining to be complete
  const sendAndConfirmSignedTx = signedTx =>
    tx.waitForMine(sendRawTransaction(signedTx), updatedTxOptions.waitForMineTimeout);
  // given an unsigned transaction, sign it online and send it to the blockchain
  const sendSignAndConfirmTx = transaction =>
    tx.waitForMine(signAndSend(transaction), updatedTxOptions.waitForMineTimeout);
  // given a transaction, if we are signing online, sign and send,
  // otherwise send the raw signed transaction
  const sendAndConfirm = externallySigned ? sendAndConfirmSignedTx : sendSignAndConfirmTx;

  // reduce an array of transactions ready to be sent to web3
  // into one single promise.
  // If we are signing them online they will be signed. Otherwise we
  // expect them to have already been signed
  // Each transaction will be sent and awaited for mining receipt.
  const sendAndConfirmReducer = (promise, transaction) => {
    logger.debug('sendAndConfirmReducer for transaction: ', transaction);
    return promise.then(() =>
      sendAndConfirm(transaction).then(result => {
        // Remove processed transaction.
        unprocessedTransactions.shift();
        unprocessedRawTransactions.shift();
        return result;
      })
    );
  };

  // given an array of transactions or single transaction,
  // send and confirm them in oder and return a promise
  // that resolves when they have all resolved
  const sendAndConfirmInOrder = txs => _.castArray(txs).reduce(sendAndConfirmReducer, Promise.resolve());

  // handle a transaction chain send error
  const handleSendError = error => {
    logger.error('Tx send error:', serializeError(error));
    unprocessedRawTransactions.forEach(async (rawTx, idx) => {
      // We do NOT release failed transaction (i.e. first unprocessed tx) nonce
      // if it failed due to the issue with that specific nonce.
      // We release all unprocessed transaction nonces regardless of error type, so they could be recalculated.
      if (idx > 0 || !(error instanceof InvalidNonceError)) {
        await nonceManager.releaseAccountNonce(fromAddress, rawTx.nonce);
      }
    });

    throw new FailedTxChainError(unprocessedTransactions, error);
  };

  // given an array of transactions, sign them all. If they take too long, time the operation out
  const signAll = rawTransactions =>
    timeout(signTx(fromAddress, rawTransactions), TX_SIGNING_TIMEOUT).then(signedTransactions =>
      signedTransactions.map(assertSignerMatchesSender(fromAddress))
    );

  // given an array of web3 transaction objects, sign them if they are
  // to be externally signed, and then send them to the blockchain
  const sendTransactions = rawTransactions => {
    // Copy to prevent external modification.
    unprocessedRawTransactions = _.clone(rawTransactions);

    const transactionsToSendPromise = externallySigned ? signAll(rawTransactions) : Promise.resolve(rawTransactions);

    return transactionsToSendPromise
      .then(signedTransactions => {
        logger.debug(
          'Signed transactions being submitted from marketplace-tx.sender.sendTransactions: ',
          signedTransactions
        );
        return signedTransactions;
      })
      .then(sendAndConfirmInOrder)
      .catch(error => {
        // Log the error here, because we don't have access to the transactions inside handleSendError.
        logger.error('Could not sign or sendAndConfirmInOrder transactions. ', rawTransactions);
        return handleSendError(error);
      });
  };

  /**
   * Send the chain of transactions
   * @return {*}
   */
  this.send = () =>
    tx
      .createTxChain({
        fromAddress,
        transactions: unprocessedTransactions,
        assignedNonce: externallySigned,
        txOptions: updatedTxOptions
      })
      .then(sendTransactions);
}

/**
 * Builds, signs and sends transactions sequentially.
 * Each transaction is pending for previous to be mined.
 * Example:
 * sendChain(fromAddress, signTx, [
 *   { contract: 'ERC20Token', method: 'approve', args: [escrowContract.address, amount] },
 *   { contract: 'CvcEscrow', method: 'place', args: [idvAddress, userId, attestationId, amount] }
 * ], 3)
 * @params
 *  fromAddress
 *  signTx
 *  transactions Arr of transaction data
 * @return {Promise|*|PromiseLike<T>|Promise<T>}
 */
const sendChain = function(parameters) {
  return new TransactionChainToSend(parameters).send();
};

/**
 * Send a transaction via the external signer if a signing callback
 * is provided, otherwise just send it.
 * @param {function} signTx - The callback to use to sign the transaction
 * @param transaction
 * @return {*}
 */
const sendTransaction = ({ transaction, signTx }) => {
  if (signTx) {
    const signPromise = signTx(transaction.from, transaction);

    return timeout(signPromise, TX_SIGNING_TIMEOUT)
      .then(destructArray)
      .then(assertSignerMatchesSender(transaction.from))
      .then(sendRawTransaction);
  }
  return signAndSend(transaction);
};

/**
 * Handle any error when sending a transaction
 * @param parameters the parameters used to generate the transaction
 * @param nonce optional - if exists, the nonce given to this transaction before externally signing it
 * @return {Function}
 */
const handleSendError = ({ parameters, nonce }) => async error => {
  logger.error('Tx send error:', serializeError(error));
  // If we assigned a nonce to this transaction, release it.
  // We do NOT release nonce if transaction failed due to the issue with that specific nonce.
  if (nonce && !(error instanceof InvalidNonceError)) {
    await nonceManager.releaseAccountNonce(parameters.fromAddress, nonce);
  }
  throw error;
};

/**
 * Sends transaction to the contract.
 * @param parameters:
 *  fromAddress Address to send transaction from.
 *  signTx Optional transaction signing callback.
 *  contractName Contract name.
 *  method Contract method to call.
 *  params Contract method parameters.
 *  txOptions Map of available transaction overrides (eg: gas, gasPrice, nonce, waitForMineTimeout, etc)
 * @return {*}
 */
const send = function(parameters) {
  const { fromAddress, signTx, contractName, method, params, value = '0x0', txOptions = {} } = parameters;

  // handle any error, passing the original transaction into the error handler
  // to handle any cleanup
  const sendWithErrorHandling = transaction =>
    sendTransaction({ transaction, signTx }).catch(handleSendError({ parameters, nonce: transaction.nonce }));

  return tx
    .createTx({
      fromAddress,
      contractName,
      method,
      value,
      args: params,
      // if the transaction is externally signed, we need to assign a nonce when creating the transaction
      assignedNonce: !!signTx,
      txOptions
    })
    .then(sendWithErrorHandling);
};

/**
 * Sends
 * @param parameters
 *  fromAddress: The address to send the coins from
 *  toAddress: The address to send the coins to
 *  signTx: Optional transaction signing callback
 *  value: The coins to send
 *  txOptions Map of available transaction overrides (eg: gas, gasPrice, nonce, waitForMineTimeout, etc)
 * @return {*}
 */
const sendPlatformCoin = function(parameters) {
  const { fromAddress, toAddress, signTx, value, txOptions = {} } = parameters;
  // Merge txOptions
  const updatedTxOptions = _.merge({}, { gas: ETH_TX_GAS_LIMIT }, txOptions);

  // handle any error, passing the original transaction into the error handler
  // to handle any cleanup
  const sendWithErrorHandling = transaction =>
    sendTransaction({ transaction, signTx }).catch(handleSendError({ parameters, nonce: transaction.nonce }));

  return tx
    .createPlatformCoinTransferTx({
      fromAddress,
      toAddress,
      value,
      // if the transaction is externally signed, we need to assign a nonce when creating the transaction
      assignedNonce: !!signTx,
      txOptions: updatedTxOptions
    })
    .then(sendWithErrorHandling);
};

module.exports = {
  send,
  sendChain,
  sendPlatformCoin
};
