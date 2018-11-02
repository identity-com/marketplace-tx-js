/**
 * @module escrow
 *
 * @description Exposes the CvcEscrow contract interface. Functions to place, release and refund escrow payments
 * as well as administrative functions to set and retrieve the platform fee and escrow payment timeout thresholds.
 */
const escrow = {};
module.exports = escrow;

/**
 * @description The escrow contract placement state.
 * @typedef {Object} PlacementDetails
 * @property {number} amount - The placement amount in CVC.
 * @property {number} paymentState - The placement state: 0 ='Empty', 1 = 'Placed', 2 = 'Released', 3 = 'Canceled'.
 * @property {Array<string>} credentialItems - An array of credential item IDs.
 * @property {number} confirmations - Number of confirmations
 * i.e. blocks passed since the block with placement transaction.
 * @property {bool} canRefund - The placement refundability status:
 * false - the placement is not refundable,
 * true - the placement can be refunded.
 */

const _ = require('lodash');
const tx = require('./support/tx');
const sender = require('./support/sender');
const { toCVC } = require('./token');
const { CVC_DECIMALS, CONTRACT_TOKEN, CONTRACT_ESCROW } = require('./support/constants');
const logger = require('./logger');
const { assertAddress, assertAmount, assertCredentialItems } = require('./support/asserts');
const ontology = require('./ontology');

// Default gas limits per transaction type:
const PLACE_GAS_LIMIT = 250000;
const RELEASE_GAS_LIMIT = 100000;
const REFUND_GAS_LIMIT = 100000;

/**
 * @description Generates a list of transactions that must be made in order to place CVC into escrow.
 *
 * If the sourceAddress has already pre-approved a CVC transfer balance to the escrow contract greater than the
 * amount of the placement, then we can make the placement directly.
 *
 * If the sourceAddress has not pre-approved, then we need to make an approve transaction on the CvcToken contract.
 * If the sourceAddress has pre-approved, but the amount is not sufficient, then we need to first drop the allowance
 * to zero (https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729) and then make an approve transaction.
 *
 * @param {object} contracts An object containing CvcEscrow & CvcToken contracts
 * @param {string} sourceAddress The address of the account making the escrow placement
 * @param {string} recipientAddress The recipientAddress of the escrow payment (once released)
 * @param {Array<string>}  scopeRequestIds The scope request IDs to which the escrow payment refers
 * @param {number} amount The amount of creds to put in escrow
 * @param {Array} credentialItems An array of ontology record IDs
 * @return {Array} The transactions that need to be executed (in sequence) in order to make escrow placement
 */
const createEscrowPlaceTransactions = (
  contracts,
  sourceAddress,
  recipientAddress,
  scopeRequestIds,
  amount,
  credentialItems
) => {
  const allowancePromise = contracts.CvcToken.allowance(sourceAddress, contracts.CvcEscrow.address);

  /**
   * @description Creates a set of CVC approve transactions to ensure the batch placements can be successfully made.
   * ERC20 tokens require a two step transfer process.
   * 1) Approve CVC transfer of X from A to B (token.approve). Triggered by A (the requester in this case)
   * 2) Transfer up to X CVC from A to B (token.transferFrom). Triggered by B (the escrow contract)
   *
   * If the current approved amount is zero, approve X. (one transaction)
   *
   * If the current approved amount is non-zero but less than X, then this function
   * reduces the approved balance to zero and re-approves X CVC.
   * contract does not allow topping up a non-zero approval balance.) (two transactions)
   *
   * If the current approved amount is greater than X, add nothing. (zero transactions)
   *
   * @param {number} allowance The current approved amount from the requester to the escrow contract.
   * @return {Array} A list of 0, 1 or 2 approval transactions.
   */
  const approveTransactions = allowance => {
    logger.debug('approveTransactions current allowance', {
      allowance,
      contractAddress: contracts.CvcEscrow.address,
      sourceAddress,
      scopeRequestIds
    });

    const approvalTransactions = [];

    if (allowance.eq(0)) {
      // fromAddress has not approved any CVC into the escrow contract. We need to send an approve transaction first
      approvalTransactions.push({
        contract: CONTRACT_TOKEN,
        method: 'approve',
        args: [contracts.CvcEscrow.address, amount]
      });
    } else if (allowance.lt(amount)) {
      // fromAddress has approved CVC to the escrow contract, but it is not sufficient for the escrow payment.
      // We need to top up the allowance.
      // since the CVC ERC20 token contract does not allow topping up a non-zero approval balance,
      // this means we must first reduce the allowance to zero and then top up
      approvalTransactions.push({
        contract: CONTRACT_TOKEN,
        method: 'approve',
        args: [contracts.CvcEscrow.address, 0]
      });
      approvalTransactions.push({
        contract: CONTRACT_TOKEN,
        method: 'approve',
        args: [contracts.CvcEscrow.address, amount]
      });
    } // else allowance >= amount - we have enough for the batch escrow placements

    return approvalTransactions;
  };

  /**
   * @description Creates the placement transaction and returns as a single element array
   * to be chained to other transaction creators.
   * @return {object} Escrow placement transaction params.
   */
  const placementTransactions = () => [
    {
      contract: CONTRACT_ESCROW,
      method: 'placeBatch',
      args: [recipientAddress, scopeRequestIds, amount, credentialItems]
    }
  ];

  /**
   * @description Calls a transaction creator and adds the result to a (possibly empty) list)
   * @param {function} transactionCreator - A function which returns transaction params.
   * @return {function(*=): Array} - Curried function that, given a transaction creator,
   * concatenates its result to a passed in (possibly empty) list
   */
  const addToList = transactionCreator => (list = []) => [...list, ...transactionCreator()];

  const createApproveTransactions = allowance => addToList(() => approveTransactions(allowance))();
  const addPlacementTransactions = addToList(placementTransactions);

  return allowancePromise.then(createApproveTransactions).then(addPlacementTransactions);
};

