const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sandbox = require('sinon').createSandbox();

const pricing = require('../src/pricing');
const asserts = require('../src/support/asserts');
const tx = require('../src/support/tx');
const { NotFoundError } = require('../src/support/errors');

chai.use(chaiAsPromised);

const { expect } = chai;

const pricingContract = {
  getPrice: sandbox.stub()
};

asserts.web3 = new Web3(new FakeProvider());

const idv = '0xb69271f06da20cf1b2545e1fb969cd827e281434';
const credentialItem = {
  type: 'credential',
  name: 'proofOfIdentity',
  version: '1.0'
};
const priceIdMissing = '0x0000000000000000000000000000000000000000000000000000000000000000';
const priceIdPresent = '0x1111111111111111111111111111111111111111111111111111111111111111';
const priceValue = 1000;

describe('pricing', () => {
  beforeEach('stub tx module', () => {
    sandbox.stub(tx, 'contractInstance').returns(Promise.resolve(pricingContract));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getPrice', () => {
    it('should reject with a NotFoundError if getPrice returns nothing', () => {
      pricingContract.getPrice.returns([]);

      const pricePromise = pricing.getPrice(idv, credentialItem.type, credentialItem.name, credentialItem.version);

      return expect(pricePromise).to.be.rejectedWith(NotFoundError);
    });

    it('should reject with a NotFoundError if the price is not found (0x0...0 id)', async () => {
      pricingContract.getPrice.returns([
        priceIdMissing,
        priceValue,
        idv,
        credentialItem.type,
        credentialItem.name,
        credentialItem.version
      ]);

      const pricePromise = pricing.getPrice(idv, credentialItem.type, credentialItem.name, credentialItem.version);

      return expect(pricePromise).to.be.rejectedWith(NotFoundError);
    });

    it('should return a price if the price is found', async () => {
      pricingContract.getPrice.returns([
        priceIdPresent,
        priceValue,
        idv,
        credentialItem.type,
        credentialItem.name,
        credentialItem.version
      ]);

      const price = await pricing.getPrice(idv, credentialItem.type, credentialItem.name, credentialItem.version);

      expect(price.price).to.equal(priceValue);
    });
  });
});
