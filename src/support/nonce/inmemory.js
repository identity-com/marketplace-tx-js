const _ = require('lodash');
const logger = require('../../logger');
const { calculateNonce } = require('./util');

/**
 * @classdesc A service that dispenses nonces, resolving any nonce gaps and
 * ensuring concurrent transactions do not result in nonce clashes.
 * */
class InMemoryNonceManager {
  /**
   * @param accountInspector
   */
  constructor(accountInspector) {
    this.accountInspector = accountInspector;
    this.store = {};
  }

  /**
   * Returns the next correct transaction nonce for address.
   * @param address The address to get the nonce for.
   * @returns {Promise<number>}
   */
  async getNonceForAccount(address) {
    logger.debug(`Requesting nonce for address ${address}`);

    // Retrieve current transaction count and transaction pool state for the provided account.
    const [txCount, txPool] = await Promise.all([
      this.accountInspector.getTransactionCount(address),
      this.accountInspector.inspectTxPool(address)
    ]);

    // Everything between store read and write must be sync to avoid any race conditions.
    const storedNonces = this.store[address] || {};

    // Create debug log callback to with address for easier tracing.
    const calculateDebugLog = message => logger.debug(`Nonce manager for account '${address}': ${message}`);

    const { nextNonce, acquiredNonces } = calculateNonce(calculateDebugLog, storedNonces, txCount, txPool);

    // Since nonce manager is a singleton, this prevents other threads to use the same nonce twice.
    this.store[address] = acquiredNonces;

    return nextNonce;
  }

  /**
   * Releases a specific nonce and returns it back to the pool, so that it can be used for other transaction.
   * @param address
   * @param nonce
   * @returns void
   */
  releaseAccountNonce(address, nonce) {
    _.unset(this.store, [address, Number(nonce)]);
    logger.debug(`Nonce manager for account '${address}': nonce released: ${Number(nonce)}`);
  }

  /**
   * Releases multiple nonces at once and returns them back to the pool,
   * so that they can be used for other transactions.
   * @param address
   * @param nonces
   * @returns void
   */
  releaseAccountNonces(address, nonces) {
    _.each(nonces, nonce => this.releaseAccountNonce(address, nonce));
  }

  /**
   * Clears stored nonce data of all accounts.
   * @returns void
   */
  clearAccounts() {
    logger.debug(`Clearing nonce store...`);
    const addresses = Object.keys(this.store);
    this.store = {};
    addresses.forEach(address => logger.debug(`Nonce manager for account '${address}': nonce cache cleared`));
  }
}

module.exports = InMemoryNonceManager;
