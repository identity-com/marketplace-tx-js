const LOCK_CHECK_INTERVAL = 100; // 100 ms
const LOCK_ACQUIRE_TIMEOUT = 45 * 1000; // 45 seconds
const LOCK_TIMEOUT = 1000 * 30; // 30 seconds

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = class InMemory {
  constructor() {
    this.store = {};
    this.locked = {};
  }

  async lock(key) {
    const maxAttempts = Math.floor(LOCK_ACQUIRE_TIMEOUT / LOCK_CHECK_INTERVAL);
    // Wait until key is availabe for locking
    for (let attempts = 0; attempts < maxAttempts && this.locked[key]; attempts++) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(LOCK_CHECK_INTERVAL);
    }
    // Still locked after all attempts
    if (this.locked[key]) {
      throw new Error(`Cannot obtain lock for ${key} after ${LOCK_ACQUIRE_TIMEOUT}ms of ${maxAttempts} attempts`);
    }
    // Set a timer to auto-unlock the key in case release or put is never called for whatever reason
    this.locked[key] = setTimeout(() => this.release(key), LOCK_TIMEOUT);
  }

  get(key) {
    return this.store[key] || null;
  }

  put(key, value) {
    this.store[key] = value;
    this.release(key);
  }

  release(key) {
    if (this.locked[key]) {
      clearTimeout(this.locked[key]);
    }

    this.locked[key] = false;
  }

  keys() {
    return Object.keys(this.store);
  }

  clear() {
    this.store = {};
    this.keys().map(key => this.release(key));
  }
};
