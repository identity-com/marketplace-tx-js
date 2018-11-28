const { expect } = require('chai');
const Store = require('../src/support/store/inmemory');

const key1 = 'abc';
const key2 = 'def';
const value1 = { complexObject: { a: 1, b: 2 } };
const value2 = { complexObject: { a: 3, b: 4 } };

let store;

describe('Store: inmemory.js', () => {
  beforeEach(() => {
    store = new Store();
  });

  it('lists all keys', () => {
    store.put(key1, value1);
    store.put(key2, value2);

    expect(store.keys()).to.contain(key1, key2);
  });

  it('gets a key', () => {
    store.put(key1, value1);

    expect(store.get(key1)).to.equal(value1);
  });

  it('deletes a key', () => {
    store.put(key1, value1);
    store.delete(key1);
    // eslint-disable-next-line no-unused-expressions
    expect(store.get(key1)).to.be.null;
  });

  it('clears the store', () => {
    store.put(key1, value1);
    store.put(key2, value2);
    store.clear();
    // eslint-disable-next-line no-unused-expressions
    expect(store.keys()).to.be.empty;
  });
});