/**
 * @description Adds escrow function return value and transaction receipt to resulting object.
 * @param {object} transactionReceipt - The blockchain transaction result.
 * @param {string} fromAddress - The transaction sender address.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array<string>} scopeRequestIds - An array of scope request identifiers.
 * @returns {object} A promise of transaction hash (see tx.js module) and returnValue object with placementId.
 */
function addPlacementReturnValue(transactionReceipt, fromAddress, idvAddress, scopeRequestIds) {
  if (_.isEmpty(scopeRequestIds)) {
    return {
      returnValue: {},
      ...transactionReceipt
    };
  }

  return escrow.calculatePlacementId(fromAddress, idvAddress, scopeRequestIds).then(placementId => ({
    returnValue: {
      placementId
    },
    ...transactionReceipt
  }));
}

/**
 * @alias module:escrow.place
 * @memberOf escrow
 * @description Places CVC tokens into escrow smart contract.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idvAddress - The identity validator address.
 * @param {string} scopeRequestId - Scope request identifier.
 * @param {number} amount - CVC token amount in creds (CVC x 10e-8).
 * @param {Array<string>} credentialItems - Array of credential item IDs.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @param {number} [txOptions.waitForMineTimeout] - Max time to wait for transaction receipt before raising an error.
 * @returns {Promise<Array<object>>} An promise of an array of objects containing
 * transaction hash (see tx.js module) and returnValue object with placementId.
 */
escrow.place = function(fromAddress, signTx, idvAddress, scopeRequestId, amount, credentialItems, txOptions = {}) {
  return escrow.placeBatch(fromAddress, signTx, idvAddress, [scopeRequestId], amount, credentialItems, txOptions);
};

/**
 * @alias module:escrow.placeBatch
 * @memberOf escrow
 * @description Places CVC tokens into escrow smart contract.
 * Allows the batching of scope request IDs to reduce transaction costs.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array<string>} scopeRequestIds - An array containing scope request identifiers.
 * @param {number} amount - CVC token amount in creds (CVC x 10e-8).
 * @param {Array<string>} credentialItems - Array of credential item IDs.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @param {number} [txOptions.waitForMineTimeout] - Max time to wait for
 * transaction receipt before raising an error.
 * @returns {Promise<Array<object>>} An promise of an array of objects
 * containing transaction hash (see tx.js module) and returnValue object with placementId.
 */
