const logger = require('../../logger');

const DEFAULT_LOCK_CHECK_INTERVAL = 100; // 100 ms
const DEFAULT_LOCK_ACQUIRE_TIMEOUT = 45 * 1000; // 45 seconds
const DEFAULT_LOCK_TIMEOUT = 1000 * 5; // 30 seconds

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = class InMemory {
  constructor({
    LOCK_CHECK_INTERVAL = DEFAULT_LOCK_CHECK_INTERVAL,
    LOCK_ACQUIRE_TIMEOUT = DEFAULT_LOCK_ACQUIRE_TIMEOUT,
    LOCK_TIMEOUT = DEFAULT_LOCK_TIMEOUT
  }) {
    this.constants = { LOCK_CHECK_INTERVAL, LOCK_ACQUIRE_TIMEOUT, LOCK_TIMEOUT };
    this.store = {};
    this.locked = {};
  }

  async get(key) {
    const { LOCK_CHECK_INTERVAL, LOCK_ACQUIRE_TIMEOUT, LOCK_TIMEOUT } = this.constants;
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
    this.locked[key] = setTimeout(() => {
      logger.warn(`Lock on ${key} is timed out. No put or release called within ${LOCK_TIMEOUT} ms.`);
      this.release(key);
    }, LOCK_TIMEOUT);
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

    delete this.locked[key];
  }

  keys() {
    return Object.keys(this.store);
  }

  clear() {
    this.store = {};
    Object.keys(this.locked).map(key => this.release(key));
  }
};
