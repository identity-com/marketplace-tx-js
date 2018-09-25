require('longjohn');
const chai = require('chai');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const MarketplaceTx = require('../src/marketplace-tx');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const marketplaceTx = new MarketplaceTx(new Web3(new FakeProvider()), { preloadContracts: false }, false);

describe('escrow.js', () => {
  const { escrow } = marketplaceTx;
  const validAddress = '0x48089757dbc23bd8e49436247c9966ff15802978';
  const invalidAddress = 'qwerty';
  const validCredentialItems = ['claim-age-v1.0'];

  it('fails on invalid addresses provided to place/placeBatch', () => {
    expect(() => escrow.place(invalidAddress, 1, validAddress, '1', 1, validCredentialItems)).to.throw(/qwerty/);
    expect(() => escrow.placeBatch(invalidAddress, 1, validAddress, ['1'], 1, validCredentialItems)).to.throw(/qwerty/);
    expect(() => escrow.place(validAddress, 1, invalidAddress, '1', 1, validCredentialItems)).to.throw(/qwerty/);
    expect(() => escrow.placeBatch(validAddress, 1, invalidAddress, ['1'], 1, validCredentialItems)).to.throw(/qwerty/);
  });

  it('fails on invalid args provided to place/placeBatch', () => {
    expect(() => escrow.place(validAddress, 1, validAddress, '1', 100, [])).to.throw(/empty/);
    expect(() => escrow.placeBatch(validAddress, 1, validAddress, ['1'], 100, [])).to.throw(/empty/);
    expect(() => escrow.place(validAddress, 1, validAddress, '1', 100, ['abcdef'])).to.throw(/abcdef/);
    expect(() => escrow.placeBatch(validAddress, 1, validAddress, ['1'], 100, ['abcdef'])).to.throw(/abcdef/);
    expect(() => escrow.place(validAddress, 1, validAddress, '1', 1e30, validCredentialItems)).to.throw(/1e\+30/);
    expect(() => escrow.placeBatch(validAddress, 1, validAddress, ['1'], 1e30, validCredentialItems)).to.throw(
      /1e\+30/
    );
    expect(() => escrow.place(validAddress, 1, validAddress, '1', -1, validCredentialItems)).to.throw(/-1/);
    expect(() => escrow.placeBatch(validAddress, 1, validAddress, ['1'], -1, validCredentialItems)).to.throw(/-1/);
  });

  it('fails on invalid IDV address provided to release', () => {
    expect(() => escrow.release(invalidAddress, 1, validAddress, validAddress, '1')).to.throw(/qwerty/);
    expect(() => escrow.release(validAddress, 1, invalidAddress, validAddress, '1')).to.throw(/qwerty/);
    expect(() => escrow.release(validAddress, 1, validAddress, invalidAddress, '1')).to.throw(/qwerty/);
  });

  it('fails on invalid IDV address provided to verify', () => {
    expect(() => escrow.verify(validAddress, invalidAddress, '1')).to.throw(/qwerty/);
    expect(() => escrow.verify(invalidAddress, validAddress, '1')).to.throw(/qwerty/);
  });
});
