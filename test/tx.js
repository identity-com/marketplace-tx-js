/* eslint-disable no-unused-expressions */
require('longjohn');
const chai = require('chai');
const sandbox = require('sinon').createSandbox();
const nonce = require('../src/support/nonce');
const tx = require('../src/support/tx');

const { expect } = chai;
chai.use(require('chai-as-promised'));

describe('tx.js', () => {
  describe('when createTx throws', () => {
    let releaseNonceSpy;
    beforeEach('stub', () => {
      const getDataApplyStub = sandbox.stub().throws('Error', 'Invalid number of arguments to Solidity function');
      const contractInstanceStub = {
        contract: { someMethodToCall: { getData: sandbox.stub({ apply: () => {} }, 'apply').throws(getDataApplyStub) } }
      };
      sandbox.stub(tx, 'contractInstance').resolves(contractInstanceStub);
      sandbox.stub(nonce, 'getNonceForAccount').resolves(12345);
      const account = { releaseNonce: () => {} };
      releaseNonceSpy = sandbox.spy(account, 'releaseNonce');
      sandbox
        .stub(nonce, 'getAccount')
        .withArgs('0x48089757dbc23bd8e49436247c9966ff15802978')
        .returns({ releaseNonce: releaseNonceSpy });
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

      expect(releaseNonceSpy.calledOnceWithExactly(12345)).to.be.true;
    });
  });

  describe('waitForMine', () => {
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
});
