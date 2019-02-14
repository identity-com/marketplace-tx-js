/* eslint-disable no-shadow,no-param-reassign */
const fs = require('fs');
const chai = require('chai');

const { expect } = chai;
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber'));
const Web3 = require('web3');
const sinon = require('sinon');
const MarketplaceTx = require('../../src/marketplace-tx');
const logger = require('../../src/logger');
const users = require('./users');
const signTx = require('./signtx');

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

const ERR_NONCE_TOO_LOW = 1;
const ERR_UNDERPRICED_REPLACEMENT = 2;
const TX_SIGNING_TIMEOUT = process.env.TX_SIGNING_TIMEOUT || 100;

// initialise the marketplace-tx library and set the web3 connection
const marketplaceTx = new MarketplaceTx({ web3 });

describe('Sending transactions', () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  after(() => {
    marketplaceTx.nonce.clearAccounts();
  });

  const getTransactionInfo = txHash =>
    new Promise((resolve, reject) => {
      marketplaceTx.tx.web3.eth.getTransaction(txHash, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

  describe('Single transaction', () => {
    const address1 = users[0].address;
    const address2 = users[1].address;
    /**
     * This allows to simulate the case when account tx count had been incremented (by other transaction)
     * before our transaction is sent by sending intermediate transaction after the initial transaction created.
     *
     * @param errorType Specific error type to simulate
     * @param delay Transaction signing delay in milliseconds
     * @returns {function(*=, *=)}
     */
    function getSignTx(errorType = null, delay = 0) {
      return async (addressFrom, rawTx) => {
        if (errorType === ERR_NONCE_TOO_LOW) {
          // since we override the nonce it cannot be released correctly by error handler
          // so we release it manually beforehand
          await marketplaceTx.nonce.releaseAccountNonce(rawTx.from, rawTx.nonce);
          rawTx.nonce = '0x0';
        } else if (errorType === ERR_UNDERPRICED_REPLACEMENT) {
          const signIntermediateTx = (addressFrom, rawTx) => {
            // Decrement intermediateTx nonce to match the nonce of the transaction signed by this callback.
            rawTx.nonce -= 1;
            return signTx(addressFrom, rawTx);
          };
          await marketplaceTx.tx.send(addressFrom, signIntermediateTx, 'CvcToken', 'transfer', [addressFrom, 1]);
        }

        return sleep(delay).then(() => signTx(addressFrom, rawTx));
      };
    }

    it('should retrieve block number', async () => {
      const blockNumber = await marketplaceTx.tx.blockNumber();
      expect(blockNumber).to.be.at.least(1);
    });

    it('should send single transaction', async () => {
      const amount = 100;
      const [address1Before, address2Before] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);
      await marketplaceTx.tx.waitForMine(
        marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'transfer',
          params: [address2, amount]
        })
      );
      const [address1After, address2After] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);
      expect(address1Before.balance.minus(address1After.balance).toNumber()).to.equal(amount);
      expect(address2After.balance.minus(address2Before.balance).toNumber()).to.equal(amount);
    });

    describe('handle createTx error', () => {
      let spy;
      before(() => {
        spy = sinon.spy(logger, 'error');
      });

      after(() => sinon.restore());

      it('should log and release nonce', async () => {
        await expect(
          marketplaceTx.sender.send({
            fromAddress: address1,
            signTx: getSignTx(),
            contractName: 'CvcToken',
            method: 'transfer',
            params: [0]
          })
        ).to.be.rejected;
        // eslint-disable-next-line no-unused-expressions
        expect(spy.calledOnce).to.be.true;
        // eslint-disable-next-line no-unused-expressions
        expect(spy.calledWithMatch('Error during creating tx: Invalid number of arguments to Solidity function')).to.be
          .true;
      });
    });

    it('should fail to send tx with low nonce', async () => {
      const sendPromise = marketplaceTx.sender.send({
        fromAddress: address1,
        signTx: getSignTx(ERR_NONCE_TOO_LOW),
        contractName: 'CvcToken',
        method: 'transfer',
        params: [address2, 1]
      });
      await expect(sendPromise).to.be.eventually.rejectedWith(marketplaceTx.errors.InvalidNonceError);
    });

    describe('Transaction signing timeout', () => {
      const address1 = users[2].address;
      const address2 = users[3].address;

      it('should fail when signing request times out', async () => {
        const amount = 100;
        const txSigningDelay = TX_SIGNING_TIMEOUT + 10; // set delay above the allowed timeout
        const sendPromise = marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(null, txSigningDelay),
          contractName: 'CvcToken',
          method: 'transfer',
          params: [address2, amount]
        });
        await expect(sendPromise).to.be.eventually.rejectedWith(marketplaceTx.util.timeout.Error);
      });

      it('should succeed when tx is signed on time', () => {
        const amount = 100;
        const txSigningDelay = TX_SIGNING_TIMEOUT - 50; // set delay below the allowed timeout
        const sendPromise = marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(null, txSigningDelay),
          contractName: 'CvcToken',
          method: 'transfer',
          params: [address2, amount]
        });

        return expect(sendPromise).to.eventually.be.fulfilled;
      });
    });

    describe('Setting custom nonce', () => {
      it('sets custom nonce', async () => {
        const txCount = await marketplaceTx.tx.getTransactionCount(address1);
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            nonce: Number(txCount)
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('nonce', txCount);
      });

      it('sets custom nonce as hex value', async () => {
        const txCount = await marketplaceTx.tx.getTransactionCount(address1);
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            nonce: `0x${Number(txCount).toString(16)}`
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('nonce', txCount);
      });

      it('sets custom nonce as string value', async () => {
        const txCount = await marketplaceTx.tx.getTransactionCount(address1);
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            nonce: Number(txCount).toString()
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('nonce', txCount);
      });
    });

    describe('Setting custom gas price and limit', () => {
      it('sets custom gas limit and price', async () => {
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            gas: 123456,
            gasPrice: 987654321
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 123456);
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });

      it('sets custom gas limit and price for platform coin transfer', async () => {
        const { transactionHash } = await marketplaceTx.sender.sendPlatformCoin({
          fromAddress: address1,
          signTx: getSignTx(),
          value: 0,
          toAddress: address1,
          txOptions: {
            gas: 123456,
            gasPrice: 987654321
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 21000, 'Gas limit for ETH transfers is hardcoded to 21000');
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });

      it('sets gas limit and gas price in string format', async () => {
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            gas: '123456',
            gasPrice: '987654321'
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 123456);
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });

      it('sets gas limit and gas price for platform coin transfer in string format', async () => {
        const { transactionHash } = await marketplaceTx.sender.sendPlatformCoin({
          fromAddress: address1,
          signTx: getSignTx(),
          value: 0,
          toAddress: address1,
          txOptions: {
            gas: '123456',
            gasPrice: '987654321'
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 21000, 'Gas limit for ETH transfers is hardcoded to 21000');
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });

      it('sets gas limit and gas price in hex format', async () => {
        const { transactionHash } = await marketplaceTx.sender.send({
          fromAddress: address1,
          signTx: getSignTx(),
          contractName: 'CvcToken',
          method: 'approve',
          params: [address1, 0],
          txOptions: {
            gas: '0x1e240',
            gasPrice: '0x3ade68b1'
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 123456);
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });

      it('sets gas limit and gas price for platform coin transfer in hex format', async () => {
        const { transactionHash } = await marketplaceTx.sender.sendPlatformCoin({
          fromAddress: address1,
          signTx: getSignTx(),
          value: 0,
          toAddress: address1,
          txOptions: {
            gas: '0x1e240',
            gasPrice: '0x3ade68b1'
          }
        });
        const txInfo = await getTransactionInfo(transactionHash);
        expect(txInfo).to.have.property('gas', 21000, 'Gas limit for ETH transfers is hardcoded to 21000');
        expect(txInfo)
          .to.have.property('gasPrice')
          .bignumber.equals(987654321);
      });
    });
  });

  // skipped as all tests are failing due to a revert on the blockchain
  // need to fix this first
  describe('Single transaction online signing', () => {
    const address1 = users[0].address;
    const address2 = users[1].address;

    it('should send single transaction', async () => {
      const amount = 100;
      const [address1Before, address2Before] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);

      await marketplaceTx.tx.waitForMine(
        marketplaceTx.sender.send({
          fromAddress: address1,
          contractName: 'CvcToken',
          method: 'transfer',
          params: [address2, amount]
        })
      );
      const [address1After, address2After] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);
      expect(address1Before.balance.minus(address1After.balance).toNumber()).to.equal(amount);
      expect(address2After.balance.minus(address2Before.balance).toNumber()).to.equal(amount);
    });
  });

  describe('Transaction batch', () => {
    const address1 = users[4].address;
    const address2 = users[5].address;
    /**
     * Forces nonce error in batch transaction send by duplicating nonces in the same batch.
     * @param errorType Specific error type to simulate
     * @param failedTxIndex
     * @param delay Transaction signing delay in milliseconds
     * @returns {function(*=, *=)}
     */
    function getSignBatchTx(errorType = null, failedTxIndex = 0, delay = 1) {
      return async (fromAddress, rawTx) => {
        if (errorType === ERR_NONCE_TOO_LOW) {
          const txToFail = rawTx[failedTxIndex];

          // since we override the nonce it cannot be released correctly by error handler
          // so we release it manually beforehand
          await marketplaceTx.nonce.releaseAccountNonce(txToFail.from, txToFail.nonce);
          txToFail.nonce = '0x0'; // set nonce to 0 to trigger "nonce to low" error
        }

        return sleep(delay).then(() => signTx(fromAddress, rawTx));
      };
    }

    it('should send transaction batch', async () => {
      const amount = 10;
      const [address1Before, address2Before] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);
      await marketplaceTx.sender.sendChain({
        fromAddress: address1,
        signTx: getSignBatchTx(),
        transactions: [
          { contract: 'CvcToken', method: 'transfer', args: [address2, amount] },
          { contract: 'CvcToken', method: 'transfer', args: [address2, amount] },
          { contract: 'CvcToken', method: 'transfer', args: [address2, amount] }
        ]
      });
      const [address1After, address2After] = await marketplaceTx.token.getBalances([
        { address: address1 },
        { address: address2 }
      ]);

      expect(address1Before.balance.minus(address1After.balance).toNumber()).to.equal(amount * 3);
      expect(address2After.balance.minus(address2Before.balance).toNumber()).to.equal(amount * 3);
    });

    it('should set custom gas price and limit to the whole batch', async () => {
      const txReceipt = await marketplaceTx.sender.sendChain({
        fromAddress: address1,
        signTx: getSignBatchTx(),
        transactions: [{ contract: 'CvcToken', method: 'approve', args: [address1, 0] }],
        txOptions: {
          gas: 123456,
          gasPrice: 987654321
        }
      });

      const txInfo = await getTransactionInfo(txReceipt.transactionHash);
      expect(txInfo).to.have.property('gas', 123456);
      expect(txInfo)
        .to.have.property('gasPrice')
        .bignumber.equals(987654321);
    });

    it('should fail to send tx with low nonce & return unprocessed transactions', async () => {
      const txToFailIndex = 3;
      const txBatch = [
        { contract: 'CvcToken', method: 'transfer', args: [address2, 10] },
        { contract: 'CvcToken', method: 'transfer', args: [address2, 20] },
        { contract: 'CvcToken', method: 'transfer', args: [address2, 30] },
        { contract: 'CvcToken', method: 'transfer', args: [address2, 40] },
        { contract: 'CvcToken', method: 'transfer', args: [address2, 50] }
      ];
      // We fail batch from third transaction.
      const sendPromise = marketplaceTx.sender.sendChain({
        fromAddress: address1,
        signTx: getSignBatchTx(ERR_NONCE_TOO_LOW, txToFailIndex),
        transactions: txBatch
      });
      await expect(sendPromise)
        .to.be.eventually.rejectedWith(marketplaceTx.errors.FailedBatchError)
        .and.have.property('transactions')
        .to.deep.equal(txBatch.slice(txToFailIndex));
    });

    describe('Batch signing timeout', () => {
      const address1 = users[6].address;
      const address2 = users[7].address;

      it('should succeed when transaction batch is signed on time', async () => {
        const amount = 10;
        const txSigningDelay = TX_SIGNING_TIMEOUT - 10; // set delay below the allowed timeout
        const sendPromise = marketplaceTx.sender.sendChain({
          fromAddress: address1,
          signTx: getSignBatchTx(null, null, txSigningDelay),
          transactions: [
            { contract: 'CvcToken', method: 'transfer', args: [address2, amount] },
            { contract: 'CvcToken', method: 'transfer', args: [address2, amount] }
          ]
        });
        await expect(sendPromise).to.be.eventually.fulfilled;
      });

      it('should fail when transaction batch signing request times out', async () => {
        const amount = 10;
        const txSigningDelay = TX_SIGNING_TIMEOUT + 10; // set delay above the allowed timeout
        const sendPromise = marketplaceTx.sender.sendChain({
          fromAddress: address1,
          signTx: getSignBatchTx(null, null, txSigningDelay),
          transactions: [
            { contract: 'CvcToken', method: 'transfer', args: [address2, amount] },
            { contract: 'CvcToken', method: 'transfer', args: [address2, amount] }
          ]
        });

        await expect(sendPromise)
          .to.be.eventually.rejectedWith(marketplaceTx.errors.FailedBatchError)
          .and.have.property('cause')
          .instanceOf(marketplaceTx.util.timeout.Error);
      });
    });
  });
});

