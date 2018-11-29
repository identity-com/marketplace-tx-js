const Store = require('../store/inmemory');
const NonceManager = require('./manager');

let nonceManager;

module.exports = (web3, nonceStore) => {
  if (!nonceManager) {
    nonceManager = new NonceManager(web3, nonceStore || new Store());
  }

  return nonceManager;
};
