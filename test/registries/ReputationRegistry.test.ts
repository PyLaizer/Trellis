import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, keccak256, stringToBytes, zeroAddress } from "viem";

const AgentRole = {
  Client: 0,
  Freelancer: 1,
  Arbiter: 2,
} as const;

const TAG_MILESTONE = keccak256(stringToBytes("milestone"));
const TAG_ARBITER = keccak256(stringToBytes("arbiter"));
const REF_1 = keccak256(stringToBytes("project:1:milestone:0"));
const REF_2 = keccak256(stringToBytes("project:1:milestone:1"));
const REF_3 = keccak256(stringToBytes("project:2:milestone:0"));
const REF_4 = keccak256(stringToBytes("project:2:milestone:1"));
const COMMENT_HASH_1 = keccak256(stringToBytes("Great delivery on time"));
const COMMENT_HASH_2 = keccak256(stringToBytes("Solid work"));

describe("ReputationRegistry", () => {
  async function deployFixture() {
    const { viem } = await hre.network.connect();
    const [admin, reporter, freelancer, reviewer1, reviewer2, stranger] =
      await viem.getWalletClients();

    const identity = await viem.deployContract("IdentityRegistry");
    const reputation = await viem.deployContract("ReputationRegistry", [
      identity.address,
      admin.account.address,
    ]);

    const reporterRole = await reputation.read.REPORTER_ROLE();
    await reputation.write.grantRole([reporterRole, reporter.account.address], {
      account: admin.account,
    });

    // Register agentId = 1 (Freelancer)
    await identity.write.register(["ipfs://freelancer-1", AgentRole.Freelancer], {
      account: freelancer.account,
    });

    return {
      viem,
      identity,
      reputation,
      reporterRole,
      admin,
      reporter,
      freelancer,
      reviewer1,
      reviewer2,
      stranger,
    };
  }

  describe("Constructor", () => {
    it("reverts with ZeroAddress if identityRegistry or admin is address(0)", async () => {
      const { viem, identity, reputation, admin } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ReputationRegistry", [
          zeroAddress,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        reputation,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ReputationRegistry", [
          identity.address,
          zeroAddress,
        ]) as unknown as Promise<`0x${string}`>,
        reputation,
        "ZeroAddress",
      );
    });

    it("stores immutable identityRegistry, grants DEFAULT_ADMIN_ROLE, and sets MAX_SCORE = 100", async () => {
      const { identity, reputation, admin } = await deployFixture();

      assert.equal(await reputation.read.identityRegistry(), getAddress(identity.address));
      assert.equal(await reputation.read.MAX_SCORE(), 100);
      const defaultAdminRole = await reputation.read.DEFAULT_ADMIN_ROLE();
      assert.equal(
        await reputation.read.hasRole([defaultAdminRole, admin.account.address]),
        true,
      );
    });
  });

  describe("giveFeedback & Queries", () => {
    it("allows REPORTER_ROLE to submit feedback and updates summary, count, and lookup getters", async () => {
      const { viem, reputation, reporter, reviewer1, reviewer2 } = await deployFixture();

      // Empty state before any feedback
      assert.deepEqual(await reputation.read.getSummary([1n]), [0n, 0]);
      assert.equal(await reputation.read.getFeedbackCount([1n]), 0n);
      assert.deepEqual(await reputation.read.getAgentFeedbacks([1n, 0n, 10n]), []);

      const tx0 = reputation.write.giveFeedback(
        [
          1n,
          reviewer1.account.address,
          90,
          TAG_MILESTONE,
          REF_1,
          "ipfs://comment-1",
          COMMENT_HASH_1,
        ],
        { account: reporter.account },
      );
      await viem.assertions.emitWithArgs(tx0, reputation, "FeedbackSubmitted", [
        1n,
        0n,
        getAddress(reviewer1.account.address),
        90,
        TAG_MILESTONE,
        REF_1,
        "ipfs://comment-1",
        COMMENT_HASH_1,
      ]);

      // Boundary score 100 from same reviewer on a different referenceId
      await reputation.write.giveFeedback(
        [
          1n,
          reviewer1.account.address,
          100,
          TAG_ARBITER,
          REF_2,
          "ipfs://comment-2",
          COMMENT_HASH_2,
        ],
        { account: reporter.account },
      );

      // Boundary score 0 from a different reviewer on the same REF_1
      await reputation.write.giveFeedback(
        [1n, reviewer2.account.address, 0, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
        { account: reporter.account },
      );

      assert.equal(await reputation.read.getFeedbackCount([1n]), 3n);
      // (90 + 100 + 0) / 3 = 63 (integer division)
      assert.deepEqual(await reputation.read.getSummary([1n]), [3n, 63]);

      assert.equal(
        await reputation.read.hasSubmittedFeedback([1n, reviewer1.account.address, REF_1]),
        true,
      );
      assert.equal(
        await reputation.read.hasSubmittedFeedback([1n, reviewer2.account.address, REF_2]),
        false,
      );

      const fb0 = await reputation.read.getFeedback([1n, 0n]);
      assert.equal(fb0.agentId, 1n);
      assert.equal(fb0.reviewer, getAddress(reviewer1.account.address));
      assert.equal(fb0.score, 90);
      assert.equal(fb0.tag, TAG_MILESTONE);
      assert.equal(fb0.referenceId, REF_1);
      assert.equal(fb0.commentURI, "ipfs://comment-1");
      assert.equal(fb0.commentHash, COMMENT_HASH_1);
      assert.ok(fb0.timestamp > 0n);
      assert.equal(fb0.revoked, false);
    });

    it("paginates getAgentFeedbacks accurately across offset/limit edge cases", async () => {
      const { reputation, reporter, reviewer1 } = await deployFixture();

      const refs = [REF_1, REF_2, REF_3, REF_4];
      const scores = [60, 70, 80, 90];

      for (let i = 0; i < refs.length; i++) {
        await reputation.write.giveFeedback(
          [1n, reviewer1.account.address, scores[i], TAG_MILESTONE, refs[i], "", COMMENT_HASH_1],
          { account: reporter.account },
        );
      }

      // Full page (limit > total)
      const full = await reputation.read.getAgentFeedbacks([1n, 0n, 10n]);
      assert.equal(full.length, 4);
      assert.deepEqual(
        full.map((f) => f.score),
        [60, 70, 80, 90],
      );

      // Middle slice
      const mid = await reputation.read.getAgentFeedbacks([1n, 1n, 2n]);
      assert.equal(mid.length, 2);
      assert.deepEqual(
        mid.map((f) => f.score),
        [70, 80],
      );

      // Tail slice where offset + limit > total
      const tail = await reputation.read.getAgentFeedbacks([1n, 2n, 5n]);
      assert.equal(tail.length, 2);
      assert.deepEqual(
        tail.map((f) => f.score),
        [80, 90],
      );

      // Edge cases: offset == total, offset > total, limit == 0
      assert.deepEqual(await reputation.read.getAgentFeedbacks([1n, 4n, 10n]), []);
      assert.deepEqual(await reputation.read.getAgentFeedbacks([1n, 99n, 10n]), []);
      assert.deepEqual(await reputation.read.getAgentFeedbacks([1n, 0n, 0n]), []);
    });

    it("reverts giveFeedback for unauthorized caller", async () => {
      const { viem, reputation, reporterRole, stranger, reviewer1 } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.giveFeedback(
          [1n, reviewer1.account.address, 80, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
          { account: stranger.account },
        ),
        reputation,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), reporterRole],
      );
    });

    it("reverts giveFeedback for unknown agent, zero reviewer, score > 100, and duplicate feedback", async () => {
      const { viem, reputation, reporter, reviewer1 } = await deployFixture();

      // Unknown agent
      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.giveFeedback(
          [999n, reviewer1.account.address, 80, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
          { account: reporter.account },
        ),
        reputation,
        "UnknownAgent",
        [999n],
      );

      // Zero reviewer
      await viem.assertions.revertWithCustomError(
        reputation.write.giveFeedback(
          [1n, zeroAddress, 80, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
          { account: reporter.account },
        ),
        reputation,
        "ZeroAddress",
      );

      // Score > 100
      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.giveFeedback(
          [1n, reviewer1.account.address, 101, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
          { account: reporter.account },
        ),
        reputation,
        "ScoreOutOfRange",
        [101],
      );

      // Duplicate (agentId, reviewer, referenceId)
      await reputation.write.giveFeedback(
        [1n, reviewer1.account.address, 85, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
        { account: reporter.account },
      );

      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.giveFeedback(
          [1n, reviewer1.account.address, 95, TAG_MILESTONE, REF_1, "", COMMENT_HASH_2],
          { account: reporter.account },
        ),
        reputation,
        "DuplicateFeedback",
        [1n, getAddress(reviewer1.account.address), REF_1],
      );
    });

    it("reverts getFeedback when feedbackIndex is out of bounds", async () => {
      const { viem, reputation } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.read.getFeedback([1n, 0n]),
        reputation,
        "FeedbackNotFound",
        [1n, 0n],
      );
    });
  });

  describe("revokeFeedback", () => {
    it("allows admin to revoke feedback and updates running count and average accurately", async () => {
      const { viem, reputation, admin, reporter, reviewer1 } = await deployFixture();

      await reputation.write.giveFeedback(
        [1n, reviewer1.account.address, 40, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
        { account: reporter.account },
      );
      await reputation.write.giveFeedback(
        [1n, reviewer1.account.address, 100, TAG_MILESTONE, REF_2, "", COMMENT_HASH_2],
        { account: reporter.account },
      );

      assert.deepEqual(await reputation.read.getSummary([1n]), [2n, 70]);

      const txRevoke0 = reputation.write.revokeFeedback([1n, 0n], { account: admin.account });
      await viem.assertions.emitWithArgs(txRevoke0, reputation, "FeedbackRevoked", [1n, 0n]);

      assert.deepEqual(await reputation.read.getSummary([1n]), [1n, 100]);
      // Total feedback list still includes revoked entry
      assert.equal(await reputation.read.getFeedbackCount([1n]), 2n);
      const fb0 = await reputation.read.getFeedback([1n, 0n]);
      assert.equal(fb0.revoked, true);

      // Revoking last active feedback resets count and average to 0
      await reputation.write.revokeFeedback([1n, 1n], { account: admin.account });
      assert.deepEqual(await reputation.read.getSummary([1n]), [0n, 0]);
    });

    it("reverts on double-revoke, out-of-bounds index, and non-admin caller", async () => {
      const { viem, reputation, admin, reporter, reviewer1, stranger } = await deployFixture();

      await reputation.write.giveFeedback(
        [1n, reviewer1.account.address, 80, TAG_MILESTONE, REF_1, "", COMMENT_HASH_1],
        { account: reporter.account },
      );

      // Non-admin cannot revoke
      const defaultAdminRole = await reputation.read.DEFAULT_ADMIN_ROLE();
      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.revokeFeedback([1n, 0n], { account: stranger.account }),
        reputation,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), defaultAdminRole],
      );

      // Out-of-bounds index
      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.revokeFeedback([1n, 1n], { account: admin.account }),
        reputation,
        "FeedbackNotFound",
        [1n, 1n],
      );

      // Double-revoke
      await reputation.write.revokeFeedback([1n, 0n], { account: admin.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        reputation.write.revokeFeedback([1n, 0n], { account: admin.account }),
        reputation,
        "FeedbackAlreadyRevoked",
        [1n, 0n],
      );
    });
  });
});