escrow.placeBatch = function(
  fromAddress,
  signTx,
  idvAddress,
  scopeRequestIds,
  amount,
  credentialItems,
  txOptions = {}
) {
  assertAddress(fromAddress);
  assertAddress(idvAddress);
  assertAmount(amount);
  assertCredentialItems(credentialItems);

  // Merge txOptions
  const updatedTxOptions = _.merge({}, { gas: PLACE_GAS_LIMIT }, txOptions);

  // Logging
  const normalizedIds = scopeRequestIds.map(normalizeScopeRequestId);
  logger.debug('Placing escrow', {
    fromAddress,
    idvAddress,
    scopeRequestIds,
    normalizedIds,
    amount: toCVC(amount).toFixed(CVC_DECIMALS),
    credentialItems,
    txOptions: updatedTxOptions
  });

  return Promise.all([
    tx.contractInstances(CONTRACT_TOKEN, CONTRACT_ESCROW),
    Promise.all(credentialItems.map(ontology.parseExternalId).map(args => ontology.getIdByTypeNameVersion(...args)))
  ])
    .then(([contracts, internalIds]) =>
      createEscrowPlaceTransactions(contracts, fromAddress, idvAddress, normalizedIds, amount, internalIds)
    )
    .then(transactions => {
      if (transactions && transactions.length > 1) {
        logger.debug('More than one transaction batched during escrow place ', {
          fromAddress,
          idvAddress,
          transactions,
          scopeRequestIds
        });
      }
      return sender.sendChain({
        fromAddress,
        signTx,
        transactions,
        txOptions: updatedTxOptions
      });
    })
    .then(receipt => addPlacementReturnValue(receipt, fromAddress, idvAddress, scopeRequestIds));
};

/**
 * @alias module:escrow.release
 * @memberOf escrow
 * @description Releases placed CVC tokens from escrow contract.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {string} scopeRequestId - Scope request identifier.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @returns {Promise<object>} A promise of the transaction hash (see tx.js module)
 * and returnValue object with placementId.
 */
escrow.release = function(fromAddress, signTx, idrAddress, idvAddress, scopeRequestId, txOptions = {}) {
  return escrow.releaseBatch(fromAddress, signTx, idrAddress, idvAddress, [scopeRequestId], [], txOptions);
};

/**
 * @alias module:escrow.releaseBatch
 * @memberOf escrow
 * @description Releases placed CVC tokens from escrow contract.
 * Allows the batching of scope request IDs to reduce transaction costs.
 * Also allows partial release by providing the list of scope request IDs which should be kept in escrow.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array} scopeRequestIdsToRelease - An array of scope request IDs which will be released.
 * @param {Array} scopeRequestIdsToKeep - An array of scope request IDs which will be kept in escrow.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @returns {Promise<object>} A promise of the transaction hash (see tx.js module)
 * and returnValue object with placementId.
 */
escrow.releaseBatch = function(
  fromAddress,
  signTx,
  idrAddress,
  idvAddress,
  scopeRequestIdsToRelease,
  scopeRequestIdsToKeep,
  txOptions = {}
) {
  // Merge txOptions
  // gas limit has to be adjusted in case of partial release, as it issues a new placement on the blockchain
  const updatedTxOptions = _.merge(
    {},
    { gas: scopeRequestIdsToKeep.length ? RELEASE_GAS_LIMIT + PLACE_GAS_LIMIT : RELEASE_GAS_LIMIT },
    txOptions
  );

  const normalizedScopeRequestIdsToRelease = scopeRequestIdsToRelease.map(normalizeScopeRequestId);
  const normalizedScopeRequestIdsToKeep = scopeRequestIdsToKeep.map(normalizeScopeRequestId);
  logger.debug('Releasing batch escrow', {
    fromAddress,
    idrAddress,
    idvAddress,
    scopeRequestIdsToRelease,
    scopeRequestIdsToKeep,
    normalizedScopeRequestIdsToRelease,
    normalizedScopeRequestIdsToKeep,
    txOptions: updatedTxOptions
  });

  return sender
    .send({
      fromAddress: assertAddress(fromAddress),
      signTx,
      contractName: 'CvcEscrow',
      method: 'releaseBatch',
      params: [
        assertAddress(idrAddress),
        assertAddress(idvAddress),
        normalizedScopeRequestIdsToRelease,
        normalizedScopeRequestIdsToKeep
      ],
      txOptions: updatedTxOptions
    })
    .then(receipt => addPlacementReturnValue(receipt, idrAddress, idvAddress, normalizedScopeRequestIdsToKeep));
};

