const chai = require('chai');
chai.use(require('chai-bignumber')());

const { expect } = chai;
const Web3 = require('web3');
const MarketplaceTx = require('../../src/marketplace-tx');
const users = require('./users');
const signTx = require('./signtx');

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplaceTx = new MarketplaceTx({ web3 });

const { waitForMine } = marketplaceTx.tx;

describe('Cvc Token', () => {
  const address1 = users[0].address;
  const address2 = users[1].address;

  it('should transfer tokens and return correct token balances', async () => {
    const transferAmount = marketplaceTx.token.toCred(10);
    const [account1Before, account2Before] = await marketplaceTx.token.getBalances([
      { address: address1 },
      { address: address2 }
    ]);

    await waitForMine(marketplaceTx.token.transfer(address1, signTx, address2, transferAmount));

    const [account1After, account2After] = await marketplaceTx.token.getBalances([
      { address: address1 },
      { address: address2 }
    ]);

    expect(account1Before.balance.minus(account1After.balance).toNumber()).to.equal(transferAmount);
    expect(account2After.balance.minus(account2Before.balance).toNumber()).to.equal(transferAmount);
  });

  it('should return correct token balance for single address', async () => {
    const [account1, account2] = await marketplaceTx.coin.getBalances([{ address: address1 }, { address: address2 }]);

    expect(await marketplaceTx.coin.getBalance(address1)).bignumber.equal(account1.balance);
    expect(await marketplaceTx.coin.getBalance(address2)).bignumber.equal(account2.balance);
  });
});
