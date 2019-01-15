const InMemoryNonceManager = require('./inmemory');
const AccountInspector = require('./accountInspector');

let nonceManager;

module.exports = (web3, providedNonceManager = null) => {
  if (!nonceManager) {
    nonceManager = providedNonceManager || new InMemoryNonceManager(new AccountInspector(web3));
  }

  return nonceManager;
};
