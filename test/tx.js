/* eslint-disable no-unused-expressions */
require('longjohn');
const chai = require('chai');
const sandbox = require('sinon').createSandbox();
const nonce = require('../src/support/nonce');
const fetchMock = require('fetch-mock');
const proxyquire = require('proxyquire');

const { expect } = chai;
chai.use(require('chai-as-promised'));

describe('tx.js', () => {
  describe('when createTx throws', () => {
    // eslint-disable-next-line global-require
    const tx = require('../src/support/tx');
    let releaseNonceStub;
    beforeEach('stub', () => {
      const getDataApplyStub = sandbox.stub().throws('Error', 'Invalid number of arguments to Solidity function');
      const contractInstanceStub = {
        contract: { someMethodToCall: { getData: sandbox.stub({ apply: () => {} }, 'apply').throws(getDataApplyStub) } }
      };
      sandbox.stub(tx, 'contractInstance').resolves(contractInstanceStub);
      sandbox.stub(nonce, 'getNonceForAccount').resolves(12345);
      releaseNonceStub = sandbox.stub(nonce, 'releaseAccountNonce');
    });

    afterEach(() => {
      sandbox.reset();
    });

    it('releases nonce', async () => {
      await expect(
        tx.createTx({
          fromAddress: '0x48089757dbc23bd8e49436247c9966ff15802978',
          contractName: 'Contract',
          method: 'someMethodToCall',
          args: ['arg1', 'arg2'],
          assignedNonce: true
        })
      ).to.be.rejectedWith('Invalid number of arguments to Solidity function');

      expect(releaseNonceStub.calledOnceWithExactly('0x48089757dbc23bd8e49436247c9966ff15802978', 12345)).to.be.true;
    });
  });

  describe('waitForMine', () => {
    // eslint-disable-next-line global-require
    const tx = require('../src/support/tx');
    before('Mining never resolves to a tx receipt', () => {
      sandbox.stub(tx, 'getTransactionReceipt').resolves(null);
    });

    after(() => {
      sandbox.restore();
    });

    it('waitForMine timeout', () =>
      expect(tx.waitForMine(Promise.resolve({ transactionHash: '0x' }), 1)).to.be.rejectedWith(
        /getTransactionReceiptMined timeout/
      )).timeout(4000);
  });

  describe('When we pass contract.url to contractInstance', () => {
    const tx = proxyquire('../src/support/tx', {
      '../config': () => ({
        contracts: { url: 'http://localhost' }
      }),
      'truffle-contract': () => ({
        setProvider: () => {},
        deployed: () => ({
          catch: () => ({
            then: () => Promise.resolve({ foo: 'bar' })
          })
        })
      })
    });
    before('stub', () => {
      tx.web3 = sandbox.stub().returns({});
      fetchMock.mock('http://localhost/CvcEscrow.json', { contractName: 'CvcEscrow' });
    });

    after(() => {
      sandbox.restore();
    });

    it('should fetch the contract', async () => {
      const result = await tx.contractInstance('CvcEscrow');
      expect(result).to.deep.equal({ foo: 'bar' });
    });
  });

  describe('When we pass contract.dir to contractInstance', () => {
    const tx = proxyquire('../src/support/tx', {
      '../config': () => ({
        contracts: { dir: '../../test/assets/contracts' }
      }),
      'truffle-contract': () => ({
        setProvider: () => {},
        deployed: () => ({
          catch: () => ({
            then: () => Promise.resolve({ foo: 'bar' })
          })
        })
      })
    });
    before('stub', () => {
      tx.web3 = sandbox.stub().returns({});
    });

    after(() => {
      sandbox.restore();
    });

    it('should fetch the contract', async () => {
      const result = await tx.contractInstance('mockContract');
      expect(result).to.deep.equal({ foo: 'bar' });
    });
  });
});
