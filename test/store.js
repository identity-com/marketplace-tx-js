const chai = require('chai');
const Store = require('../src/support/store/inmemory');

const { expect } = chai;
chai.use(require('chai-as-promised'));

const key1 = 'abc';
const key2 = 'def';
const value1 = { complexObject: { a: 1, b: 2 } };
const value2 = { complexObject: { a: 3, b: 4 } };

let store;

describe('Store: inmemory.js', () => {
  beforeEach(() => {
    store = new Store({ LOCK_ACQUIRE_TIMEOUT: 300 });
  });
  afterEach(() => store.clear());

  describe('read and write is available without any locks', () => {
    it('gets a key', () => {
      store.put(key1, value1);

      return expect(store.get(key1)).to.eventually.equal(value1);
    });

    it('clears the store', () => {
      store.put(key1, value1);
      store.put(key2, value2);
      store.clear();
      // eslint-disable-next-line no-unused-expressions
      expect(store.keys()).to.be.empty;
    });
  });

  describe('get is locking', () => {
    it('prevents race condition', () =>
      expect(Promise.all([store.get(key1), store.get(key1)])).to.be.rejectedWith(/Cannot obtain lock/));

    it('locks by key', () => Promise.all([store.get(key1), store.get(key2)]));

    it('releases after put', async () => {
      await store.get(key1);
      await expect(store.get(key1)).to.be.rejectedWith(/Cannot obtain lock/);
      await store.put(key1, value1);
      await expect(store.get(key1)).to.be.fulfilled;
    });

    it('can release', async () => {
      await store.get(key1);
      await expect(store.get(key1)).to.be.rejectedWith(/Cannot obtain lock/);
      await store.release(key1);
      await expect(store.get(key1)).to.be.fulfilled;
    });
  });
});
