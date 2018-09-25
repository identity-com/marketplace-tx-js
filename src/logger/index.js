/**
 * Exports a logger created by marketplace-tx initialisation
 * so that it is available cleanly to all other modules.
 *
 * This file should be imported only after setup has been
 * called for the first time with a logger:
 *
 * require('./logger/setup')(logger);
 */
module.exports = require('./setup')();
