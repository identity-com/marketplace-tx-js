require('longjohn');
const chai = require('chai');
const Web3 = require('web3');
const FakeProvider = require('web3-fake-provider');
const MarketplaceTx = require('../src/marketplace-tx');

const { expect } = chai;

const web3 = new Web3(new FakeProvider());
const marketplaceTx = new MarketplaceTx({ web3 }, { preloadContracts: false });

describe('ontology.js', () => {
  const { ontology } = marketplaceTx;
  const invalidCredentialItem = 'credential-proofOfIdentity';
  const validCredentialItem = 'credential-proofOfIdentity-v1.0';
  const validType = 'credential';
  const validName = 'proofOfIdentity';
  const validVersion = 'v1.0';

  it('parses a credential item external id into type, name and version', () => {
    const [type, name, version] = ontology.parseExternalId(validCredentialItem);
    expect(type).to.equal(validType);
    expect(name).to.equal(validName);
    expect(version).to.equal(validVersion);
  });

  it('throws an error when external id format is incorrect', () => {
    expect(() => ontology.parseExternalId(invalidCredentialItem)).to.throw();
  });

  it('composes a type, name and version into a credential item external id', () => {
    const credentialItem = ontology.composeExternalId(validType, validName, validVersion);
    expect(credentialItem).to.equal(validCredentialItem);
  });
});
