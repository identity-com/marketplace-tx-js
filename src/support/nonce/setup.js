/**
 * @module support/nonce/nonceManager
 *
 * @description A local cache that dispenses nonces, resolving any nonce gaps and
 * ensuring concurrent transactions do not result in nonce clashes.
 * */

const _ = require('lodash');
const logger = require('../../logger/index');
const { mapError } = require('../errors');
const Store = require('../store/inmemory');

const nonceManager = {};

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
 * @alias module:support/nonce/nonceManager.getNonceForAccount
 * @memberOf nonceManager
 * @description Returns the next correct transaction nonce for address.
 * @param address The address to get the nonce for.
 * @returns {Promise<number>}
 */
nonceManager.getNonceForAccount = async function(address) {
  logger.debug(`Requesting nonce for address ${address}`);
  const calculateVacantNonce = async ([txCount, { pending, queued }]) => {
    // Retrieve stored nonces for specific account.
    let nonces = await this.store.get(address);

    // Keep nonces which are not mined yet
    // and release nonces which values are below the account tx count (i.e. lowest possible value).
    nonces = _.pickBy(nonces, (value, nonce) => {
      if (nonce >= txCount) return true;
      logger.debug(`Account '${address}', nonce released: ${Number(nonce)}`);
      return false;
    });

    // Get all known transactions by combining local cache with data from tx pool.
    const knownTransactions = _.assign({}, nonces, pending, queued);

    // Get all used nonces.
    const usedNonces = _.keys(knownTransactions);
    if (usedNonces.length) {
      logger.debug(`Account '${address}', used nonces: ${usedNonces.join(', ')}`);
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

    nonces[nextNonce] = true;
    await this.store.put(address, nonces);
    logger.debug(`Account '${address}', nonce acquired: ${nextNonce}`);

    return nextNonce;
  };

  const txCountPromise = getTransactionCount(address);
  const txPoolPromise = inspectTxPool(address);

  return Promise.all([txCountPromise, txPoolPromise]).then(calculateVacantNonce);
};

nonceManager.releaseAccountNonce = async function(address, nonce) {
  const nonces = await this.store.get(address);
  if (_.isObject(nonces)) {
    delete nonces[Number(nonce)];
    await this.store.put(address, nonces);
  }
  logger.debug(`Account '${address}', nonce released: ${Number(nonce)}`);
};

nonceManager.clearAccounts = async function() {
  logger.debug(`Clearing nonce store...`);
  const addresses = await this.store.keys();
  await this.store.clear();
  addresses.forEach(address => logger.debug(`Account '${address}' nonce cache cleared`));
};

module.exports = (web3, nonceStore) => {
  nonceManager.web3 = web3;
  nonceManager.store = nonceStore || new Store();

  return nonceManager;
};
