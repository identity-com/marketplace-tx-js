const web3admin = require('web3admin');

function MarketplaceTx({ web3, logger, nonceStore }, config) {
  // Extend web3 to expose admin methods.
  web3admin.extend(web3);

  /* eslint-disable global-require */
  // ensure this is called before requiring the submodules
  // as we store config in singleton variable and the next config requires will ignore custom values
  const resolvedConfig = require('./config')(config);
  require('./logger/setup')(logger);
  require('./support/nonce/setup')(web3, nonceStore);

  this.constants = require('./support/constants');
  this.tx = require('./support/tx');
  this.sender = require('./support/sender');
  this.coin = require('./support/coin');
  this.token = require('./token');
  this.util = require('./support/util');
  this.escrow = require('./escrow');
  this.nonce = require('./support/nonce');
  this.errors = require('./support/errors');
  this.asserts = require('./support/asserts');
  this.ontology = require('./ontology');
  this.pricing = require('./pricing');
  this.idvRegistry = require('./idv-registry');
  this.transactionDetails = require('./support/transactionDetails');
  /* eslint-enable global-require */

  this.tx.web3 = web3;
  this.asserts.web3 = web3;

  if (resolvedConfig.preloadContracts) {
    this.tx.loadContracts().catch(error => {
      throw error;
    });
  }
}

module.exports = MarketplaceTx;
