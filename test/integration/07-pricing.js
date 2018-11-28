const chai = require('chai');
const Web3 = require('web3');
const _ = require('lodash');
chai.use(require('chai-bignumber')());
chai.use(require('chai-as-promised'));
const Bn = require('bignumber.js');
const MarketplaceTx = require('../../src/marketplace-tx');
const signTx = require('./signtx');
const users = require('./users');

const { expect } = chai;

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplaceTx = new MarketplaceTx({ web3 });

describe('Pricing', () => {
  const { pricing, ontology } = marketplaceTx;
  const { waitForMine } = marketplaceTx.tx;

  // Accounts
  const admin = users[0].address;
  const idv = users[6].address;
  const testIdv = users[7].address;

  // Credential Item
  const type = 'credential';
  const name = 'proofOfIdentity';
  const version = 'v1.0';
  const reference = 'https://www.identity.com/';
  const referenceType = 'JSON-LD-Context';
  const referenceHash = '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165';
  const price = new Bn(2000);
  const deprecated = false;

  // Return price to default value.
  after(() => marketplaceTx.tx.waitForMine(pricing.setPrice(idv, signTx, type, name, version, price)));

  describe('Getting prices:', () => {
    describe('when looking up single price', () => {
      describe('when price is not available', () => {
        it('fails', async () => expect(pricing.getPrice(idv, type, 'unknown', version)).to.be.rejected);
      });

      describe('when price is available', () => {
        it('returns the correct price', async () => {
          const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
          assertCredentialItemPrice(credentialItemPrice, [price, idv, type, name, version, deprecated]);
        });
      });
    });

    describe('when fetching all prices', () => {
      const newCredentialItemNames = ['A', 'B', 'C'].map(i => `${name}${i}`);
      before(async () => {
        // eslint-disable-next-line no-restricted-syntax
        for (const credentialItemName of newCredentialItemNames) {
          // eslint-disable-next-line no-await-in-loop
          await waitForMine(
            ontology.add(admin, signTx, type, credentialItemName, version, reference, referenceType, referenceHash)
          );
          // eslint-disable-next-line no-await-in-loop
          await waitForMine(pricing.setPrice(idv, signTx, type, credentialItemName, version, price));
        }
      });

      it('returns all prices', async () => {
        const pricedCredentialItems = [name, 'proofOfAge', ...newCredentialItemNames];
        const prices = await pricing.getAllPrices();
        expect(prices)
          .to.be.an('array')
          .with.lengthOf(6);
        expect(_.map(prices, 'credentialItem.name')).to.include.members(pricedCredentialItems);
        expect(_.map(prices, 'idv')).to.include.members([idv, testIdv]);
        expect(prices).to.have.nested.property('[0].deprecated', deprecated, 'Includes deprecated flag');
      });
    });
  });

  describe('Setting prices:', () => {
    it('sets the correct price', async () => {
      const newPrice = new Bn(5000);
      await waitForMine(pricing.setPrice(idv, signTx, type, name, version, newPrice));
      const credentialItemPrice = await pricing.getPrice(idv, type, name, version);
      assertCredentialItemPrice(credentialItemPrice, [newPrice, idv, type, name, version, deprecated]);
    });

    describe('on deprecated item', () => {
      before('deprecate item first', async () => {
        await waitForMine(
          ontology.add(admin, signTx, 'claim', 'deprecated', 'outdated', reference, referenceType, referenceHash)
        );
        await waitForMine(pricing.setPrice(testIdv, signTx, 'claim', 'deprecated', 'outdated', 1234));
        await waitForMine(ontology.deprecate(admin, signTx, 'claim', 'deprecated', 'outdated'));
      });

      it('returns the deprecated price', async () => {
        const credentialItemPrice = await pricing.getPrice(testIdv, 'claim', 'deprecated', 'outdated');
        assertCredentialItemPrice(credentialItemPrice, [1234, testIdv, 'claim', 'deprecated', 'outdated', true]);
      });

      it('cannot set price on deprecated item', () =>
        expect(waitForMine(pricing.setPrice(idv, signTx, 'claim', 'deprecated', 'outdated', 1234))).to.be.rejected);

      it('cannot change price on deprecated item', () =>
        expect(waitForMine(pricing.setPrice(testIdv, signTx, 'claim', 'deprecated', 'outdated', 4321))).to.be.rejected);
    });
  });

  describe('Deleting prices:', () => {
    it('deletes price', async () => {
      await expect(pricing.getPrice(idv, type, name, version)).to.be.fulfilled;
      await waitForMine(pricing.deletePrice(idv, signTx, type, name, version));
      await expect(pricing.getPrice(idv, type, name, version)).to.be.rejected;
    });
  });
});

function assertCredentialItemPrice(credentialItemPrice, [price, idv, type, name, version, deprecated]) {
  expect(credentialItemPrice).to.have.property('id');
  expect(credentialItemPrice.price).to.bignumber.equal(price);
  expect(credentialItemPrice).to.have.property('idv', idv);
  expect(credentialItemPrice).to.have.deep.property('credentialItem', { type, name, version });
  expect(credentialItemPrice).to.have.property('deprecated', deprecated);
}
