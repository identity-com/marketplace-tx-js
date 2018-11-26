/**
 * Exports a nonce manager created by marketplace-tx initialisation
 * so that it is available cleanly to all other modules.
 *
 * This file should be imported only after setup has been
 * called for the first time with required dependencies:
 *
 * require('./support/nonce/setup')(web3, nonceStore);
 */
module.exports = require('./setup')();
