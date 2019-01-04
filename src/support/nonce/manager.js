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

    // First acquire lock to avoid race conditions when modifying the list of used nonces
    try {
      await this.store.lock(address);
    } catch (error) {
      logger.error(`Error during acquiring lock for ${address}: ${error.message}`, mapError(error));
      throw error;
    }

    try {
      // Retrieve current transaction count and transaction pool state for the provided account.
      const [txCount, { pending, queued }] = await Promise.all([
        this.getTransactionCount(address),
        this.inspectTxPool(address)
      ]);

      // Retrieve stored nonces for the provided account.
      const storedNonces = await this.store.get(address);

      // Keep nonces which are not mined yet
      // and release nonces which values are below the account tx count (i.e. lowest possible value).
      const assignedNonces = _.pickBy(storedNonces, (value, nonce) => {
        if (nonce >= txCount) return true;
        logger.debug(`Account '${address}', nonce released: ${Number(nonce)}`);
        return false;
      });

      // Get all known transactions by combining stored nonces with data from tx pool.
      const knownTransactions = _.assign({}, assignedNonces, pending, queued);

      // Get all known nonces.
      const knownNonces = _.keys(knownTransactions);
      if (knownNonces.length) {
        logger.debug(`Account '${address}', used nonces: ${knownNonces.join(', ')}`);
      }

      // Calculate max known nonce.
      const maxKnownNonce = knownNonces.reduce((a, b) => Math.max(a, b), txCount);

      // Go from current tx count value (i.e. lowest possible value) to max known nonce looking for the gaps.
      let nextNonce = txCount;
      while (nextNonce <= maxKnownNonce) {
        // Stop at the first non-used nonce (i.e. first gap).
        if (!(nextNonce in knownTransactions)) break;
        // Increment nonce. If no gaps found, return the value next after max used nonce.
        nextNonce += 1;
      }

      // Mark this nonce as assigned to make it unavailable for others
      assignedNonces[nextNonce] = true;

      // Save the list of assigned nonces and release storage lock for the account
      await this.store.put(address, assignedNonces);
      logger.debug(`Account '${address}', nonce acquired: ${nextNonce}`);

      return nextNonce;
    } catch (error) {
      logger.error(`Error calculating nonce for ${address}: ${error.message}`, mapError(error));
      // Release the lock for other threads, hope they will not get the same error
      await this.store.release(address);
      throw error;
    }
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
