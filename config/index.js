const _ = require('lodash');

// This is default marketplaceTx config.
// You can overwrite these values by passing custom config to MarketplaceTx constructor.
const configure = passedInConfig =>
  _.merge(
    {
      contracts: {
        dir: '../../contracts'
      },
      preloadContracts: true, // by default, check that the contracts exist on startup
      gasPrice: 1e9, // 1 gwei
      txMiningTimeout: 120, // 2 min (set in seconds)
      txSigningTimeout: 60000, // 1 min (set in milliseconds)

      // Block number in which first marketplace contract deployed (zero by default for test networks i.e. ganache).
      // Can be used as a starting point for event filtering to speed up the process.
      marketplaceDeploymentBlock: 0
    },
    passedInConfig
  );

let singletonConfigObject = null;

module.exports = (passedInConfig = {}) => {
  if (!singletonConfigObject) {
    singletonConfigObject = configure(passedInConfig);
  }

  return singletonConfigObject;
};
