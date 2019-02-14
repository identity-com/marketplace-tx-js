const util = {};
module.exports = util;

const Bn = require('bignumber.js');
const { ONE_CVC } = require('./constants');

util.bnToHexString = number => `0x${Number(number).toString(16)}`;

util.hexToString = hex => {
  let s = '';
  for (let c = 2; c < hex.length; c += 2) {
    const ch = parseInt(hex.substr(c, 2), 16);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
};

/**
 * @param n
 * @return {Bn}
 */
util.bnToCVC = n => new Bn(n).div(ONE_CVC);

/**
 * @param n
 * @return {Bn}
 */
util.CVCToBN = n => new Bn(n).mul(ONE_CVC);

class TimeoutError extends Error {}

/**
 * Rejects the promise after specified timeout.
 * @param promise Promise to apply timeout for.
 * @param ms Timeout in milliseconds
 * @param msg
 * @returns {Promise<any>}
 */
util.timeout = (promise, ms, msg) => {
  let timerId = null;
  // Create timer promise, with will be rejected after specified timeout.
  const timer = new Promise((resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new TimeoutError(msg));
    }, ms);
  });
  // Ensure timeout handle released.
  const clear = () => clearTimeout(timerId);
  promise.then(clear, clear);

  return Promise.race([promise, timer]);
};
util.timeout.Error = TimeoutError;