describe('Getting contract instance', () => {
  let screwedUpContractFileName;

  const screwUpContractAddress = contract => {
    const realContractFileName = `./contracts/${contract}.json`;
    screwedUpContractFileName = `./contracts/${contract}ScrewedUp.json`;

    const data = fs.readFileSync(realContractFileName);
    const contractData = JSON.parse(data);

    Object.values(contractData.networks).forEach(
      // eslint-disable-next-line no-return-assign
      network => (network.address = '0x639005eaff9e07ee495f4377d29405daed982edd')
    ); // some address with nothing deployed to it

    fs.writeFileSync(screwedUpContractFileName, JSON.stringify(contractData));
  };

  const copyContract = contract => {
    const realContractFileName = `./contracts/${contract}.json`;
    const copiedContractFileName = `./contracts/${contract}Copy.json`;

    const data = fs.readFileSync(realContractFileName);
    const contractData = JSON.parse(data);

    fs.writeFileSync(copiedContractFileName, JSON.stringify(contractData));
  };

  const deleteContract = contract => {
    const contractFileNameToDelete = `./contracts/${contract}.json`;
    fs.unlinkSync(contractFileNameToDelete);
  };

  before(() => screwUpContractAddress('CvcToken'));
  after(() => fs.unlinkSync(screwedUpContractFileName));

  it('should fail if the contract is not deployed at the address specified in the JSON file', () => {
    const contractPromise = marketplaceTx.tx.contractInstance('CvcTokenScrewedUp');

    return expect(contractPromise).to.be.eventually.rejectedWith(marketplaceTx.errors.NotDeployedError);
  });

  it('should memoize the result of the first call', async () => {
    copyContract('CvcToken');

    // Make a copy so that we don't delete the real contract
    const copyName = 'CvcTokenCopy';

    const firstContract = await marketplaceTx.tx.contractInstance(copyName);

    // delete the copy so it cannot be read again
    deleteContract(copyName);

    const secondContract = await marketplaceTx.tx.contractInstance(copyName);

    return expect(secondContract).to.equal(firstContract);
  });
});
