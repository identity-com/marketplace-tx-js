/**
 *
 * @module ontology
 *
 * @description Exposes the CvcOntology contract interface. Functions to add and retrieve
 * {@link CredentialItem}s for sale in Identity.com
 *
 * */

/**
 * A credential item in the Ontology contract. This represents an item that can be priced
 * @global
 * @typedef {Object} module:ontology.CredentialItem
 * @property {string} id - The credential item record internalID.
 * @property {string} type - The credential item type (e.g. credential, claim)
 * @property {string} name - The name of the credential item (unique for type and version)
 * @property {string} version - The credential item version (e.g. v1.0)
 * @property {string} reference - The location of the reference source that describes
 * this credential item
 * @property {string} referenceType - The type of the reference, e.g. URL, DID
 * @property {string} referenceHash - A hash of the document at the reference source,
 * used to ensure it has not been altered
 * @property {boolean} deprecated - True if this is a deprecated credential item
 * that should no longer be used
 */

const ontology = {};
module.exports = ontology;

const tx = require('./support/tx');
const sender = require('./support/sender');
const { assertCredentialItemType, assertAddress } = require('./support/asserts');
const { CONTRACT_ONTOLOGY } = require('./support/constants');
const { NotFoundError } = require('./support/errors');

/**
 * @description Converts an array returned from web3 to a CredentialItem.
 * @see CredentialItem
 * @param {string} id - see {@link CredentialItem}.id
 * @param {string} type - see {@link CredentialItem}.type
 * @param {string} name - see {@link CredentialItem}.name
 * @param {string} version - see {@link CredentialItem}.version
 * @param {string} reference - see {@link CredentialItem}.reference
 * @param {string} referenceType - see {@link CredentialItem}.referenceType
 * @param {string} referenceHash - see {@link CredentialItem}.referenceHash
 * @param {boolean} deprecated - see {@link CredentialItem}.deprecated
 * @return {CredentialItem} The credential item
 */
const mapCredentialItemRecord = ([id, type, name, version, reference, referenceType, referenceHash, deprecated]) => ({
  id,
  type,
  name,
  version,
  reference,
  referenceType,
  referenceHash,
  deprecated
});

/**
 * @param {Array} record - A credential item in Array form (retrieved from Web3)
 * @return {Array}
 */
const assertNotEmpty = record => {
  if (record[0].match(/0x0{64}/)) {
    throw new NotFoundError('Credential item does not exist');
  }

  return record;
};

/**
 * @alias module:ontology.getById
 * @memberOf ontology
 * @description Retrieve a credential item by internal ID
 * @see CredentialItem
 * @param {string} id - see {@link CredentialItem}.id
 * @return {Promise<CredentialItem>}
 */
ontology.getById = function(id) {
  return tx
    .contractInstance(CONTRACT_ONTOLOGY)
    .then(instance => instance.getById(id))
    .then(assertNotEmpty)
    .then(mapCredentialItemRecord);
};

/**
 * @alias module:ontology.getByTypeNameVersion
 * @memberOf ontology
 * @description Retrieve a credential item by type, name and version
 * @see CredentialItem
 * @param {string} type see {@link CredentialItem}.type
 * @param {string} name see {@link CredentialItem}.name
 * @param {string} version see {@link CredentialItem}.version
 * @return {Promise<CredentialItem>}
 */
ontology.getByTypeNameVersion = function(type, name, version) {
  return tx
    .contractInstance(CONTRACT_ONTOLOGY)
    .then(instance => instance.getByTypeNameVersion(type, name, version))
    .then(assertNotEmpty)
    .then(mapCredentialItemRecord);
};

/**
 * @alias module:ontology.getIdByTypeNameVersion
 * @memberOf ontology
 * @description Get the ID of a credential item by its type, name and version
 * @see CredentialItem
 * @param {string} type see {@link CredentialItem}.type
 * @param {string} name see {@link CredentialItem}.name
 * @param {string} version see {@link CredentialItem}.version
 * @return {Promise<String>}
 */
ontology.getIdByTypeNameVersion = function(type, name, version) {
  return tx
    .contractInstance(CONTRACT_ONTOLOGY)
    .then(instance => instance.getByTypeNameVersion(type, name, version))
    .then(assertNotEmpty)
    .then(record => record[0]);
};

/**
 * @alias module:ontology.getAll
 * @memberOf ontology
 * @description Returns all credential items, 2-dimensional array
 * @return {Promise<Array>}
 */
