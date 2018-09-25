const fs = require('fs');
const path = require('path');
const _ = require('lodash');

// if no stage is set, assume the stage is dev
const stage = process.env.STAGE ? process.env.STAGE.toLowerCase() : 'dev';

const configure = passedInConfig => {
  // returns a data structure containing custom config, either from a config file
  // or passed in source
  const getCustomConfig = () => {
    // we only expect to find config files in the file system if we are running in node
    const isNode = process && process.release && process.release.name === 'node';
    let configFile;

    if (isNode) {
      // the default place to look for the config files is in 'STAGE.json'
      // if we are running locally, override the config source with 'local'
      configFile = process.env.LOCAL === 'true' ? 'local' : stage;

      // look for the file and show a warning if it is not found
      if (!fs.existsSync(path.join(__dirname, `./${configFile}.json`))) {
        // allow a console statement here as logging is not yet set up
        // eslint-disable-next-line no-console
        console.warn(`No config file with name ${configFile}.json available - using default config`);
        configFile = null;
      }
    }

    // load the file or return an empty object
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const fromFile = configFile ? require(`./${configFile}`) : {};

    // merge the config from the file with any passed in config
    return _.merge({}, fromFile, passedInConfig);
  };

  const customConfig = getCustomConfig();

  return _.merge(
    {
      contracts: {
        dir: '../../build/contracts'
      },
      preloadContracts: true, // by default, check that the contracts exist on startup
      gasPrice: 1e9, // 1 gwei
      txMiningTimeout: 120, // 2 min (set in seconds)
      txSigningTimeout: 60000, // 1 min (set in milliseconds)

      // Block number in which first marketplace contract deployed (zero by default for test networks i.e. ganache).
      // Can be used as a starting point for event filtering to speed up the process.
      marketplaceDeploymentBlock: 0
    },
    customConfig
  );
};

let singletonConfigObject = null;

module.exports = (passedInConfig = null) => {
  if (!singletonConfigObject) {
    singletonConfigObject = configure(passedInConfig);
  }

  return singletonConfigObject;
};
