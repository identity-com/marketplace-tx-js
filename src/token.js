const token = {};
module.exports = token;

const Bn = require('bignumber.js');
const tx = require('./support/tx');
const sender = require('./support/sender');
const logger = require('./logger');
const { CONTRACT_TOKEN, ONE_CVC } = require('./support/constants');

token.getBalances = function(users) {
  return tx.contractInstance(CONTRACT_TOKEN).then(instance => {
    const promises = users.map(user =>
      instance.balanceOf(user.address).then(value => Object.assign({}, user, { balance: value }))
    );
    return Promise.all(promises);
  });
};

token.getBalance = function(address) {
  return tx.contractInstance(CONTRACT_TOKEN).then(instance => instance.balanceOf(address));
};

token.transfer = function(fromAddress, signTx, to, value) {
  return sender
    .send({
      fromAddress,
      signTx,
      contractName: CONTRACT_TOKEN,
      method: 'transfer',
      params: [to, value]
    })
    .catch(error => {
      logger.error(`Error transferring token: ${error.message}`);
      throw error;
    });
};

token.approveWithReset = function(fromAddress, signTx, spender, value) {
  const promise = new Promise((resolve, reject) => {
    try {
      tx
        .call(CONTRACT_TOKEN, 'allowance', [fromAddress, spender])
        .then(amount => {
          if (amount > 0) {
            return sender.send({
              fromAddress,
              signTx,
              contractName: CONTRACT_TOKEN,
              method: 'approve',
              params: [spender, 0]
            });
          }
          return Promise.resolve(true);
        })
        .then(() => {
          sender
            .send({
              fromAddress,
              signTx,
              contractName: CONTRACT_TOKEN,
              method: 'approve',
              params: [spender, value]
            })
            .then(hash => {
              resolve(hash);
            })
            .catch(e => {
              reject(new Error(`Error approving token transfer: ${e}`));
              logger.error('Error approving token transfer:', e);
            });
        })
        .catch(e => {
          reject(new Error(`Error approving token transfer: ${e}`));
          logger.error('Error approving token transfer:', e);
        });
    } catch (e) {
      reject(new Error(`Error token.approve: ${e}`));
      logger.error('Error token.approve:', e);
    }
  });
  return promise;
};

token.allowance = function(owner, spender) {
  return tx.contractInstance(CONTRACT_TOKEN).then(instance => instance.allowance(owner, spender));
};

token.approve = function(fromAddress, signTx, spender, value) {
  return sender
    .send({
      fromAddress,
      signTx,
      contractName: CONTRACT_TOKEN,
      method: 'approve',
      params: [spender, value]
    })
    .catch(error => {
      logger.error(`Error approving token transfer: ${error.message}`);
      throw error;
    });
};

/**
 * Converts the amount from creds to CVC.
 * @param {number|string|BigNumber} amount - Amount in creds.
 * @return {number} Amount in CVC.
 */
token.toCVC = amount => new Bn(amount).div(ONE_CVC).toNumber();

/**
 * Converts amount from CVC to creds.
 * @param {number|string|BigNumber} amount - Amount in CVC.
 * @return {number} Amount in creds.
 */
token.toCred = amount => new Bn(amount).mul(ONE_CVC).toNumber();
