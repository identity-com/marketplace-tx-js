## Developer Guide

### Testing

Run all tests locally with:

```
npm install
npm run check
```

This will run unit tests, integration tests, coverage checks and the linter.

Note - the integration tests use [ganache-cli](https://github.com/trufflesuite/ganache-cli) and require docker.

If you get "Invalid nonce values" when running the tests, ensure your ganache docker container and volume
were shut down and deleted correctly after the tests ran.

To run the integration tests without docker, start up your own blockchain node at localhost:8545 and
run `npm run test-blockchain`.