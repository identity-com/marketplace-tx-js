/** @module support/asserts */
const asserts = {};
module.exports = asserts;

const { TOTAL_SUPPLY, CREDENTIAL_ITEM_TYPES } = require('./constants');

/**
 * @alias module:support/asserts.assertAmount
 * @memberOf support/asserts
 * @description Asserts amount for sanity check.
 * @param {number} amount The escrow amount in creds.
 * @returns {number}
 */
asserts.assertAmount = amount => {
  if (amount < 1 || amount > TOTAL_SUPPLY) {
    throw new Error(`Amount ${amount} is out of range (1-${TOTAL_SUPPLY})`);
  }

  return amount;
};

/**
 * @alias module:support/asserts.assertCredentialItems
 * @memberOf support/asserts
 * @description Asserts credential items array is not empty.
 * @param {Array} credentialItems An array containing credential item IDs
 * @return {Array}
 */
asserts.assertCredentialItems = credentialItems => {
  if (!credentialItems || !credentialItems.length) {
    throw new Error('Credential items must be non-empty array');
  }

  return credentialItems;
};

/**
 * @alias module:support/asserts.assertCredentialItemPrice
 * @memberOf support/asserts
 * @description Asserts that provided number matches valid price criteria.
 * @returns {number}
 * @param price
 */
asserts.assertCredentialItemPrice = price => {
  if (price < 0 || price > TOTAL_SUPPLY) {
    throw new Error(`Price ${price} is out of range (0-${TOTAL_SUPPLY})`);
  }

  return price;
};

/**
 * @alias module:support/asserts.assertAddress
 * @memberOf support/asserts
 * @description Checks if provided string is a valid ETH address.
 * @param {string} addressToTest
 * @returns {string}
 */
asserts.assertAddress = addressToTest => {
  if (!asserts.web3.isAddress(addressToTest)) {
    throw new Error(`Address (${addressToTest}) is not a valid ETH address`);
  }

  return addressToTest;
};

/**
 * @alias module:support/asserts.assertCredentialItemType
 * @memberOf support/asserts
 * @description Allows only certain credential item types
 * @param {string} type
 * @return {string}
 */
asserts.assertCredentialItemType = type => {
  if (!CREDENTIAL_ITEM_TYPES.includes(type)) {
    throw new Error(`Credential item type '${type}' is not supported`);
  }

  return type;
};
