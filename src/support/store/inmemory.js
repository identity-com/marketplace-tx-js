module.exports = class InMemory {
  constructor() {
    this.store = {};
  }

  get(key) {
    return this.store[key] || null;
  }

  put(key, value) {
    this.store[key] = value;
  }

  delete(key) {
    delete this.store[key];
  }

  keys() {
    return Object.keys(this.store);
  }

  clear() {
    this.store = {};
  }
};