/**
 * @alias module:escrow.verify
 * @memberOf escrow
 * @description Verifies escrow placement state.
 * This is read-only method and doesn't involve transaction mining.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {string} scopeRequestId - Scope request identifier.
 * @returns {PlacementDetails} A promise of the escrow placement details.
 */
escrow.verify = function(idrAddress, idvAddress, scopeRequestId) {
  return escrow.verifyBatch(idrAddress, idvAddress, [scopeRequestId]);
};

/**
 * @alias module:escrow.verifyBatch
 * @memberOf escrow
 * @description Verifies state of the batched escrow placement.
 * This is read-only method and doesn't involve transaction mining.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array<string>} scopeRequestIds - An array of scope request identifiers.
 * @returns {PlacementDetails} A promise of the escrow placement details.
 */
escrow.verifyBatch = function(idrAddress, idvAddress, scopeRequestIds) {
  assertAddress(idrAddress);
  assertAddress(idvAddress);
  const normalizedIds = scopeRequestIds.map(normalizeScopeRequestId);

  return tx
    .contractInstance(CONTRACT_ESCROW)
    .then(
      logger.debugLogTap('Verifying escrow payment: ', {
        idrAddress,
        idvAddress,
        scopeRequestIds,
        normalizedIds
      })
    )
    .then(escrowContract => escrowContract.verifyBatch(idrAddress, idvAddress, normalizedIds))
    .then(verification => {
      logger.debug('Escrow payment verified: ', normalizeVerify(verification));
      return verification;
    });
};

/**
 * @alias module:escrow.verifyPlacement
 * @memberOf escrow
 * @description Returns escrow placement details by placementId.
 * This is read-only method and doesn't involve transaction mining.
 * @param {string} placementId - The escrow placement ID.
 * @returns {PlacementDetails} - A promise of the escrow placement details.
 */
escrow.verifyPlacement = function(placementId) {
  return tx
    .contractInstance(CONTRACT_ESCROW)
    .then(logger.debugLogTap('Verifying placement: ', { placementId }))
    .then(escrowContract => escrowContract.verifyPlacement(placementId));
};

/**
 * @alias module:escrow.refund
 * @memberOf escrow
 * @description Refunds escrowed funds to identity requester account.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {string} scopeRequestId - Scope request identifier.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @returns {Promise<object>} A promise of the transaction hash (see tx.js module)
 * and returnValue object with placementId.
 */
escrow.refund = function(fromAddress, signTx, idrAddress, idvAddress, scopeRequestId, txOptions = {}) {
  return escrow.refundBatch(fromAddress, signTx, idrAddress, idvAddress, [scopeRequestId], txOptions);
};

/**
 * @alias module:escrow.refundBatch
 * @memberOf escrow
 * @description Refunds escrowed funds for batch placement.
 * Allows the batching of scope request IDs to reduce transaction costs.
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array<string>} scopeRequestIds - An array containing scope request identifiers.
 * @param {object} txOptions - transaction options.
 * @param {number} [txOptions.nonce] - The transaction sequence number.
 * @param {number} [txOptions.gas] - The gas value provided by the sender.
 * @param {number} [txOptions.gasPrice] - The gas price value provided by the sender in Wei.
 * @param {number} [txOptions.chainId] - The network chain id according to EIP-155.
 * @returns {Promise<object>} A promise of the transaction hash (see tx.js module)
 * and returnValue object with placementId.
 */
escrow.refundBatch = function(fromAddress, signTx, idrAddress, idvAddress, scopeRequestIds, txOptions = {}) {
  // Merge txOptions with default
  const updatedTxOptions = _.merge({}, { gas: REFUND_GAS_LIMIT }, txOptions);
  const normalizedIds = scopeRequestIds.map(normalizeScopeRequestId);

  logger.debug('Refunding escrow', {
    idrAddress,
    idvAddress,
    scopeRequestIds,
    normalizedIds,
    txOptions: updatedTxOptions
  });

  return sender.send({
    fromAddress: assertAddress(fromAddress),
    signTx,
    contractName: CONTRACT_ESCROW,
    method: 'refundBatch',
    params: [assertAddress(idrAddress), assertAddress(idvAddress), normalizedIds],
    txOptions: updatedTxOptions
  });
};

