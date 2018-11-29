const _ = require('lodash');
const logger = require('../../logger');
const { mapError } = require('../errors');

/**
 * @classdesc A service that dispenses nonces, resolving any nonce gaps and
 * ensuring concurrent transactions do not result in nonce clashes.
 * */
class NonceManager {
  constructor(web3, store) {
    this.web3 = web3;
    this.store = store;
  }

  /**
   * Returns current transaction count for specific address.
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
  async getTransactionCount(address, defaultBlock) {
    return new Promise((resolve, reject) => {
      this.web3.eth.getTransactionCount(address, defaultBlock, (error, txCount) => {
        if (error) return reject(mapError(error));
        return resolve(txCount);
      });
    });
  }

  /**
   * Retrieves txpool content (pending and queued transactions) for specific address.
   * @param address
   * @returns {Promise<any>}
   */
  async inspectTxPool(address) {
    return new Promise((resolve, reject) => {
      this.web3.txpool.inspect((error, result) => {
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
   * Returns the next correct transaction nonce for address.
   * @param address The address to get the nonce for.
   * @returns {Promise<number>}
   */
  async getNonceForAccount(address) {
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

    const txCountPromise = this.getTransactionCount(address);
    const txPoolPromise = this.inspectTxPool(address);

    return Promise.all([txCountPromise, txPoolPromise]).then(calculateVacantNonce);
  }

  /**
   * Releases a specific nonce and returns it back to the pool, so that it can be used for other transaction.
   * @param address
   * @param nonce
   * @returns {Promise<void>}
   */
  async releaseAccountNonce(address, nonce) {
    const storedNonces = await this.store.get(address);
    if (_.isObject(storedNonces)) {
      delete storedNonces[Number(nonce)];
      await this.store.put(address, storedNonces);
    }
    logger.debug(`Account '${address}', nonce released: ${Number(nonce)}`);
  }

  /**
   * Releases multiple nonces at once and returns them back to the pool,
   * so that they can be used for other transactions.
   * @param address
   * @param nonces
   * @returns {Promise<void>}
   */
  async releaseAccountNonces(address, nonces) {
    if (_.isEmpty(nonces)) return;

    const storedNonces = await this.store.get(address);
    if (_.isObject(storedNonces)) {
      nonces.forEach(nonce => delete storedNonces[Number(nonce)]);
      await this.store.put(address, storedNonces);
    }
    nonces.forEach(nonce => logger.debug(`Account '${address}', nonce released: ${Number(nonce)}`));
  }

  /**
   * Clears stored nonce data of all accounts.
   * @returns {Promise<void>}
   */
  async clearAccounts() {
    logger.debug(`Clearing nonce store...`);
    const addresses = await this.store.keys();
    await this.store.clear();
    addresses.forEach(address => logger.debug(`Account '${address}' nonce cache cleared`));
  }
}

module.exports = NonceManager;
