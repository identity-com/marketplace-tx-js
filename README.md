# marketplace-tx

This is the JavaScript client library for the Identity.com Marketplace. It provides an interface for all capabilities on the blockchain, including accessing smart contract data, sending transactions (modifying blockchain data, smart contract state), exchanging CVC tokens and exchanging ETH (aka platform coin).

[API Documentation](https://identity-com.github.io/marketplace-tx-js/doc/index.html)

## Getting started

### Terminology

We use the standard Identity.com terms for roles on the network:

- __IDR__:  ID requester

- __IDV__:  ID validator

- __Scope request ID__: The UUID for PII request made by IDR to IDV, on the blockchain represented by a bytes32 string (64 hex chars) 

- __Credential Item__:  Single piece of PII, can be claim (atom) or credential (molecule)

- __Credential Item Internal ID__:  Credential items are identified by external or internal ID. The Internal ID is stored in the blockchain (bytes32 string of 64 hex chars) and is the keccak256 of the external ID.

- __Credential Item External ID__:  The External ID consists of `Type, Name and Version`, using dash as a separator, e.g. `credential-ProofOfIdentity-v1.0`.

### Installing 

For development, fetch the library from github: [https://github.com/identity-com/marketplace-tx-js](https://github.com/identity-com/marketplace-tx-js)

The library is not yet listed on npmjs.org.

Integrate with your application using:

```js
const MarketplaceTx = require('marketplace-tx');
```

#### Using in browser
The library uses ES2017 features therefore it may need to be transpiled before it can be used in browser.
If you are using Babel, you need to use the [env](https://babeljs.io/docs/en/env) preset (or similar).
Add the correct preset to your `.babelrc` config.

```js
{
  "presets": ["env"]
}
```

#### Using in React app
In order to integrate the MarketplaceTx into your React application you might use [react-app-rewired](https://github.com/timarney/react-app-rewired) library.
It allows to tweak the create-react-app webpack config without using 'eject' and without creating a fork of the react-scripts.

First add the correct presets to your `.baberc` config.

```js
{
  "presets": ["env", "react"]
}
```

Then add the `config-overrides.js` file and tweak the Babel loader as following:

```js
const path = require('path');
const fs = require('fs');
const rewireBabelLoader = require('react-app-rewire-babel-loader');
const { getBabelLoader } = require('react-app-rewired');
const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = relativePath => path.resolve(appDirectory, relativePath);

module.exports = function override(config, env) {
  // Make Babel loader read the configuration from .babelrc file.
  const babelLoader = getBabelLoader(config.module.rules);
  babelLoader.options.babelrc = true;
  
  config = rewireBabelLoader.include(
    config,
    resolveApp('node_modules/marketplace-tx')
  );

  return config;
};
```

### Use with Infura

MarketplaceTx is currently *not* compatible with Infura, as it requires access to the `txpool`
Ethereum RPC API for nonce management.

### Asynchronous calls

The library returns a `Promise` on any async call. Use `async/await` or `.then().catch()` according to your environment.

### Initialising

Before using the library, you should:

```js
const MarketplaceTx = require('marketplace-tx');
const marketplaceTx = new MarketplaceTx({web3});
```

Where ```web3``` is a valid web3 object connected to a node.

### Configuration

MarketplaceTx is configured by the file config/<STAGE>.json, where STAGE is passed in as an environment variable.

Alternatively, it is possible to pass in config to the constructor:

The MarketplaceTx constructor accepts two arguments:
1. context - to inject dependencies, like web3, logger, etc.
2. config - to provide configuration parameters


```js
const context = { web3 };
const config = { ... };
const marketplaceTx = new MarketplaceTx(context, config);
```

### Logging 

MarketplaceTx will log automatically to the console. To use your own logger:

```js
const logger = winston();
const marketplaceTx = new MarketplaceTx({web3, logger}, config);
```

### Contracts

MarketplaceTx requires contract artifacts - JSON files produced by [https://github.com/identity-com/smart-contracts](Marketplace Smart Contracts library) containing contract name, ABI, addresses on specified networks. 
You can specify the path to to the artifacts folder by passing it to the config upon the initialisation:

```js
const config = { contracts: { dir: 'contracts/' } };
const marketplaceTx = new MarketplaceTx(context, config);
```


## Usage

### Structure

The library is structured into these sub-modules:

See the [API Documentation](https://identity-com.github.io/marketplace-tx-js/doc/index.html) for more details

#### Core modules

```marketplaceTx.escrow``` for placing tokens into and releasing them from the escrow contract

```marketplaceTx.idv-registry``` for adding and managing registered IDVs

```marketplaceTx.ontology``` for managing the ontology of attestation types

```marketplaceTx.pricing``` for contributing and querying prices

```marketplaceTx.token``` for transferring tokens and querying balances

#### Support modules

```marketplaceTx.asserts``` containing input validation functions

```marketplaceTx.nonce``` for managing nonces for externally signed transactions

```marketplaceTx.tx``` for creating transactions on smart contracts (used by other submodules, discouraged to use directly)

```marketplaceTx.sender``` for sending transactions to the blockchain (used by other submodules, discouraged to use directly)

```marketplaceTx.coin``` for transferring platform coin and querying balances

```marketplaceTx.transactionDetails``` for looking up specific transaction details

```marketplaceTx.util``` utilities for handling conversion between types, etc.

### Creating transactions

Transaction object (rawTx) can be created by the ```marketplaceTx.tx``` module.
Nonce management is done by the ```marketplaceTx.nonce``` module. It respects the ethereum node's txpool
and uses a nonce acquire/release mechanism to allow sequential chains of transactions
in case you require strict order of execution.

Note - to use the nonce manager, the node needs access to the ethereum `txpool RPC interface.

### Signing transactions

Typically with ```web3```, transactions are signed by a local ethereum client node (with private keys being stored in the node).
For phone and distributed apps, this is not ideal.

We have elected to sign transactions in the library before submitting the transactions to a cluster of nodes.

The library makes no assumption about how this will be done. Functions that need to sign a transaction take a function that must return a promise:

```js
const signingFunction = (address, rawTx) => {....};
```

Parameter ```address``` is the address that should sign, ```rawTx``` is a JSON transactions (or array of JSON transactions)

This function asynchronously signs the transaction and returns it through the promise (if ```rawTx``` is an array, then the return type is an array of signed transactions). The returned value(s) will be passed to ```web3.eth.sendRawTransaction```. A typical implementation is:

```js
const EthTx = require('ethereumjs-tx')

// const rawTx = {nonce: <>, gasLimit: <>, to: <>, value: <>, ....}

const signingFunction = (address, rawTx) => {
    return new Promise ((resolve, reject) => {
        const ethtx = new EthTx(rawTx)
        ethtx.sign(Buffer.from(privateKey, 'hex'))
        const hex = ethtx.serialize().toString('hex');
        resolve(hex);
    });
}
```

## Other details

### Sending transactions

```marketplaceTx.sender``` module is responsible for sending transactions. It accepts an object with tx parameters and uses ```marketplaceTx.tx``` to create transaction. If an optional signTx parameter is passed, tx will be signed externally. ```send``` function returns a promise which resolves to tx hash and rejects in case something went wrong (i.e. signing failed, chainID is wrong, insufficient wei etc.).

### Mining transactions

```marketplaceTx.tx.waitForMine``` function can be used to check that a transaction was successfully mined. It expects a promise which resolves to a tx hash (a return value of ```marketplaceTx.sender.send``` could be used) and polls the blockchain each 0.5 sec for 2 minutes until the tx receipt is returned. Then it asserts that the tx status is a success.