/**
 * @alias module:escrow.setTimeoutThreshold
 * @memberOf escrow
 * @description Changes the escrow timeout threshold. Expects integer - number of blocks. Admin only
 * If a payment stays in escrow longer than this threshold, the placement can no longer be
 * released, but must be refunded
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {number} threshold - Number of blocks after which an escrow placement can be canceled (refunded).
 * @return {Promise<{ transactionHash: string }>} A promise of the transaction hash.
 */
escrow.setTimeoutThreshold = function(fromAddress, signTx, threshold) {
  logger.debug('Setting the escrow contract timeout threshold', {
    fromAddress,
    threshold
  });
  return sender.send({
    fromAddress: assertAddress(fromAddress),
    signTx,
    contractName: CONTRACT_ESCROW,
    method: 'setTimeoutThreshold',
    params: [threshold]
  });
};

/**
 * @alias module:escrow.timeoutThreshold
 * @memberOf escrow
 * Returns the current value of placement release timeout threshold.
 * @return {Promise<number>} A promise of the timeout threshold value.
 */
escrow.timeoutThreshold = function() {
  return tx.contractInstance(CONTRACT_ESCROW).then(escrowContract => escrowContract.timeoutThreshold());
};

/**
 * @alias module:escrow.setFeeRate
 * @memberOf escrow
 * @description Updates marketplace platform escrow fee rate
 * i.e. the percentage of escrow placement amount which is transferred
 * to platform administrator address upon each placement release. Admin only
 * @param {string} fromAddress - The transaction sender address.
 * @param {function} signTx - Transaction signing function.
 * @param {number} feeRate - The marketplace platform escrow fee rate.
 * @return {Promise<{ transactionHash: string }>} A promise of the transaction hash.
 */
escrow.setFeeRate = function(fromAddress, signTx, feeRate) {
  logger.debug('Setting the escrow contract platform fee rate', {
    fromAddress,
    feeRate
  });
  return sender.send({
    fromAddress: assertAddress(fromAddress),
    signTx,
    contractName: CONTRACT_ESCROW,
    method: 'setFeeRate',
    params: [feeRate]
  });
};

/**
 * @alias module:escrow.calculatePlacementId
 * @memberOf escrow
 * @description Calculates escrow placement ID from a set of scope request IDs. This
 * allows a client to identify the batch that an array of scope requests was added to.
 * @param {string} idrAddress - The identity requestor address.
 * @param {string} idvAddress - The identity validator address.
 * @param {Array<string>} scopeRequestIds - An array of scope request identifiers.
 * @return {string} A promise of the escrow placement ID.
 */
escrow.calculatePlacementId = function(idrAddress, idvAddress, scopeRequestIds) {
  return tx
    .contractInstance(CONTRACT_ESCROW)
    .then(logger.debugLogTap('Calculating placementId: ', { idrAddress, idvAddress, scopeRequestIds }))
    .then(escrowContract => escrowContract.calculatePlacementId(idrAddress, idvAddress, scopeRequestIds));
};

function toPaymentState(number) {
  // this array should be kept in sync with CvcEscrowInterface.sol
  return ['Empty', 'Placed', 'Released', 'Canceled'][number];
}

function normalizeVerify(verifyResultArray) {
  const [amount, paymentState, credentialItems, confirmationsNumber, canRefund] = verifyResultArray;

  return {
    amount: toCVC(amount).toFixed(CVC_DECIMALS),
    paymentState: toPaymentState(paymentState.toNumber()),
    credentialItems,
    confirmations: confirmationsNumber.toNumber(),
    canRefund
  };
}

/**
 * Normalizes provided scope request ID to be compatible with Solidity bytes32: 0x + 64 hex chars.
 * @param {string} scopeRequestId - A scope request ID.
 * @returns {string} Normalized scope request ID.
 */
function normalizeScopeRequestId(scopeRequestId) {
  if (scopeRequestId.match(/^0x[0-f]{64}$/)) {
    // Scope request ID is normalized already
    return scopeRequestId;
  }

  // Convert to lower case, strip all non 0-9a-f (hex) chars, take first 64 chars:
  const extracted = scopeRequestId
    .toLowerCase()
    .replace(/[^ 0-9a-f]/g, '')
    .substr(0, 64);
  // Pad with 0 from the left till 64 chars, prepend 0x:
  return `0x${_.padStart(extracted, 64, '0')}`;
}
