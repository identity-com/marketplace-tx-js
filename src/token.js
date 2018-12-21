const token = {};
module.exports = token;

const Bn = require('bignumber.js');
const tx = require('./support/tx');
const sender = require('./support/sender');
const logger = require('./logger');
const { CONTRACT_TOKEN, ONE_CVC } = require('./support/constants');
const { assertAddress } = require('./support/asserts');

const approve = async (fromAddress, signTx, spender, value) => {
  assertAddress(fromAddress);
  assertAddress(spender);

  return sender.send({
    fromAddress,
    signTx,
    contractName: CONTRACT_TOKEN,
    method: 'approve',
    params: [spender, value]
  });
};

token.getBalances = async function(users) {
  const tokenContract = await tx.contractInstance(CONTRACT_TOKEN);

  const balancePromises = users.map(async user => {
    const balance = await tokenContract.balanceOf(user.address);
    return Object.assign({}, user, { balance });
  });
  return Promise.all(balancePromises);
};

token.getBalance = async function(address) {
  const tokenContract = await tx.contractInstance(CONTRACT_TOKEN);
  return tokenContract.balanceOf(address);
};

token.transfer = async function(fromAddress, signTx, to, value) {
  assertAddress(fromAddress);
  assertAddress(to);

  try {
    return await sender.send({
      fromAddress,
      signTx,
      contractName: CONTRACT_TOKEN,
      method: 'transfer',
      params: [to, value]
    });
  } catch (error) {
    logger.error(`Error transferring token: ${error.message}`);
    throw error;
  }
};

token.approveWithReset = async function(fromAddress, signTx, spender, value) {
  try {
    const tokenContract = await tx.contractInstance(CONTRACT_TOKEN);
    const currentAllowance = await tokenContract.allowance(fromAddress, spender);
    if (currentAllowance > 0) {
      // Non-zero allowance cannot be updated, so reset it to zero first.
      await approve(fromAddress, signTx, spender, 0);
    }
    return await approve(fromAddress, signTx, spender, value);
  } catch (error) {
    logger.error(`Error approving token transfer: ${error.message}`);
    throw error;
  }
};

token.allowance = async function(owner, spender) {
  const tokenContract = await tx.contractInstance(CONTRACT_TOKEN);
  return tokenContract.allowance(owner, spender);
};

token.approve = async function(fromAddress, signTx, spender, value) {
  try {
    return await approve(fromAddress, signTx, spender, value);
  } catch (error) {
    logger.error(`Error approving token transfer: ${error.message}`);
    throw error;
  }
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
