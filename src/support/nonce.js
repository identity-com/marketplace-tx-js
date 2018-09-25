/**
 * @module support/nonceManager
 *
 * @description A local cache that dispenses nonces, resolving any nonce gaps and
 * ensuring concurrent transactions do not result in nonce clashes.
 * */

const _ = require('lodash');
const logger = require('../logger/index');
const { mapError } = require('./errors');

const nonceManager = {};
module.exports = nonceManager;

// Initialize Account mapping.
nonceManager.accounts = Object.create(null);

/**
 * Account entity manages individual address nonces i.e. provides API to acquire and release unused nonces.
 * It uses internal cache to track issued nonces and communicates to blockchain node to inspect txpool
 * and retrieve actual information about pending and queued transactions.
 * It automatically identifies and fills the gaps in nonce sequence.
 * @param address Checksummed account address
 * @constructor
 */
function Account(address) {
  this.address = address;
  this.nonces = Object.create(null);
}

/**
 * Returns next correct nonce for account.
 * @returns {Promise<number>}
 */
Account.prototype.acquireNonce = function() {
  logger.debug(`Requesting nonce for address ${this.address}`);

  const calculateVacantNonce = ([txCount, { pending, queued }]) => {
    // Cleanup. Release nonce values below the account tx count (i.e. lowest possible value).
    _.keys(this.nonces)
      .filter(nonce => nonce < txCount)
      .map(nonce => this.releaseNonce(nonce));

    // Get all known transactions by combining local cache with data from tx pool.
    const knownTransactions = _.assign({}, this.nonces, pending, queued);

    // Get all used nonces.
    const usedNonces = _.keys(knownTransactions);
    if (usedNonces.length) {
      logger.debug(`Account '${this.address}', used nonces: ${usedNonces.join(', ')}`);
    }

    // Calculate max used nonce.
    const maxUsedNonce = usedNonces.reduce((a, b) => Math.max(a, b), txCount);

    // Go from current tx count value (i.e. lowest possible value) to max known nonce looking for the gaps.
    let nextNonce = txCount;
    while (nextNonce <= maxUsedNonce) {
      // Stop at the first non-used nonce (i.e. first gap).
      if (!(nextNonce in knownTransactions)) break;
      // Increment nonce. If no gaps found, return the value next after max used nonce.
      nextNonce += 1;
    }

    this.nonces[nextNonce] = true;
    logger.debug(`Account '${this.address}', nonce acquired: ${nextNonce}`);

    return nextNonce;
  };

  const txCountPromise = getTransactionCount(this.address);
  const txPoolPromise = inspectTxPool(this.address);

  return Promise.all([txCountPromise, txPoolPromise]).then(calculateVacantNonce);
};
/**
 * Removes nonce from local list of assigned nonces,
 * hence makes it available to be used in other transaction.
 * @param nonce Nonce numeric value.
 */
Account.prototype.releaseNonce = function(nonce) {
  delete this.nonces[Number(nonce)];
  logger.debug(`Account '${this.address}', nonce released: ${Number(nonce)}`);
};

/**
 * Clears local nonce cache.
 */
Account.prototype.clear = function() {
  this.nonces = Object.create(null);
  logger.debug(`Account '${this.address}' local nonce cache cleared`);
};

/**
 * Returns current transaction count for given address.
 *
 * NOTE: There are reports of incorrect behaviour of web3.eth.getTransactionCount
 * which affects the count of pending transactions.
 * https://github.com/ethereum/go-ethereum/issues/2880
 * At this time we could only rely on the count of mined transactions.
 *
 * @param address The address to get the numbers of transactions from.
 * @param defaultBlock The default block number to use when querying a state.
 *   "earliest", the genesis block
 *   "latest", the latest block (current head of the blockchain)
 *   "pending", the currently mined block (including pending transactions)
 * @returns {Promise<number>}
 */
function getTransactionCount(address, defaultBlock) {
  return new Promise((resolve, reject) => {
    nonceManager.web3.eth.getTransactionCount(address, defaultBlock, (error, txCount) => {
      if (error) return reject(mapError(error));
      return resolve(txCount);
    });
  });
}

/**
 * Look into the txpool for an address, and retrieve pending and queued transactions.
 * @param address
 * @returns {Promise<any>}
 */
function inspectTxPool(address) {
  return new Promise((resolve, reject) => {
    nonceManager.web3.txpool.inspect((error, result) => {
      // handle cases where txpool.inspect is not available
      // we just have to assume there is nothing queued in this case
      if (error) {
        if (error.message.includes('Method txpool_inspect not supported.')) {
          return resolve({ pending: {}, queued: {} });
        }
        return reject(mapError(error));
      }
      return resolve({
        pending: result.pending[address] || {},
        queued: result.queued[address] || {}
      });
    });
  });
}

/**
 * @alias module:support/nonceManager.getNonceForAccount
 * @memberOf nonceManager
 * @description Returns the next correct transaction nonce for address.
 * This is kept for API compatibility (consider to remove in favour of working with Account directly)
 * @param address The address to get the nonce for.
 * @returns {Promise<number>}
 */
nonceManager.getNonceForAccount = function(address) {
  return this.getAccount(address).acquireNonce();
};

/**
 * @alias module:support/nonceManager.getAccount
 * @memberOf nonceManager
 * @description Returns Account object for specific address.
 * @param _address
 * @returns {*}
 */
nonceManager.getAccount = function(_address) {
  const address = nonceManager.web3.toChecksumAddress(_address);
  if (!this.accounts[address]) {
    logger.debug(`Creating account for local nonce management: "${address}"`);
    this.accounts[address] = new Account(address);
  }
  return this.accounts[address];
};

/**
 * @alias module:support/nonceManager.clearAccounts
 * @memberOf nonceManager
 * @description Clears all the accounts, hence invalidates local nonce cache.
 */
nonceManager.clearAccounts = function() {
  logger.debug(`Clearing accounts storage, invalidating nonce cache...`);
  _.each(this.accounts, account => account.clear());
};
