require('longjohn');
const chai = require('chai');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const MarketplaceTx = require('../src/marketplace-tx');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const marketplaceTx = new MarketplaceTx(new Web3(new FakeProvider()), { preloadContracts: false }, false);

describe('util.js', () => {
  const { util } = marketplaceTx;
  it('should convert to and from CVC', () => {
    expect(util.bnToCVC(1.25e8).toNumber()).to.equal(1.25);
    expect(util.CVCToBN(1.25).toNumber()).to.equal(1.25e8);
    expect(util.bnToCVC(util.CVCToBN(1)).toNumber()).to.equal(1);
  });

  describe('util timeout', () => {
    const { timeout } = util;
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    it('promise resolves after timeout', () => {
      const promise = sleep(100).then(() => 'Ok');
      const wrapped = timeout(promise, 50, 'Timeout');
      return wrapped.then(
        () => expect.fail('should throw'),
        error =>
          expect(error)
            .instanceOf(timeout.Error)
            .to.have.property('message', 'Timeout')
      );
    });

    it('promise rejects after timeout', () => {
      const promise = sleep(100).then(() => {
        throw new Error('Failed');
      });
      const wrapped = timeout(promise, 50, 'Timeout');
      return wrapped.then(
        () => expect.fail('should throw'),
        error =>
          expect(error)
            .instanceOf(timeout.Error)
            .to.have.property('message', 'Timeout')
      );
    });

    it('promise resolves before timeout', () => {
      const promise = sleep(50).then(() => 'Ok');
      const wrapped = timeout(promise, 100, 'Timeout');
      return wrapped.then(res => expect(res).to.equal('Ok'));
    });

    it('promise rejects before timeout', () => {
      const promise = sleep(50).then(() => {
        throw new Error('Failed');
      });
      const wrapped = timeout(promise, 100, 'Timeout');
      return wrapped.then(
        () => expect.fail('should throw'),
        error => {
          expect(error).not.instanceOf(timeout.Error);
          expect(error).to.have.property('message', 'Failed');
        }
      );
    });
  });
});
