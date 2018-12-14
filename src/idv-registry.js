/**
 * @module idvRegistry
 *
 * @description Functions to register and retrieve ID Validators in Identity.com
 * */
const idvRegistry = {};
module.exports = idvRegistry;

const _ = require('lodash');
const { assertAddress } = require('./support/asserts');
const tx = require('./support/tx');
const sender = require('./support/sender');
const { CONTRACT_VALIDATOR_REGISTRY } = require('./support/constants');

// Default IDV mining gas limit
const IDV_REGISTRY_SET_GAS_LIMIT = 250000;

/**
 * Converts an array returned from web3 to a IDV data object.
 * @param name
 * @param description
 * @returns {{name: *, description: *}}
 */
const mapIdvRegistryRecord = ([name, description]) => ({
  name,
  description
});

/**
 * Verifies
 * @param record
 * @return {*}
 */
const assertIdvRegistryRecord = record => {
  if (record.name === '') {
    throw new Error('IDV record does not exist');
  }
};

/**
 * @alias module:idvRegistry.set
 * @memberOf idvRegistry
 * @description Adds a new identity validator record or updates the existing one.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idvAddress - The identity validator address.
 * @param {string} idvName - The identity validator name.
 * @param {string} idvDescription - The identity validator description.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @return {Promise<{ transactionHash: string }>} A promise of the transaction hash.
 */
idvRegistry.set = function(fromAddress, signTx, idvAddress, idvName, idvDescription, txOptions = {}) {
  // Merging txOptions with gas override
  const updatedTxOptions = _.merge({}, { gas: IDV_REGISTRY_SET_GAS_LIMIT }, txOptions);
  assertAddress(fromAddress);
  assertAddress(idvAddress);
  return sender.send({
    fromAddress,
    signTx,
    contractName: CONTRACT_VALIDATOR_REGISTRY,
    method: 'set',
    params: [idvAddress, idvName, idvDescription],
    txOptions: updatedTxOptions
  });
};

/**
 * @alias module:idvRegistry.get
 * @memberOf idvRegistry
 * @description Returns the identity validator entry.
 * @param {string} idvAddress - The identity validator address.
 * @returns {Promise<{name: string, description: string}>} - A promise of the identity validator details.
 */
idvRegistry.get = async function(idvAddress) {
  assertAddress(idvAddress);
  const idvRegistryContract = await tx.contractInstance(CONTRACT_VALIDATOR_REGISTRY);
  const idvRegistryRecord = mapIdvRegistryRecord(await idvRegistryContract.get(idvAddress));
  assertIdvRegistryRecord(idvRegistryRecord);

  return { address: idvAddress, ...idvRegistryRecord };
};

/**
 * @alias module:idvRegistry.exists
 * @memberOf idvRegistry
 * @description Verifies whether an identity validator is registered.
 * @param {string} idvAddress - The identity validator address.
 * @returns {Promise<boolean>} - A promise of identity validator status.
 */
idvRegistry.exists = async function(idvAddress) {
  assertAddress(idvAddress);
  const idvRegistryContract = await tx.contractInstance(CONTRACT_VALIDATOR_REGISTRY);

  return idvRegistryContract.exists(idvAddress);
};
