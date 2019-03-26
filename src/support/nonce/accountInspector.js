const ethUtil = require('ethereumjs-util');
const util = require('util');

module.exports = class AccountInspector {
  /**
   * @param web3
   */
  constructor(web3) {
    this.web3 = web3;
  }

  /**
   * Returns current transaction count for specific address.
   *
   * NOTE: There are reports of incorrect behaviour of web3.eth.getTransactionCount
   * which affects the count of pending transactions.
   * https://github.com/ethereum/go-ethereum/issues/2880
   * At this time we could only rely on the count of mined transactions.
   *
   * @param address The address to get the numbers of transactions from.
   * @param defaultBlock The default block number to use when querying a state.
   *   "earliest", the genesis block
   *   "latest", the latest block (current head of the blockchain)
   *   "pending", the currently mined block (including pending transactions)
   * @returns {Promise<number>}
   */
  async getTransactionCount(address, defaultBlock = 'latest') {
    const getTransactionCountPromise = util.promisify(cb =>
      this.web3.eth.getTransactionCount(address, defaultBlock, cb)
    );
    return getTransactionCountPromise();
  }

  /**
   * Retrieves txpool content (pending and queued transactions) for specific address.
   * @param address
   * @returns {Promise<any>}
   */
  async inspectTxPool(address) {
    return new Promise((resolve, reject) => {
      this.web3.txpool.inspect((error, result) => {
        if (error) {
          if (error.message.includes('Method txpool_inspect not supported.')) {
            // handle cases where txpool.inspect is not available
            // we just have to assume there is nothing pending in this case
            return resolve({ pending: {}, queued: {} });
          }
          return reject(error);
        }
        const checksummedAddress = ethUtil.toChecksumAddress(address);
        return resolve({
          pending: result.pending[checksummedAddress] || {},
          queued: result.queued[checksummedAddress] || {}
        });
      });
    });
  }
};
