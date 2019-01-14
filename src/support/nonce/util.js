const _ = require('lodash');

module.exports = {
  calculateNonce(debugLog, storedNonces, txCount, { pending, queued }) {
    // Keep nonces which are not mined yet
    // and release nonces which values are below the account tx count (i.e. lowest possible value).
    const acquiredNonces = _.pickBy(storedNonces, (value, nonce) => nonce >= txCount);
    if (_.size(acquiredNonces) !== _.size(storedNonces)) {
      debugLog(`released nonces: ${_.difference(_.keys(storedNonces), _.keys(acquiredNonces)).join(', ')}`);
    }

    // Get all known transactions by combining acquired nonces with data from tx pool.
    const knownTransactions = _.assign({}, acquiredNonces, pending, queued);

    // Get all known nonces.
    const knownNonces = _.keys(knownTransactions);
    if (knownNonces.length) {
      debugLog(`known nonces: ${knownNonces.join(', ')}`);
    }

    // Calculate max known nonce.
    const maxKnownNonce = knownNonces.reduce((a, b) => Math.max(a, b), txCount);

    // Go from current tx count value (i.e. lowest possible value) to max known nonce looking for the gaps.
    let nextNonce = txCount;
    while (nextNonce <= maxKnownNonce) {
      // Stop at the first non-used nonce (i.e. first gap).
      if (!(nextNonce in knownTransactions)) break;
      // Increment nonce. If no gaps found, return the value next after max used nonce.
      nextNonce += 1;
    }

    // Mark this nonce as acquired to make it unavailable for others
    acquiredNonces[nextNonce] = true;

    debugLog(`nonce acquired: ${nextNonce}`);

    return { nextNonce, acquiredNonces };
  }
};
