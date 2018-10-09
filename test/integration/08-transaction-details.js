/* eslint-disable no-shadow,no-param-reassign */
const chai = require('chai');

const { expect } = chai;
chai.use(require('chai-as-promised'));
const Web3 = require('web3');
const MarketplaceTx = require('../../src/marketplace-tx');
const users = require('./users');
const signTx = require('./signtx');

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplacetx = new MarketplaceTx(web3);

describe('TX Details', () => {
  const address1 = users[0].address;

  /**
   * This allows adjustment of the nonce before signing to simulate various status scenarios.
   *
   * @param nonceAdjustment Adjustment to the nonce as an integer
   * @returns {function(*=, *=)}
   */
  function getSignTx(nonceAdjustment = 0) {
    return (addressFrom, rawTx) => {
      if (nonceAdjustment) {
        rawTx.nonce = `0x${(parseInt(rawTx.nonce, 16) + nonceAdjustment).toString(16)}`;
      }
      return signTx(addressFrom, rawTx);
    };
  }

  // detect Ganache (TestRPC) which doesn't support txPool,
  // nor does it allow nonces higher than current txCount to test queuing
  const isGanache = web3.version.node.startsWith('EthereumJS TestRPC');

  after(() => {
    marketplacetx.nonce.clearAccounts();
  });

  describe('Checking transaction status unsupported', () => {
    before('before unsupported test', function() {
      if (!isGanache) {
        this.skip();
      }
    });

    it('should find transaction status to be unsupported', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, 99999);
      expect(getStatusResult).to.equal('unsupported');
    });

    it('should find get transaction to be unsupported by hash', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransaction(
        address1,
        '0x0005ec1a5423dc0044f000b880b0331d0114ce020746b294b277bf489f7694d9'
      );

      expect(getStatusResult).to.be.an('object');
      expect(getStatusResult.status).to.equal('unsupported');
      expect(getStatusResult.details).to.equal(null);
      expect(Object.keys(getStatusResult).length).to.be.equal(2);
    });
  });

  describe('Checking transaction status mined', () => {
    let sendPromiseResultTxHash;

    before('send and mine normal transaction', async function() {
      if (isGanache) {
        this.skip();
      }
      const sendPromise = marketplacetx.sender.send({
        fromAddress: address1,
        signTx: getSignTx(),
        contractName: 'CvcToken',
        method: 'approve',
        params: [address1, 0]
      });
      const sendPromiseResult = await sendPromise;
      sendPromiseResultTxHash = sendPromiseResult.transactionHash;
      await marketplacetx.tx.waitForMine(sendPromise);
    });

    it('should find transaction status to be mined', async () => {
      const nonce = await marketplacetx.tx.getTransactionCount(address1);
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, nonce - 1);
      expect(getStatusResult).to.equal('mined');
    });

    it('should get mined transaction details by hash', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransaction(address1, sendPromiseResultTxHash);
      expect(getStatusResult).to.be.an('object');
      expect(getStatusResult.status).to.equal('mined');
      expect(getStatusResult.details).to.be.an('object');
      expect(getStatusResult.details.status).to.equal('0x1');
      expect(Object.keys(getStatusResult).length).to.be.equal(2);
      expect(Object.keys(getStatusResult.details).length).to.be.equal(12);
    });
  });

  describe('Checking transaction status pending', () => {
    let sendPromise;
    let sendPromiseResultTxHash;

    before('send normal transaction', async function() {
      if (isGanache) {
        this.skip();
      }
      marketplacetx.tx.web3.miner.stop();
      sendPromise = marketplacetx.sender.send({
        fromAddress: address1,
        signTx: getSignTx(),
        contractName: 'CvcToken',
        method: 'approve',
        params: [address1, 0]
      });
      const sendPromiseResult = await sendPromise;
      sendPromiseResultTxHash = sendPromiseResult.transactionHash;
    });

    after('wait for mine', async function() {
      if (isGanache) {
        this.skip();
      }
      marketplacetx.tx.web3.miner.start(1);
      await marketplacetx.tx.waitForMine(sendPromise);
    });

    it('should find transaction status to be pending', async () => {
      const nonce = await marketplacetx.tx.getTransactionCount(address1);
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, nonce);
      expect(getStatusResult).to.equal('pending');
    });

    it('should get pending transaction details by hash', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransaction(address1, sendPromiseResultTxHash);
      expect(getStatusResult).to.be.an('object');
      expect(getStatusResult.status).to.equal('pending');
      expect(getStatusResult.details).to.be.an('object');
      expect(Object.keys(getStatusResult).length).to.be.equal(2);
      expect(Object.keys(getStatusResult.details).length).to.be.equal(14);
    });
  });

  describe('Checking transaction status queued', () => {
    let sendPromise;
    let sendPromiseResultTxHash;

    before('send nonce + 1 transaction', async function() {
      if (isGanache) {
        this.skip();
      }
      sendPromise = marketplacetx.sender.send({
        fromAddress: address1,
        signTx: getSignTx(1),
        contractName: 'CvcToken',
        method: 'approve',
        params: [address1, 0]
      });
      const sendPromiseResult = await sendPromise;
      sendPromiseResultTxHash = sendPromiseResult.transactionHash;
    });

    after('fix the nonce gap and wait for mining', async function() {
      if (isGanache) {
        this.skip();
      }
      const fixNonceSendPromise = marketplacetx.sender.send({
        fromAddress: address1,
        signTx: getSignTx(-2),
        contractName: 'CvcToken',
        method: 'approve',
        params: [address1, 0]
      });

      await marketplacetx.tx.waitForMine(fixNonceSendPromise);
      await marketplacetx.tx.waitForMine(sendPromise);
    });

    it('should find transaction status to be queued', async () => {
      const nonce = await marketplacetx.tx.getTransactionCount(address1);
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, nonce + 1);
      expect(getStatusResult).to.equal('queued');
    });

    it('should get queued transaction details by hash', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransaction(address1, sendPromiseResultTxHash);
      expect(getStatusResult).to.be.an('object');
      expect(getStatusResult.status).to.equal('queued');
      expect(getStatusResult.details).to.be.an('object');
      expect(Object.keys(getStatusResult).length).to.be.equal(2);
      expect(Object.keys(getStatusResult.details).length).to.be.equal(14);
    });
  });

  describe('Checking transaction status unknown', () => {
    before('check if is supported', async function() {
      if (isGanache) {
        this.skip();
      }
    });

    it('should find transaction status to be unknown', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, 99999);
      expect(getStatusResult).to.equal('unknown');
    });

    it('should find transaction status to be unknown by hash', async () => {
      const getStatusResult = await marketplacetx.transactionDetails.getTransaction(
        address1,
        '0x0005ec1a5423dc0044f000b880b0331d0114ce020746b294b277bf489f7694d9'
      );
      expect(getStatusResult.status).to.equal('unknown');
      expect(getStatusResult.details).to.equal(null);
    });

    it('should find transaction status to be unknown if set to transaction count (while not pending)', async () => {
      const nonce = await marketplacetx.tx.getTransactionCount(address1);
      const getStatusResult = await marketplacetx.transactionDetails.getTransactionStatus(address1, nonce);
      expect(getStatusResult).to.equal('unknown');
    });
  });
});
