const coin = {};
module.exports = coin;

const tx = require('./tx');
const sender = require('./sender');
const logger = require('../logger');

/**
 * Returns platform coin balance for given address.
 * @param address
 * @returns {Promise<any>}
 */
coin.getBalance = function(address) {
  return new Promise((resolve, reject) => {
    tx.web3.eth.getBalance(address, (err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
};

coin.getBalances = function(users) {
  return Promise.all(
    users.map(user => coin.getBalance(user.address).then(balance => Object.assign({}, user, { balance })))
  );
};

coin.transfer = function(fromAddress, signTx, toAddress, value) {
  return sender.sendPlatformCoin({ fromAddress, signTx, toAddress, value }).catch(error => {
    logger.error(`Error transferring platform coin: ${error.message}`);
    throw error;
  });
};
