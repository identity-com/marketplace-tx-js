const chai = require('chai');
const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');
const MarketplaceTx = require('../../src/marketplace-tx');
const signTx = require('./signtx');
const users = require('./users');

const { expect } = chai;

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplacetx = new MarketplaceTx(web3);

describe('Validator Registry', () => {
  const { idvRegistry } = marketplacetx;
  const registryOwner = users[0].address;
  const anotherAccount = users[1].address;

  const idvAddress = '0x1a88a35421a4a0d3e13fe4e8ebcf18e9a249dc5a';
  const idvName = 'IDV';
  const idvDescription = 'IDV company';

  describe('Setting IDV entry data:', () => {
    describe('when the sender is not the registry owner', () => {
      const from = anotherAccount;
      it('fails', async () => {
        await expect(marketplacetx.tx.waitForMine(idvRegistry.set(from, signTx, idvAddress, idvName, idvDescription)))
          .to.be.eventually.rejected;
      });
    });

    describe('when the sender is the registry owner', () => {
      const from = registryOwner;
      const newIdvAddress = '0x21bcd4080fa6c19da0669ab6a9bd2f259cbc8f02';

      describe('when entry is new', () => {
        beforeEach(async () => expect(await idvRegistry.exists(newIdvAddress)).to.be.false);

        it('adds new entry', async () => {
          await marketplacetx.tx.waitForMine(idvRegistry.set(from, signTx, newIdvAddress, idvName, idvDescription));
          const idvRecord = await idvRegistry.get(newIdvAddress);
          assertValidatorRecord(idvRecord, { idvAddress: newIdvAddress, idvName, idvDescription });
        });
      });

      describe('when existing entry', () => {
        beforeEach(async () => expect(await idvRegistry.exists(newIdvAddress)).to.be.true);

        it('updates the existing entry', async () => {
          const newName = `${idvName} Updated`;
          const newDescription = `${idvDescription} Updated`;
          await marketplacetx.tx.waitForMine(idvRegistry.set(from, signTx, newIdvAddress, newName, newDescription));
          const idvRecord = await idvRegistry.get(newIdvAddress);

          assertValidatorRecord(idvRecord, {
            idvAddress: newIdvAddress,
            idvName: newName,
            idvDescription: newDescription
          });
        });
      });
    });
  });

  describe('Getting IDV entry data:', () => {
    it('returns default entry data', async () => {
      const idvRecord = await idvRegistry.get(idvAddress);
      assertValidatorRecord(idvRecord, { idvAddress, idvName, idvDescription });
    });

    describe('when entry does not exist', () => {
      it('rejects the promise', async () => {
        const unknownIdvAddress = ethUtil.zeroAddress();
        await expect(idvRegistry.get(unknownIdvAddress)).to.be.rejected;
      });
    });
  });

  describe('Verifying IDV entry existence:', () => {
    describe('when existing entry', () => {
      it('returns true', async () => expect(await idvRegistry.exists(idvAddress)).to.be.true);
    });

    describe('when entry does not exist', () => {
      it('returns false', async () => expect(await idvRegistry.exists(ethUtil.zeroAddress())).to.be.false);
    });
  });
});

function assertValidatorRecord(idvRecord, { idvAddress, idvName, idvDescription }) {
  expect(idvRecord).to.have.property('address', idvAddress);
  expect(idvRecord).to.have.property('name', idvName);
  expect(idvRecord).to.have.property('description', idvDescription);
}
