const EthTx = require('ethereumjs-tx');
const users = require('./users');

const mapAddressToKey = address => users.filter(item => item.address === address)[0].privateKey;

const signTx = (address, rawTx) =>
  new Promise((resolve, reject) => {
    const ethtx = new EthTx(rawTx);
    const key = mapAddressToKey(address);
    if (!key) {
      reject(new Error(`Private key for ${address} not found in users.js`));
    }
    ethtx.sign(Buffer.from(key, 'hex'));
    const hex = `0x${ethtx.serialize().toString('hex')}`;
    resolve(hex);
  });

module.exports = (address, tx) =>
  Array.isArray(tx) ? Promise.all(tx.map(rawTx => signTx(address, rawTx))) : signTx(address, tx);
