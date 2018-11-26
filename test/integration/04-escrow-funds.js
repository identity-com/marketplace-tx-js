/* eslint-disable no-await-in-loop,no-unused-expressions */
const crypto = require('crypto');
const _ = require('lodash');
const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const bn = require('bignumber.js');
const MarketplaceTx = require('../../src/marketplace-tx');
const users = require('./users');
const signTx = require('./signtx');

const { expect } = chai;

// connect to a RSK or Ethereum node
const url = process.env.ETH_NODE_URL;
const web3 = new Web3(new Web3.providers.HttpProvider(url));

// initialise the marketplace-tx library and set the web3 connection
const marketplaceTx = new MarketplaceTx({ web3 });

describe('Escrow', () => {
  let escrowAddress;
  let escrowAmount;

  const platformAddress = users[0].address;
  const idrAddress = users[1].address;
  const idvAddress = '0x1a88a35421a4a0d3e13fe4e8ebcf18e9a249dc5a';
  const defaultFeeRate = 0.1;
  const defaultTimeout = 10000;
  const credentialItems = ['credential-proofOfIdentity-v1.0']; // ProofOfIdentity
  const credentialItemIds = ['0xb5784440e237737fe62c5703fe5b0153cf9b28e6dd481a13790c885d10e8497e'];

  before('Set escrow contract address', async () => {
    escrowAddress = (await marketplaceTx.tx.contractInstance('CvcEscrow')).address;
  });

  before('Set escrow amount with price lookup', async () => {
    const [type, name, version] = marketplaceTx.ontology.parseExternalId(credentialItems[0]);
    escrowAmount = (await marketplaceTx.pricing.getPrice(idvAddress, type, name, version)).price.toNumber();
  });

  async function place(scopeRequestId) {
    const [requestorBefore, escrowBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress }
    ]);

    const placePromise = marketplaceTx.escrow.place(
      idrAddress,
      signTx,
      idvAddress,
      scopeRequestId,
      escrowAmount,
      credentialItems
    );

    // Place funds to escrow
    await marketplaceTx.tx.waitForMine(placePromise);

    const placeReturnValue = await placePromise;

    const [requestorAfter, escrowAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress }
    ]);

    // Assert CVC tokens are actually transferred.
    expect(requestorBefore.balance.minus(requestorAfter.balance)).to.bignumber.equal(escrowAmount);
    expect(escrowAfter.balance.minus(escrowBefore.balance)).to.bignumber.equal(escrowAmount);

    return placeReturnValue;
  }

  async function placeBatch(scopeRequestIds) {
    const batchAmount = escrowAmount * scopeRequestIds.length;
    const [requestorBefore, escrowBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress }
    ]);

    const placeBatchPromise = marketplaceTx.escrow.placeBatch(
      idrAddress,
      signTx,
      idvAddress,
      scopeRequestIds,
      batchAmount,
      credentialItems
    );

    // Place funds to escrow
    await marketplaceTx.tx.waitForMine(placeBatchPromise);

    const placeBatchReturnValue = await placeBatchPromise;

    const [requestorAfter, escrowAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress }
    ]);

    // Assert CVC tokens are actually transferred.
    expect(requestorBefore.balance.minus(requestorAfter.balance)).to.bignumber.equal(batchAmount);
    expect(escrowAfter.balance.minus(escrowBefore.balance)).to.bignumber.equal(batchAmount);

    return placeBatchReturnValue;
  }

  async function release(scopeRequestId) {
    const [requestorBefore, escrowBefore, platformBefore, idvBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    const releasePromise = marketplaceTx.escrow.release(
      platformAddress,
      signTx,
      idrAddress,
      idvAddress,
      scopeRequestId
    );

    // Release tokens.
    await marketplaceTx.tx.waitForMine(releasePromise);

    const releaseReturnValue = await releasePromise;

    const [requestorAfter, escrowAfter, platformAfter, idvAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    // Requestor balance is not changed.
    expect(requestorBefore.balance).to.bignumber.equal(requestorAfter.balance);
    // Escrow balance fully released.
    expect(escrowBefore.balance.minus(escrowAfter.balance)).to.bignumber.equal(escrowAmount);
    // Platform fee payed.
    const platformFee = new bn.BigNumber(escrowAmount).mul(defaultFeeRate).round();
    expect(platformAfter.balance.minus(platformBefore.balance)).to.bignumber.equals(platformFee);
    // IDV fee payed.
    const idvFee = new bn.BigNumber(escrowAmount).sub(platformFee);
    expect(idvAfter.balance.minus(idvBefore.balance)).to.bignumber.equals(idvFee);

    return releaseReturnValue;
  }

  async function releaseBatch(scopeRequestIdsToRelease, scopeRequestIdsToKeep) {
    const amountAfter = escrowAmount * scopeRequestIdsToRelease.length;
    const [requestorBefore, escrowBefore, platformBefore, idvBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    const releaseBatchPromise = marketplaceTx.escrow.releaseBatch(
      platformAddress,
      signTx,
      idrAddress,
      idvAddress,
      scopeRequestIdsToRelease,
      scopeRequestIdsToKeep
    );

    // Release tokens.
    await marketplaceTx.tx.waitForMine(releaseBatchPromise);

    const releaseBatchReturnValue = await releaseBatchPromise;

    const [requestorAfter, escrowAfter, platformAfter, idvAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    // Requestor balance is not changed.
    expect(requestorBefore.balance).to.bignumber.equal(requestorAfter.balance);
    // Escrow balance fully released.
    expect(escrowBefore.balance.minus(escrowAfter.balance)).to.bignumber.equal(amountAfter);
    // Platform fee payed.
    const platformFee = new bn.BigNumber(amountAfter).mul(defaultFeeRate).round();
    expect(platformAfter.balance.minus(platformBefore.balance)).to.bignumber.equals(platformFee);
    // IDV fee payed.
    const idvFee = new bn.BigNumber(amountAfter).sub(platformFee);
    expect(idvAfter.balance.minus(idvBefore.balance)).to.bignumber.equals(idvFee);

    return releaseBatchReturnValue;
  }

  async function refund(scopeRequestId) {
    const [requestorBefore, escrowBefore, platformBefore, idvBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    // Refund CVC from escrow
    await marketplaceTx.tx.waitForMine(
      marketplaceTx.escrow.refund(platformAddress, signTx, idrAddress, idvAddress, scopeRequestId)
    );

    const [requestorAfter, escrowAfter, platformAfter, idvAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    expect(requestorAfter.balance.minus(requestorBefore.balance)).to.bignumber.equal(
      escrowAmount,
      'IDR balance fully refunded'
    );
    expect(escrowBefore.balance.minus(escrowAfter.balance)).to.bignumber.equal(
      escrowAmount,
      'Escrow balance fully restored'
    );
    expect(platformBefore.balance).to.bignumber.equal(platformAfter.balance, 'Platform balance is not changed');
    expect(idvBefore.balance).to.bignumber.equal(idvAfter.balance, 'IDV balance is not changed');
  }

  async function refundBatch(scopeRequestIdsToRefund) {
    const batchAmount = escrowAmount * scopeRequestIdsToRefund.length;
    const [requestorBefore, escrowBefore, platformBefore, idvBefore] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    // Refund CVC from escrow
    await marketplaceTx.tx.waitForMine(
      marketplaceTx.escrow.refundBatch(platformAddress, signTx, idrAddress, idvAddress, scopeRequestIdsToRefund)
    );

    const [requestorAfter, escrowAfter, platformAfter, idvAfter] = await marketplaceTx.token.getBalances([
      { address: idrAddress },
      { address: escrowAddress },
      { address: platformAddress },
      { address: idvAddress }
    ]);

    expect(requestorAfter.balance.minus(requestorBefore.balance)).to.bignumber.equal(
      batchAmount,
      'IDR balance fully refunded'
    );
    expect(escrowBefore.balance.minus(escrowAfter.balance)).to.bignumber.equal(
      batchAmount,
      'Escrow balance fully restored'
    );
    expect(platformBefore.balance).to.bignumber.equal(platformAfter.balance, 'Platform balance is not changed');
    expect(idvBefore.balance).to.bignumber.equal(idvAfter.balance, 'IDV balance is not changed');
  }

  async function approve(owner, amount) {
    const escrowContract = await marketplaceTx.tx.contractInstance('CvcEscrow');
    return marketplaceTx.tx.waitForMine(
      marketplaceTx.token.approveWithReset(owner, signTx, escrowContract.address, amount)
    );
  }

  async function mineBlock() {
    // Dummy tx to make sure block is mined since place escrow tx.
    await marketplaceTx.tx.waitForMine(marketplaceTx.token.approve(idrAddress, signTx, idrAddress, 0));
  }

  async function setTimeoutThreshold(threshold) {
    await marketplaceTx.tx.waitForMine(marketplaceTx.escrow.setTimeoutThreshold(platformAddress, signTx, threshold));
  }

  describe('Place and release', () => {
    describe('Starting from an empty allowance', () => {
      // Generate new id
      const scopeRequestId = generateRandomScopeRequestId();

      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('place funds', async () => {
        const { returnValue } = await place(scopeRequestId);

        expect(returnValue.placementId).to.exist;
      });

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, escrowAmount, 1, credentialItemIds, 1, false);
      });

      it('release funds', async () => {
        const { returnValue } = await release(scopeRequestId);

        // just one entry to release, therefore no new placement
        expect(returnValue.placementId).to.not.exist;
      });

      it('verify released funds', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 2, credentialItemIds, 1, false);
      });
    });

    describe('Starting from an empty allowance and placing a batch of transactions (full release)', () => {
      // Generate new ids
      const scopeRequestIds = [generateRandomScopeRequestId(), generateRandomScopeRequestId()];

      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('placeBatch funds', async () => {
        const { returnValue } = await placeBatch(scopeRequestIds);

        expect(returnValue.placementId).to.exist;
      });

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        const batchAmount = escrowAmount * scopeRequestIds.length;
        assertVerify(verify, batchAmount, 1, credentialItemIds, 1, false);
        // ensure partial batch is not recognized
        const empty = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestIds[0]);
        assertVerify(empty, 0, 0, [], 0, false);
      });

      it('releaseBatch funds (full release)', async () => {
        const { returnValue } = await releaseBatch(scopeRequestIds, []);

        // no new placement
        expect(returnValue.placementId).to.not.exist;
      });

      it('verify released funds', async () => {
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, 0, 2, credentialItemIds, 1, false);
      });
    });

    describe('Starting from an empty allowance and placing a batch of transactions (partial release)', () => {
      // Generate new ids
      const scopeRequestIds = _.times(5, generateRandomScopeRequestId);
      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('placeBatch funds', () => placeBatch(scopeRequestIds));

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        const batchAmount = escrowAmount * scopeRequestIds.length;
        assertVerify(verify, batchAmount, 1, credentialItemIds, 1, false);
        // ensure partial batch is not recognized
        const empty = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestIds[0]);
        assertVerify(empty, 0, 0, [], 0, false);
      });

      it('releaseBatch funds (partial release)', async () => {
        let toRelease;
        let toKeep;
        // Initial batch will be marked as released upon fist partial release.
        let releasedBatch = scopeRequestIds;
        // Release all items one by one, checking the state on every iteration.
        for (let i = 0; i < scopeRequestIds.length; i++) {
          // Take first item to release.
          toRelease = [scopeRequestIds[i]];
          // Keep the rest of the batch in escrow.
          toKeep = _.slice(scopeRequestIds, i + 1);

          // Release & verify released items.
          const { returnValue } = await releaseBatch(toRelease, toKeep);
          const released = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, releasedBatch);
          assertVerify(released, 0, 2, credentialItemIds, 0, false);
          // Kept items will be released on next iteration, copy them to verify.
          releasedBatch = toKeep;

          // Partial release creates a new placement. Verify placement ID and kept items state.
          if (toKeep.length) {
            expect(returnValue.placementId).to.exist;
            const kept = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, toKeep);
            assertVerify(kept, escrowAmount * toKeep.length, 1, credentialItemIds, 0, false);
          }
        }

        // Verify the last item was released.
        const released = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, toRelease);
        assertVerify(released, 0, 2, credentialItemIds, 0, false);
      }).timeout(1000 * 60 * 5);
    });

    // Verifies that 'place' resets the allowance in the escrow contract
    // before making the placement
    describe('Starting from a non-empty allowance', () => {
      // Generate new id
      const scopeRequestId = generateRandomScopeRequestId();

      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      before('Set zero escrow allowance', () => approve(idrAddress, 0));
      before('Set minimal escrow allowance', () => approve(idrAddress, 1));

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('place funds', () => place(scopeRequestId));

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, escrowAmount, 1, credentialItemIds, 1, false);
      });

      it('release funds', () => release(scopeRequestId));

      it('verify released funds', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 2, credentialItemIds, 1, false);
      });
    });
  });

  describe('Place and refund', () => {
    describe('single placement refund', () => {
      const scopeRequestId = generateRandomScopeRequestId();

      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('place funds', () => place(scopeRequestId));

      it('verify placed', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, escrowAmount, 1, credentialItemIds, 1, false);
      });

      it('immediate refund before timeout should be rejected', () => expect(refund(scopeRequestId)).to.be.rejected);

      it('refund after timeout', async () => {
        // Change timeout threshold.
        await setTimeoutThreshold(1);
        await refund(scopeRequestId);
      });

      it('verify cancelled', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 3, credentialItemIds, 1, false);
      });
    });

    describe('batch placement refund', () => {
      const scopeRequestIds = _.times(5, generateRandomScopeRequestId);

      before('Ensure default timeout threshold', async () => {
        const timeout = await marketplaceTx.escrow.timeoutThreshold();
        if (timeout.toNumber() < 10) {
          await setTimeoutThreshold(defaultTimeout);
        }
      });

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('place funds', () => placeBatch(scopeRequestIds));

      it('verify batch placed', async () => {
        await mineBlock();
        const batchAmount = escrowAmount * scopeRequestIds.length;
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, batchAmount, 1, credentialItemIds, 1, false);
      });

      it('immediate refund before timeout should be rejected', () =>
        expect(refundBatch(scopeRequestIds)).to.be.rejected);

      it('refund batch after timeout', async () => {
        // Change timeout threshold.
        await setTimeoutThreshold(1);
        await refundBatch(scopeRequestIds);
      });

      it('verify batch cancelled', async () => {
        const verify = await marketplaceTx.escrow.verifyBatch(idrAddress, idvAddress, scopeRequestIds);
        assertVerify(verify, 0, 3, credentialItemIds, 1, false);
      });
    });

    after('Restore default timeout threshold', () => setTimeoutThreshold(defaultTimeout));
  });

  describe('Place after release', () => {
    // Generate new id
    const scopeRequestId = generateRandomScopeRequestId();

    it('place funds', () => place(scopeRequestId));

    it('release funds', () => release(scopeRequestId));

    it('deny repeated place after release', () =>
      expect(
        marketplaceTx.tx.waitForMine(
          marketplaceTx.escrow.place(idrAddress, signTx, idvAddress, scopeRequestId, escrowAmount, credentialItems)
        )
      ).to.be.rejected);

    after('Reset approve on CVC transfer', () => marketplaceTx.token.approve(idrAddress, signTx, escrowAddress, 0));
  });

  describe('Place after refund', () => {
    // Generate new id
    const scopeRequestId = generateRandomScopeRequestId();

    before('Set MIN timeout threshold', () => setTimeoutThreshold(1));

    it('place funds', () => place(scopeRequestId));

    it('refund after timeout', async () => {
      await mineBlock();
      await refund(scopeRequestId);
    });

    it('repeated place after refund', () => place(scopeRequestId));

    it('verify placed funds', async () => {
      const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
      assertVerify(verify, escrowAmount, 1, credentialItemIds, 0, false);
    });

    after('Restore default timeout threshold', () => setTimeoutThreshold(defaultTimeout));
  });

  describe('Preapprove, place and release', () => {
    const getAllowance = async owner => {
      const contracts = await marketplaceTx.tx.contractInstances('CvcToken', 'CvcEscrow');
      const spender = contracts.CvcEscrow.address;
      return contracts.CvcToken.allowance(owner, spender);
    };

    before('Ensure default timeout threshold', async () => {
      const timeout = await marketplaceTx.escrow.timeoutThreshold();
      if (timeout.toNumber() < 10) {
        await setTimeoutThreshold(defaultTimeout);
      }
    });

    after('Reduce escrow allowance to zero', () => approve(idrAddress, 0));

    describe('Starting from an empty allowance', () => {
      // Generate new id
      const scopeRequestId = generateRandomScopeRequestId();

      after('Release funds', () => release(scopeRequestId));

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('ensure empty allowance', async () => {
        const allowance = await getAllowance(idrAddress);
        expect(allowance.toNumber()).to.equal(0);
      });

      it('preapprove funds', () => approve(idrAddress, 1000));

      it('place funds', () => place(scopeRequestId));

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, escrowAmount, 1, credentialItemIds, 1, false);
      });
    });

    describe('Starting from a non-zero but small allowance', () => {
      // Generate new id
      const scopeRequestId = generateRandomScopeRequestId();

      before('Set minimal escrow allowance', () => approve(idrAddress, 1));
      after('Release funds', () => release(scopeRequestId));

      it('verify empty escrow', async () => {
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, 0, 0, [], 0, false);
      });

      it('ensure non-zero but insufficient allowance', async () => {
        const allowance = await getAllowance(idrAddress);
        expect(allowance.toNumber()).to.be.above(0);
        expect(allowance).to.bignumber.below(escrowAmount);
      });

      it('preapprove funds (with reset)', () => approve(idrAddress, 1000));

      it('place funds', () => place(scopeRequestId));

      it('verify placed funds', async () => {
        await mineBlock();
        const verify = await marketplaceTx.escrow.verify(idrAddress, idvAddress, scopeRequestId);
        assertVerify(verify, escrowAmount, 1, credentialItemIds, 1, false);
      });
    });
  });

  describe('Calculate placementId', () => {
    it('should calculate the same placement ID regardless of order', async () => {
      const scopeRequestIds = [generateRandomScopeRequestId(), generateRandomScopeRequestId()];

      const placementId1 = await marketplaceTx.escrow.calculatePlacementId(idrAddress, idvAddress, scopeRequestIds);
      const placementId2 = await marketplaceTx.escrow.calculatePlacementId(
        idrAddress,
        idvAddress,
        _.reverse(scopeRequestIds)
      );

      expect(placementId1).to.equal(placementId2);
    });

    it('should calculate the correct placement ID', async () => {
      const expectedPlacementId = '0xbe5da5b059fd4454e168dab8931d7b292f50d0409c1d163cdd732fbc63376f8f';
      const scopeRequestIds = [
        '0x852398ad1ce1f2852241121e65c1f8ada092f0ef055580c605049a20f852cca9',
        '0x7a4df8677c2406a0298715eb069d938849a50e984f7184abdac8d14530a7eccc'
      ];

      const placementId = await marketplaceTx.escrow.calculatePlacementId(idrAddress, idvAddress, scopeRequestIds);

      expect(placementId).to.equal(expectedPlacementId);
    });
  });
});

function assertVerify(
  verify,
  expectedAmount,
  expectedState,
  expectedCredentialItems,
  expectedBlockConfirmations,
  expectedCanRefund
) {
  expect(verify)
    .to.be.an('array')
    .with.lengthOf(5);
  const [amount, state, credentialItemIds, blockConfirmations, canRefund] = verify;

  expect(amount).to.bignumber.equal(expectedAmount, 'Invalid amount');
  expect(state.toNumber()).to.equal(expectedState, 'Invalid placement state');
  expect(credentialItemIds).to.deep.equal(expectedCredentialItems, 'Invalid credential item IDs');
  expect(blockConfirmations.toNumber()).to.be.at.least(expectedBlockConfirmations, 'Invalid number of confirmations');
  expect(canRefund).to.equal(expectedCanRefund, 'Invalid "canRefund" flag value');
}

function generateRandomScopeRequestId() {
  return `0x${crypto.randomBytes(32).toString('hex')}`;
}
