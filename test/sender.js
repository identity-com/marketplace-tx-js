require('longjohn');
const chai = require('chai');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const EthTx = require('ethereumjs-tx');
const sandbox = require('sinon').createSandbox();
const MarketplaceTx = require('../src/marketplace-tx');
const nonce = require('../src/support/nonce');
const tx = require('../src/support/tx');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const web3 = new Web3(new FakeProvider());
const marketplaceTx = new MarketplaceTx({ web3 }, { preloadContracts: false });

describe('sender.js', () => {
  describe('assert sender and signer address match', () => {
    const signerPrivateKey = 'b0895a2390fdcf8dd1b2ca3788c3e936eb75452203453c06ea1ed968a1c2b8b5';
    // For reference, signerAddress is '0x3425efd013805b95fe1acb51482ed816a377c364'
    const senderPrivateKey = 'b0895a2390fdcf8dd1b2ca3788c3e936eb75452203453c06ea1ed968a1c2b8b2';
    const senderAddress = '0x57a6d277516869afea3306335207c82f97e0d5d2';

    const signTxWithKey = privateKey => (from, toSign) => {
      const sign = rawTx => {
        const ethTx = new EthTx(rawTx);
        ethTx.sign(Buffer.from(privateKey, 'hex'));
        return Promise.resolve(`0x${ethTx.serialize().toString('hex')}`);
      };

      return Array.isArray(toSign) ? Promise.all(toSign.map(sign)) : sign(toSign);
    };

    const { sender } = marketplaceTx;

    before(() => {
      // Whenever nonce is required return default one
      sandbox.stub(nonce, 'getNonceForAccount').resolves(0);
      sandbox.stub(nonce, 'releaseAccountNonces').resolves();

      // Stub create tx to avoid loading contract instance for generating data
      sandbox.stub(tx, 'createTx').callsFake(txParams =>
        Promise.resolve({
          to: senderAddress,
          value: '0x0',
          from: txParams.fromAddress,
          data: '0x12345678',
          chainId: '0x123',
          txOptions: {
            gasPrice: `0x111111`,
            gas: '0xfffff'
          }
        })
      );
    });

    after(() => {
      sandbox.restore();
    });

    describe('when sender and signer address mismatch', () => {
      it('throws on batch', () =>
        expect(
          sender.sendChain({
            fromAddress: senderAddress,
            signTx: signTxWithKey(signerPrivateKey),
            transactions: [{}]
          })
        )
          .to.be.eventually.rejectedWith(marketplaceTx.errors.FailedBatchError)
          .property('cause')
          .instanceOf(marketplaceTx.errors.SignerSenderAddressMismatchError));

      it('throws on send', () =>
        expect(
          sender.send({
            fromAddress: senderAddress,
            signTx: signTxWithKey(signerPrivateKey)
          })
        ).to.be.rejectedWith(marketplaceTx.errors.SignerSenderAddressMismatchError));

      it('throws on platform coin send', () =>
        expect(
          sender.sendPlatformCoin({
            fromAddress: senderAddress,
            toAddress: senderAddress,
            signTx: signTxWithKey(signerPrivateKey),
            value: 0
          })
        ).to.be.rejectedWith(marketplaceTx.errors.SignerSenderAddressMismatchError));
    });

    describe('when using matching private key', () => {
      it('fullfils', () =>
        expect(
          sender.sendPlatformCoin({
            fromAddress: senderAddress,
            toAddress: senderAddress,
            value: 0,
            signTx: signTxWithKey(senderPrivateKey)
          })
        ).to.be.fulfilled);
    });
  });
});
