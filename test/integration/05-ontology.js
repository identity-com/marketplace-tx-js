const chai = require('chai');
const Web3 = require('web3');
const MarketplaceTx = require('../../src/marketplace-tx');
const users = require('./users');
const signTx = require('./signtx');

const { expect } = chai;

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplacetx = new MarketplaceTx(web3);

describe('Ontology', () => {
  const type = 'credential';
  const name = 'proofOfIdentity';
  const version = 'v1.0';
  const reference = 'https://www.identity.com/';
  const referenceType = 'JSON-LD-Context';
  const referenceHash = '0x2cd9bf92c5e20b1b410f5ace94d963a96e89156fbe65b70365e8596b37f1f165';
  const { ontology } = marketplacetx;
  const { waitForMine } = marketplacetx.tx;
  const admin = users[0].address;

  describe('get', () => {
    it('can get by type, name and version', async () => {
      const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
      expect(credentialItem).to.be.an('object');
      expect(credentialItem)
        .to.have.property('id')
        .to.match(/^0x[0-f]{64}$/)
        .to.not.match(/0x0{64}/);
      expect(credentialItem).to.have.property('type', type);
      expect(credentialItem).to.have.property('name', name);
      expect(credentialItem).to.have.property('version', version);
      expect(credentialItem).to.have.property('reference', reference);
      expect(credentialItem).to.have.property('referenceType', referenceType);
      expect(credentialItem).to.have.property('referenceHash', referenceHash);
      expect(credentialItem).to.have.property('deprecated', false);
    });

    it('can get by id', async () => {
      const byTypeNameVersion = await ontology.getByTypeNameVersion(type, name, version);
      const credentialItem = await ontology.getByTypeNameVersion(type, name, version);
      expect(credentialItem).to.deep.equal(byTypeNameVersion);
    });

    it('can get all credential items', async () => {
      const proofOfIdentity = await ontology.getByTypeNameVersion(type, name, version);
      const proofOfAge = await ontology.getByTypeNameVersion('credential', 'proofOfAge', 'v1.0');
      const credentialItems = await ontology.getAll();
      expect(credentialItems)
        .to.be.an('array')
        .with.lengthOf(2)
        .that.deep.includes(proofOfAge)
        .and.includes(proofOfIdentity);
    });

    describe('throws when not found', () => {
      it('by id', () =>
        expect(
          ontology.getById('0x0000000000000000000000000100000000000000000000000000000000000000')
        ).to.be.rejectedWith(/does not exist/));
      it('by type-name-version', () =>
        expect(ontology.getByTypeNameVersion('some', 'invalid', 'id')).to.be.rejectedWith(/does not exist/));
      it('id by type-name-version', () =>
        expect(ontology.getById('some', 'invalid', 'id')).to.be.rejectedWith(/does not exist/));
    });
  });

  describe('add', () => {
    it('can add credential item', async () => {
      await waitForMine(ontology.add(admin, signTx, 'claim', 'age', 'v1.0', reference, referenceType, referenceHash));

      const newClaim = await ontology.getByTypeNameVersion('claim', 'age', 'v1.0');
      expect(newClaim).to.be.an('object');
      expect(newClaim)
        .to.have.property('id')
        .to.match(/^0x[0-f]{64}$/)
        .to.not.match(/0x0{64}/);
    });

    it('cannot modify existing credential item', () =>
      expect(waitForMine(ontology.add(admin, signTx, type, name, version, reference, referenceType, referenceHash)))
        .rejected);

    describe('argument validation', () => {
      it('denies invalid type', () =>
        expect(ontology.add(admin, signTx, 'Some random type', name, version, reference, referenceType, referenceHash))
          .rejected);

      describe('denies empty arguments', () => {
        it('empty type', () =>
          expect(ontology.add(admin, signTx, '', 'age', 'v2.0', reference, referenceType, referenceHash)).rejected);
        it('empty name', () =>
          expect(ontology.add(admin, signTx, 'claim', '', 'v2.0', reference, referenceType, referenceHash)).rejected);
        it('empty version', () =>
          expect(ontology.add(admin, signTx, 'claim', 'dob', '', reference, referenceType, referenceHash)).rejected);
        it('empty reference', () =>
          expect(ontology.add(admin, signTx, 'claim', 'age', 'v2.0', '', referenceType, referenceHash)).rejected);
        it('empty referenceType', () =>
          expect(ontology.add(admin, signTx, 'claim', 'age', 'v2.0', reference, '', referenceHash)).rejected);
        it('empty referenceHash', () =>
          expect(ontology.add(admin, signTx, 'claim', 'age', 'v2.0', reference, referenceType, '')).rejected);
      });
    });
  });

  describe('deprecate credential item', () => {
    before('add outdated credential items for deprecation', () =>
      Promise.all([
        waitForMine(ontology.add(admin, signTx, 'claim', 'dob', 'v2.0', reference, referenceType, referenceHash)),
        waitForMine(ontology.add(admin, signTx, 'claim', 'dob', 'v3.0', reference, referenceType, referenceHash))
      ])
    );

    it('by external ID', async () => {
      const freshClaim = await ontology.getByTypeNameVersion('claim', 'dob', 'v2.0');
      await waitForMine(ontology.deprecate(admin, signTx, 'claim', 'dob', 'v2.0'));
      const deprecatedClaim = await ontology.getByTypeNameVersion('claim', 'dob', 'v2.0');
      expect(deprecatedClaim.deprecated).to.be.true.and.not.equals(freshClaim.deprecated);
    });

    it('by internal ID', async () => {
      const freshClaim = await ontology.getByTypeNameVersion('claim', 'dob', 'v3.0');
      // eslint-disable-next-line no-unused-expressions
      expect(freshClaim.deprecated).to.be.false;
      await waitForMine(ontology.deprecateById(admin, signTx, freshClaim.id));
      const deprecatedClaim = await ontology.getByTypeNameVersion('claim', 'dob', 'v3.0');
      expect(deprecatedClaim.deprecated).not.equals(freshClaim.deprecated);
    });
  });
});
