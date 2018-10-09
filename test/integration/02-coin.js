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
const marketplacetx = new MarketplaceTx(web3);

const { waitForMine } = marketplacetx.tx;

describe('Platform Coin', () => {
  // users[0] is a current coinbase account, therefore it cannot be used as a sender address
  // because of ever-changing balance due to the mining fees inflow.
  // This could be changed after CVC-673 is merged.
  const address1 = users[1].address;
  const address2 = users[2].address;

  it('should transfer coins and return correct balances', async () => {
    const transferAmount = 1e18;
    const [address1Before, address2Before] = await marketplacetx.coin.getBalances([
      { address: address1 },
      { address: address2 }
    ]);

    const receipt = await waitForMine(marketplacetx.coin.transfer(address1, signTx, address2, transferAmount));
    const [address1After, address2After] = await marketplacetx.coin.getBalances([
      { address: address1 },
      { address: address2 }
    ]);

    const txFee = parseInt(web3.toWei(receipt.gasUsed, 'gwei'), 10);
    expect(address1Before.balance.minus(address1After.balance).toNumber()).to.equal(transferAmount + txFee);
    expect(address2After.balance.minus(address2Before.balance).toNumber()).to.equal(transferAmount);
  });

  it('should return correct balance for single address', async () => {
    const [account1, account2] = await marketplacetx.coin.getBalances([{ address: address1 }, { address: address2 }]);

    expect(await marketplacetx.coin.getBalance(address1)).bignumber.equal(account1.balance);
    expect(await marketplacetx.coin.getBalance(address2)).bignumber.equal(account2.balance);
  });
});
