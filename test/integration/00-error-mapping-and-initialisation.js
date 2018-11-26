require('longjohn');
const { expect } = require('chai');
const Web3 = require('web3');
const { mapError, CvcError, InvalidNonceError } = require('../../src/support/errors');
const MarketplaceTx = require('../../src/marketplace-tx');

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplaceTx = new MarketplaceTx({ web3 });

describe('Error mapper', () => {
  const nonceTooLowError = new Error('nonce too low');
  const underpricedReplacementError = new Error('replacement transaction underpriced');
  const knownTransactionError = new Error('known transaction: 0x00000');

  it('should retain initial error', () => {
    const cvcError = new CvcError('message', nonceTooLowError);
    expect(cvcError.cause).equal(nonceTooLowError);
    expect(cvcError.message).equal('message');
  });

  it('should propagate unknown errors', () => {
    const error = new Error('some unknown error');
    expect(mapError(error)).to.equal(error);
  });

  it('should not wrap mapped error', () => {
    const cvcError = mapError(nonceTooLowError);
    expect(mapError(cvcError)).to.equal(cvcError);
  });

  it('should map low nonce error', () => {
    expect(mapError(nonceTooLowError)).instanceOf(InvalidNonceError);
  });

  it('should map known tx error', () => {
    expect(mapError(knownTransactionError)).instanceOf(InvalidNonceError);
  });

  it('should map underpriced replacement error', () => {
    expect(mapError(underpricedReplacementError)).instanceOf(InvalidNonceError);
  });
});

describe('The service, on initialisation', () => {
  const { tx } = marketplaceTx;
  const { CONTRACTS } = marketplaceTx.constants;

  it('should fail to load if a contract cannot be found', async () => {
    // blatantly taking advantage of the fact that javascript
    // does not have real immutability or real constants
    CONTRACTS.push('unknownContract');

    const shouldFail = tx.loadContracts();

    // eslint-disable-next-line no-unused-expressions
    expect(shouldFail).to.eventually.be.rejected;

    CONTRACTS.pop();
  });

  it('should load all contracts', () => tx.loadContracts());
});
