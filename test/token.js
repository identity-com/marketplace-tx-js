/* eslint-disable max-len */
const chai = require('chai');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const MarketplaceTx = require('../src/marketplace-tx');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const web3 = new Web3(new FakeProvider());
const marketplaceTx = new MarketplaceTx({ web3 }, { preloadContracts: false });

describe('token.js', () => {
  const { token } = marketplaceTx;
  const invalidAddress = '0x123';
  const validAddress = '0x48089757dbc23bd8e49436247c9966ff15802978';

  it('validates addresses', () => {
    expect(token.transfer(invalidAddress, 1, validAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);
    expect(token.transfer(validAddress, 1, invalidAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);

    expect(token.approve(validAddress, 1, invalidAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);
    expect(token.approve(invalidAddress, 1, validAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);

    expect(token.approveWithReset(validAddress, 1, invalidAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);
    expect(token.approveWithReset(validAddress, 1, validAddress, 100)).to.be.rejectedWith(`/${invalidAddress}/`);
  });
});