ontology.getAll = function() {
  return tx
    .contractInstance(CONTRACT_ONTOLOGY)
    .then(instance =>
      instance.getAllIds().then(ids => Promise.all(ids.map(id => instance.getById(id).then(mapCredentialItemRecord))))
    );
};

/**
 * @alias module:ontology.add
 * @memberOf ontology
 * @description Add a credential item to the contract
 * @see CredentialItem
 * @param {string} fromAddress - The address of the sender.
 * @param {function} signTx - The callback to use to sign the transaction
 * @param {string} type - see {@link CredentialItem}.type
 * @param {string} name - see {@link CredentialItem}.name
 * @param {string} version - see {@link CredentialItem}.version
 * @param {string} reference - see {@link CredentialItem}.reference
 * @param {string} referenceType - see {@link CredentialItem}.referenceType
 * @param {string} referenceHash - see {@link CredentialItem}.referenceHash
 * @return {Promise}
 */
ontology.add = function(fromAddress, signTx, type, name, version, reference, referenceType, referenceHash) {
  try {
    assertAddress(fromAddress);
    const args = [assertCredentialItemType(type), name, version, reference, referenceType, referenceHash];
    args.forEach(arg => {
      if (!arg || typeof arg !== 'string' || arg.length === 0) {
        throw new Error(`Empty argument passed to Ontology.add (${JSON.stringify(args)})`);
      }
    });
    return sender.send({
      fromAddress,
      signTx,
      contractName: CONTRACT_ONTOLOGY,
      method: 'add',
      params: args
    });
  } catch (e) {
    return Promise.reject(e);
  }
};

/**
 * @alias module:ontology.deprecate
 * @memberOf ontology
 * @description Deprecates a credential item by external ID (type, name and version)
 * @see CredentialItem
 * @param {string} fromAddress - The address of the sender.
 * @param {function} signTx - The callback to use to sign the transaction
 * @param {string} type - see {@link CredentialItem}.type
 * @param {string} name - see {@link CredentialItem}.name
 * @param {string} version - see {@link CredentialItem}.version
 * @return {Promise<String>} Tx hash
 */
ontology.deprecate = function(fromAddress, signTx, type, name, version) {
  try {
    assertAddress(fromAddress);
    const args = [assertCredentialItemType(type), name, version];
    return sender.send({
      fromAddress,
      signTx,
      contractName: CONTRACT_ONTOLOGY,
      method: 'deprecate',
      params: args
    });
  } catch (e) {
    return Promise.reject(e);
  }
};

/**
 * @alias module:ontology.deprecateById
 * @memberOf ontology
 * @description Deprecates a credential item by internal ID
 * @param {string} fromAddress - The address of the sender.
 * @param {function} signTx - The callback to use to sign the transaction
 * @param internalId
 * @return {Promise<String>} Tx hash
 */
ontology.deprecateById = function(fromAddress, signTx, internalId) {
  try {
    assertAddress(fromAddress);
    return sender.send({
      fromAddress,
      signTx,
      contractName: CONTRACT_ONTOLOGY,
      method: 'deprecateById',
      params: [internalId]
    });
  } catch (e) {
    return Promise.reject(e);
  }
};

/**
 * @alias module:ontology.parseExternalId
 * @memberOf ontology
 * @description Converts an "external ID" of a credential item
 * of the form "type-name-version"
 * to an array of strings [type, name, version]
 * @param {string} typeNameVersion
 * @return {string[]}
 */
ontology.parseExternalId = function(typeNameVersion) {
  const results = typeNameVersion.split('-');
  if (results.length !== 3) {
    throw new Error(`Invalid ontology external ID '${typeNameVersion}'. Expected: 'type-name-version'.`);
  }
  const [recordType, name, version] = results;
  return [assertCredentialItemType(recordType), name, version];
};

/**
 * @alias module:ontology.parseExternalId
 * @memberOf ontology
 * @description Convert parameters type, name, version into an "external ID"
 * of the form "type-name-version"
 * @param {string} type - see {@link CredentialItem}.type
 * @param {string} name - see {@link CredentialItem}.name
 * @param {string} version - see {@link CredentialItem}.version
 * @return {string}
 */
ontology.composeExternalId = function(type, name, version) {
  return [assertCredentialItemType(type), name, version].join('-');
};
