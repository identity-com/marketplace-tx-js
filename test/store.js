const chai = require('chai');
const Store = require('../src/support/store/inmemory');
const { timeout } = require('../src/support/util');

const TimeoutError = timeout.Error;
const { expect } = chai;
chai.use(require('chai-as-promised'));

const key1 = 'abc';
const key2 = 'def';
const value1 = { complexObject: { a: 1, b: 2 } };
const value2 = { complexObject: { a: 3, b: 4 } };
const timeoutLock = (lockPromise, ms) => timeout(lockPromise, ms, `Cannot acquire lock within ${ms} ms`);

let store;

describe('Store: inmemory.js', () => {
  beforeEach(() => {
    store = new Store();
  });

  describe('read and write is available without any locks', () => {
    it('gets a key', () => {
      store.put(key1, value1);

      expect(store.get(key1)).to.equal(value1);
    });

    it('clears the store', () => {
      store.put(key1, value1);
      store.put(key2, value2);
      store.clear();
      // eslint-disable-next-line no-unused-expressions
      expect(store.keys()).to.be.empty;
    });
  });

  describe('lock', () => {
    afterEach(() => store.clear());

    it('prevents race condition', () =>
      expect(Promise.all([timeoutLock(store.lock(key1), 300), timeoutLock(store.lock(key1), 300)])).to.be.rejectedWith(
        TimeoutError
      ));

    it('locks by key', () => Promise.all([timeoutLock(store.lock(key1), 300), timeoutLock(store.lock(key2), 300)]));

    it('releases after put', async () => {
      await store.lock(key1);
      await expect(timeoutLock(store.lock(key1), 300)).to.be.rejectedWith(TimeoutError);
      await store.put(key1, value1);
      await expect(timeoutLock(store.lock(key1), 300)).to.be.fulfilled;
    });

    it('can release', async () => {
      await store.lock(key1);
      await expect(timeoutLock(store.lock(key1), 300)).to.be.rejectedWith(TimeoutError);
      await store.release(key1);
      await expect(timeoutLock(store.lock(key1), 300)).to.be.fulfilled;
    });
  });
});
