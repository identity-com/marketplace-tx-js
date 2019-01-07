/* eslint-disable no-unused-expressions */
const chai = require('chai');
const FakeProvider = require('web3-fake-provider');
const Web3 = require('web3');
const sandbox = require('sinon').createSandbox();
const NonceManager = require('../src/support/nonce/manager');
const InMemory = require('../src/support/store/inmemory');
const web3admin = require('web3admin');

chai.use(require('chai-as-promised'));

const { expect } = chai;
const web3 = new Web3(new FakeProvider());
web3admin.extend(web3);
const store = new InMemory({});
const account = '0x123';

describe('nonce manager', () => {
  let getTransactionCountStub;
  let txpoolInspectStub;
  let storeGetStub;
  let storePutStub;
  let storeReleaseStub;

  beforeEach(() => {
    getTransactionCountStub = sandbox.stub(web3.eth, 'getTransactionCount');
    txpoolInspectStub = sandbox.stub(web3.txpool, 'inspect');
  });

  beforeEach(() => {
    storeGetStub = sandbox.stub(store, 'get');
    storePutStub = sandbox.stub(store, 'put');
    storeReleaseStub = sandbox.stub(store, 'release');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('nonce acquire and gaps filling', () => {
    it('picks the first nonce for fresh account', async () => {
      const txCount = 0;
      storeGetStub.withArgs(account).resolves({});
      getTransactionCountStub.yields(null, txCount);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storeGetStub.calledOnceWith(account)).to.be.true;
      expect(storePutStub.calledOnce).to.be.true;
      expect(getTransactionCountStub.calledOnce).to.be.true;
      expect(txpoolInspectStub.calledOnce).to.be.true;
      expect(nonce).to.equal(txCount, 'Nonce must be equal with tx count');
    });

    it('picks the next nonce with empty txpool', async () => {
      const txCount = 4;
      storeGetStub.withArgs(account).resolves({});
      getTransactionCountStub.yields(null, txCount);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal([account, { [txCount]: true }], 'Nonce storage updated');
      expect(nonce).to.equal(txCount, 'Nonce must be equal with tx count');
    });

    it('picks the next nonce respecting pending txs', async () => {
      storeGetStub.withArgs(account).resolves({});
      getTransactionCountStub.yields(null, 4);
      txpoolInspectStub.yields(null, { pending: { [account]: { 4: 'tx', 5: 'tx' } }, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal([account, { 6: true }], 'Nonce storage updated');
      expect(nonce).to.equal(6);
    });

    it('ignores queued transactions', async () => {
      const txCount = 8;
      storeGetStub.withArgs(account).resolves({});
      getTransactionCountStub.yields(null, txCount);
      txpoolInspectStub.yields(null, {
        pending: {},
        queued: { [account]: { 10: 'Some tx data', 11: 'Some tx data' } }
      });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal([account, { [txCount]: true }], 'Nonce storage updated');
      expect(nonce).to.equal(txCount, 'Nonce must be equal with tx count');
    });

    it('releases mined transactions', async () => {
      const txCount = 9;
      storeGetStub.withArgs(account).resolves({ 6: true, 7: true });
      getTransactionCountStub.yields(null, txCount);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal([account, { [txCount]: true }], 'Nonce storage updated');
      expect(nonce).to.equal(txCount, 'Nonce must be equal with tx count');
    });

    it('respects assigned nonces from storage', async () => {
      const noncesAlreadyAssigned = { 6: true, 7: true };
      const txCount = 6;
      storeGetStub.withArgs(account).resolves(noncesAlreadyAssigned);
      getTransactionCountStub.yields(null, txCount);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal(
        [account, { ...noncesAlreadyAssigned, 8: true }],
        'Nonce storage updated'
      );
      expect(nonce).to.equal(8);
    });

    it('fills in gap in assigned nonces', async () => {
      const noncesAlreadyAssigned = { 2: true, 3: true, 5: true, 6: true };
      const expectedNonce = 4;
      storeGetStub.withArgs(account).resolves(noncesAlreadyAssigned);
      getTransactionCountStub.yields(null, 2);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      const nonce = await manager.getNonceForAccount(account);

      expect(storePutStub.lastCall.args).to.be.deep.equal(
        [account, { ...noncesAlreadyAssigned, [expectedNonce]: true }],
        'Nonce storage updated'
      );
      expect(nonce).to.equal(expectedNonce);
    });
  });

  describe('error handling and locking storage', () => {
    it('throws when get has failed', async () => {
      storeGetStub.rejects(new Error('Some storage error'));

      const manager = new NonceManager(web3, store);
      await expect(manager.getNonceForAccount(account)).to.be.rejectedWith('Some storage error');

      expect(storePutStub.called).to.be.false;

      expect(getTransactionCountStub.called).to.be.false;
      expect(txpoolInspectStub.called).to.be.false;
    });

    it('releases and throws when txpool lookup has failed', async () => {
      storeGetStub.resolves({});
      getTransactionCountStub.yields(null, 0);
      txpoolInspectStub.yields(new Error('Some storage error'), null);

      const manager = new NonceManager(web3, store);
      await expect(manager.getNonceForAccount(account)).to.be.rejectedWith('Some storage error');

      expect(storeGetStub.calledOnceWith(account)).to.be.true;
      expect(storePutStub.called).to.be.false;
      expect(storeReleaseStub.called).to.be.true;

      expect(getTransactionCountStub.called).to.be.true;
      expect(txpoolInspectStub.called).to.be.true;
    });

    it('releases and throws when put has failed', async () => {
      storeGetStub.resolves({});
      storePutStub.rejects(new Error('Some storage error'));
      getTransactionCountStub.yields(null, 0);
      txpoolInspectStub.yields(null, { pending: {}, queued: {} });

      const manager = new NonceManager(web3, store);
      await expect(manager.getNonceForAccount(account)).to.be.rejectedWith('Some storage error');

      expect(storeGetStub.calledOnceWith(account)).to.be.true;
      expect(storeReleaseStub.called).to.be.true;

      expect(getTransactionCountStub.called).to.be.true;
      expect(txpoolInspectStub.called).to.be.true;
    });
  });
});
