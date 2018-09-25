/** @module support/errors */
const { BaseError } = require('make-error-cause');

class CvcError extends BaseError {}

/**
 * There is a mined transaction with the same nonce from given account.
 */
class InvalidNonceError extends CvcError {
  constructor(cause) {
    super('Invalid nonce value', cause);
  }
}

class FailedTxChainError extends CvcError {
  constructor(transactions, cause) {
    super(`Failed to send ${transactions.length} chained transactions`, cause);
    this.transactions = transactions;
  }
}

class NotDeployedError extends CvcError {
  constructor(address) {
    super(`No code deployed at address ${address}.`);
  }
}

class NoNetworkInContractError extends CvcError {
  constructor(contractName, cause) {
    super(`Could not detect '${contractName}' in network.`, cause);
  }
}

class SignerSenderAddressMismatchError extends CvcError {
  constructor(signer, sender) {
    super(`Expected from sender address ${sender} does not match actual signing ${signer} address.`);
  }
}

class NotFoundError extends CvcError {}

/**
 * Maps a blockchain error and returns an instance of CvcError when possible.
 * This allows to implement error normalisation.
 * Unknown errors are propagated without modifications.
 * @param {Error} error A blockchain error object.
 * @returns {CvcError|Error} Mapped error object.
 */
function mapError(error) {
  // Prevent wrapping mapped errors.
  if (error instanceof CvcError) return error;
  // Check for invalid nonce error.
  if (/nonce|replacement\stransaction\sunderpriced|known\stransaction/.test(error)) return new InvalidNonceError(error);

  return error;
}

module.exports = {
  mapError,
  CvcError: CvcError,
  InvalidNonceError,
  FailedTxChainError,
  NotDeployedError,
  NoNetworkInContractError,
  SignerSenderAddressMismatchError,
  NotFoundError
};
