const coin = {};
module.exports = coin;

const util = require('util');
// This shim is necessary so that marketplaceTx can be imported in the browser
// See https://github.com/serverless-heaven/serverless-webpack/issues/291#issuecomment-348790713
// See https://github.com/alexjlockwood/avocado/commit/7455bea1052c4d271fe0e6db59f3fb3efdd0349d
require('util.promisify').shim();

const tx = require('./tx');
const sender = require('./sender');
const logger = require('../logger');

/**
 * Returns platform coin balance for given address.
 * @param address
 * @returns {Promise<any>}
 */
coin.getBalance = address => util.promisify(cb => tx.web3.eth.getBalance(address, cb))();

/**
 * Returns platform coin balances for multiple addresses.
 * @param users
 * @returns {Promise<any[]>}
 */
coin.getBalances = function(users) {
  return Promise.all(
    users.map(user => coin.getBalance(user.address).then(balance => Object.assign({}, user, { balance })))
  );
};

/**
 *
 * @param {string} fromAddress - The address to send the coins from.
 * @param {function} signTx - The callback to use to sign the transaction.
 * @param {string} toAddress - The address to send the coins to.
 * @param {int} value - The amount of coins to send
 * @returns {Promise<{transactionHash}>}
 */
coin.transfer = function(fromAddress, signTx, toAddress, value) {
  try {
    return sender.sendPlatformCoin({ fromAddress, signTx, toAddress, value });
  } catch (error) {
    logger.error(`Error transferring platform coin: ${error.message}`);
    throw error;
  }
};
