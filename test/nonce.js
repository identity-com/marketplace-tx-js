/* eslint-disable no-unused-expressions */
const chai = require('chai');
const sinon = require('sinon');
const util = require('../src/support/nonce/util');
const ethUtil = require('ethereumjs-util');
const AccountInspector = require('../src/support/nonce/accountInspector');
const InMemoryNonceManager = require('../src/support/nonce/inmemory');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const _ = require('lodash');
chai.use(require('chai-as-promised'));

const sandbox = sinon.createSandbox();
const { expect } = chai;
const account = '0x123';
const emptyTxPool = { pending: {}, queued: {} };

describe('nonce management', () => {
  afterEach(() => {
    sandbox.restore();
  });

  describe('nonce calculation', () => {
    let debugLogSpy;

    beforeEach(() => {
      debugLogSpy = sandbox.spy();
    });

    it('picks the first nonce for fresh account', () => {
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, {}, 0, emptyTxPool);
      expect(nextNonce).to.equal(0);
      expect(acquiredNonces).to.deep.equal({ [nextNonce]: true });
    });

    it('picks the next nonce with empty txpool', () => {
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, {}, 7, emptyTxPool);
      expect(nextNonce).to.equal(7);
      expect(acquiredNonces).to.deep.equal({ [nextNonce]: true });
    });

    it('picks the next nonce respecting pending txs', () => {
      const txPool = { ...emptyTxPool, pending: { 4: 'tx', 5: 'tx' } };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, {}, 4, txPool);
      expect(nextNonce).to.equal(6);
      expect(acquiredNonces).to.deep.equal({ [nextNonce]: true });
    });

    it('ignores queued transactions', () => {
      const txPool = { ...emptyTxPool, queued: { 4: 'tx', 5: 'tx' } };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, {}, 3, txPool);
      expect(nextNonce).to.equal(3);
      expect(acquiredNonces).to.deep.equal({ [nextNonce]: true });
    });

    it('releases mined transactions', () => {
      const storedNonces = { 4: true, 5: true };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, storedNonces, 7, emptyTxPool);
      expect(nextNonce).to.equal(7);
      expect(acquiredNonces).to.deep.equal({ [nextNonce]: true });
      expect(debugLogSpy.calledWith('released nonces: 4, 5')).to.be.true;
    });

    it('respects acquired nonces from storage', () => {
      const storedNonces = { 4: true, 5: true };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, storedNonces, 4, emptyTxPool);
      expect(nextNonce).to.equal(6);
      expect(acquiredNonces).to.include(storedNonces);
      expect(acquiredNonces).to.deep.include({ [nextNonce]: true });
    });

    it('fills in gap in stored nonces', () => {
      const storedNonces = { 2: true, 3: true, 5: true, 6: true };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, storedNonces, 2, emptyTxPool);
      expect(nextNonce).to.equal(4);
      expect(acquiredNonces).to.include(storedNonces);
      expect(acquiredNonces).to.deep.include({ [nextNonce]: true });
    });

    it('merges pending and stored nonces to fill gaps', () => {
      const storedNonces = { 2: true, 5: true };
      const txPool = { ...emptyTxPool, pending: { 3: 'tx', 6: 'tx' } };
      const { nextNonce, acquiredNonces } = util.calculateNonce(debugLogSpy, storedNonces, 2, txPool);
      expect(nextNonce).to.equal(4);
      expect(acquiredNonces).to.include(storedNonces);
      expect(acquiredNonces).to.deep.include({ [nextNonce]: true });
    });
  });

  describe('in-memory nonce manager', () => {
    let calculateNonceStub;
    let accountInspectorStub;
    const txCount = 3;

    beforeEach(() => {
      calculateNonceStub = sandbox.stub(util, 'calculateNonce');
      accountInspectorStub = sandbox.createStubInstance(AccountInspector);

      accountInspectorStub.getTransactionCount.resolves(txCount);
      accountInspectorStub.inspectTxPool.resolves(emptyTxPool);
      calculateNonceStub.withArgs(sinon.match.func, sinon.match.object, txCount, emptyTxPool).returns(txCount);
    });

    it('should get nonce for account', async () => {
      const manager = new InMemoryNonceManager(accountInspectorStub);
      const nonce = await manager.getNonceForAccount(account);
      expect(nonce).to.equal(txCount);
      const nextNonce = await manager.getNonceForAccount(account);
      expect(nextNonce).to.be.not.equal(nonce);
      expect(nextNonce).to.equal(txCount + 1);
    });

    it('should release nonce', async () => {
      const manager = new InMemoryNonceManager(accountInspectorStub);
      const nonce = await manager.getNonceForAccount(account);
      expect(nonce).to.equal(txCount);
      manager.releaseAccountNonce(account, nonce);
      const nextNonce = await manager.getNonceForAccount(account);
      expect(nextNonce).to.be.equal(nonce, 'must be the same nonce, because it was released for re-use');
    });

    it('should release multiple nonces', async () => {
      const manager = new InMemoryNonceManager(accountInspectorStub);
      const nonces = await Promise.all(_.times(3, () => manager.getNonceForAccount(account)));
      expect(nonces)
        .to.have.members([txCount, txCount + 1, txCount + 2])
        .and.have.lengthOf(3);
      manager.releaseAccountNonces(account, nonces);
      const nextNonce = await manager.getNonceForAccount(account);
      expect(nextNonce).to.be.equal(txCount, 'must be the first nonce, because it was released for re-use');
    });

    it('should clear account store', async () => {
      const manager = new InMemoryNonceManager(accountInspectorStub);
      const nonce = await manager.getNonceForAccount(account);
      expect(nonce).to.equal(txCount);
      manager.clearAccounts();
      const nextNonce = await manager.getNonceForAccount(account);
      expect(nextNonce).to.be.equal(nonce, 'must be the same nonce, because account store was cleared');
    });
  });

  describe('account inspector', () => {
    let accountInspector;
    const address1 = '0x123ABC';
    const address2 = '0x321CBA';
    const address1Checksummed = ethUtil.toChecksumAddress(address1);
    const address2Checksummed = ethUtil.toChecksumAddress(address2);

    const txPool = {
      pending: {
        [address1Checksummed]: {
          10: 'tx'
        },
        [address2Checksummed]: {
          10: 'tx'
        }
      },
      queued: {
        [address1Checksummed]: {
          12: 'tx'
        }
      }
    };

    beforeEach(() => {
      const web3 = new Web3(new FakeProvider());
      web3.txpool = { inspect: cb => cb(null, txPool) };
      accountInspector = new AccountInspector(web3);
    });

    it('should inspect tx pool for non-checksummed addresses', async () => {
      const accountTxPool = await accountInspector.inspectTxPool(address1);
      expect(accountTxPool).to.deep.equal({
        pending: txPool.pending[address1Checksummed] || {},
        queued: txPool.queued[address1Checksummed] || {}
      });
    });

    it('should inspect tx pool for checksummed addresses', async () => {
      const accountTxPool = await accountInspector.inspectTxPool(address2Checksummed);
      expect(accountTxPool).to.deep.equal({
        pending: txPool.pending[address2Checksummed] || {},
        queued: txPool.queued[address2Checksummed] || {}
      });
    });
  });
});
