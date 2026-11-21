import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, keccak256, stringToBytes, stringToHex, zeroAddress, zeroHash } from "viem";

const AgentRole = {
  Client: 0,
  Freelancer: 1,
  Arbiter: 2,
} as const;

const ValidationStatus = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
} as const;

const EVIDENCE_HASH_1 = keccak256(stringToBytes("dispute-evidence-bundle-1"));
const EVIDENCE_HASH_2 = keccak256(stringToBytes("dispute-evidence-bundle-2"));
const REASONING_HASH_1 = keccak256(stringToBytes("arbiter-reasoning-report-1"));
const REASONING_HASH_2 = keccak256(stringToBytes("arbiter-reasoning-report-2"));
const UNKNOWN_REQUEST_ID = keccak256(stringToBytes("non-existent-request"));

describe("ValidationRegistry", () => {
  async function deployFixture() {
    const { viem } = await hre.network.connect();
    const [admin, requester, arbiterOwner, operator, clientWallet, stranger] =
      await viem.getWalletClients();

    const identity = await viem.deployContract("IdentityRegistry");
    const validation = await viem.deployContract("ValidationRegistry", [
      identity.address,
      admin.account.address,
    ]);

    const requesterRole = await validation.read.REQUESTER_ROLE();
    await validation.write.grantRole([requesterRole, requester.account.address], {
      account: admin.account,
    });

    // agentId = 1: active Arbiter
    await identity.write.register(["ipfs://arbiter-1", AgentRole.Arbiter], {
      account: arbiterOwner.account,
    });
    // agentId = 2: active Arbiter (second arbiter)
    await identity.write.register(["ipfs://arbiter-2", AgentRole.Arbiter], {
      account: arbiterOwner.account,
    });
    // agentId = 3: Client (non-arbiter)
    await identity.write.register(["ipfs://client-3", AgentRole.Client], {
      account: clientWallet.account,
    });

    return {
      viem,
      identity,
      validation,
      requesterRole,
      admin,
      requester,
      arbiterOwner,
      operator,
      clientWallet,
      stranger,
    };
  }

  describe("Constructor", () => {
    it("reverts with ZeroAddress if identityRegistry or admin is address(0)", async () => {
      const { viem, identity, validation, admin } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ValidationRegistry", [
          zeroAddress,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        validation,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ValidationRegistry", [
          identity.address,
          zeroAddress,
        ]) as unknown as Promise<`0x${string}`>,
        validation,
        "ZeroAddress",
      );
    });

    it("stores immutable identityRegistry and grants DEFAULT_ADMIN_ROLE", async () => {
      const { identity, validation, admin } = await deployFixture();

      assert.equal(await validation.read.identityRegistry(), getAddress(identity.address));
      const defaultAdminRole = await validation.read.DEFAULT_ADMIN_ROLE();
      assert.equal(
        await validation.read.hasRole([defaultAdminRole, admin.account.address]),
        true,
      );
    });
  });

  describe("requestValidation", () => {
    it("allows REQUESTER_ROLE to open a validation request for an active arbiter", async () => {
      const { viem, validation, requester } = await deployFixture();

      const { result: expectedRequestId } = await validation.simulate.requestValidation(
        [1n, 100n, EVIDENCE_HASH_1, "ipfs://evidence-100"],
        { account: requester.account },
      );

      const tx = validation.write.requestValidation(
        [1n, 100n, EVIDENCE_HASH_1, "ipfs://evidence-100"],
        { account: requester.account },
      );
      await viem.assertions.emitWithArgs(tx, validation, "ValidationRequested", [
        expectedRequestId,
        1n,
        100n,
        EVIDENCE_HASH_1,
        "ipfs://evidence-100",
      ]);

      const record = await validation.read.getValidation([expectedRequestId]);
      assert.equal(record.requestId, expectedRequestId);
      assert.equal(record.validatorAgentId, 1n);
      assert.equal(record.subjectId, 100n);
      assert.equal(record.requester, getAddress(requester.account.address));
      assert.equal(record.evidenceHash, EVIDENCE_HASH_1);
      assert.equal(record.evidenceURI, "ipfs://evidence-100");
      assert.equal(record.status, ValidationStatus.Pending);
      assert.equal(record.responseCode, 0);
      assert.equal(record.reasoningHash, zeroHash);
      assert.equal(record.proofURI, "");
      assert.equal(record.proof, "0x");
      assert.ok(record.requestedAt > 0n);
      assert.equal(record.respondedAt, 0n);
    });

    it("reverts with InvalidValidator for inactive arbiter, non-arbiter, or non-existent agent", async () => {
      const { viem, identity, validation, requester, arbiterOwner } = await deployFixture();

      // Non-arbiter (Client agentId = 3)
      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.requestValidation([3n, 100n, EVIDENCE_HASH_1, "ipfs://ev"], {
          account: requester.account,
        }),
        validation,
        "InvalidValidator",
        [3n],
      );

      // Non-existent agentId = 99
      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.requestValidation([99n, 100n, EVIDENCE_HASH_1, "ipfs://ev"], {
          account: requester.account,
        }),
        validation,
        "InvalidValidator",
        [99n],
      );

      // Deactivated arbiter (agentId = 1)
      await identity.write.setActive([1n, false], { account: arbiterOwner.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.requestValidation([1n, 100n, EVIDENCE_HASH_1, "ipfs://ev"], {
          account: requester.account,
        }),
        validation,
        "InvalidValidator",
        [1n],
      );
    });

    it("reverts for non-requester caller", async () => {
      const { viem, validation, requesterRole, stranger } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.requestValidation([1n, 100n, EVIDENCE_HASH_1, "ipfs://ev"], {
          account: stranger.account,
        }),
        validation,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), requesterRole],
      );
    });
  });

  describe("submitValidation", () => {
    it("allows arbiter NFT owner to submit Approved verdict (responseCode > 0)", async () => {
      const { viem, validation, requester, arbiterOwner } = await deployFixture();

      const { result: reqId } = await validation.simulate.requestValidation(
        [1n, 10n, EVIDENCE_HASH_1, "ipfs://ev-10"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 10n, EVIDENCE_HASH_1, "ipfs://ev-10"], {
        account: requester.account,
      });

      const proofBytes = stringToHex("tee-attestation-v1");
      const tx = validation.write.submitValidation(
        [reqId, 1, REASONING_HASH_1, "ipfs://proof-10", proofBytes],
        { account: arbiterOwner.account },
      );
      await viem.assertions.emitWithArgs(tx, validation, "ValidationSubmitted", [
        reqId,
        1n,
        10n,
        1,
        REASONING_HASH_1,
        "ipfs://proof-10",
      ]);

      const record = await validation.read.getValidation([reqId]);
      assert.equal(record.status, ValidationStatus.Approved);
      assert.equal(record.responseCode, 1);
      assert.equal(record.reasoningHash, REASONING_HASH_1);
      assert.equal(record.proofURI, "ipfs://proof-10");
      assert.equal(record.proof, proofBytes);
      assert.ok(record.respondedAt >= record.requestedAt);
    });

    it("allows approved operator (approve and setApprovalForAll) to submit validation", async () => {
      const { identity, validation, requester, arbiterOwner, operator } = await deployFixture();

      // Request 1 via single-token approval
      const { result: reqId1 } = await validation.simulate.requestValidation(
        [1n, 20n, EVIDENCE_HASH_1, "ipfs://ev-20"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 20n, EVIDENCE_HASH_1, "ipfs://ev-20"], {
        account: requester.account,
      });

      await identity.write.approve([operator.account.address, 1n], {
        account: arbiterOwner.account,
      });
      await validation.write.submitValidation(
        [reqId1, 2, REASONING_HASH_1, "ipfs://proof-20", "0x"],
        { account: operator.account },
      );

      const rec1 = await validation.read.getValidation([reqId1]);
      assert.equal(rec1.status, ValidationStatus.Approved);
      assert.equal(rec1.responseCode, 2);

      // Request 2 via setApprovalForAll on arbiter 2
      const { result: reqId2 } = await validation.simulate.requestValidation(
        [2n, 21n, EVIDENCE_HASH_2, "ipfs://ev-21"],
        { account: requester.account },
      );
      await validation.write.requestValidation([2n, 21n, EVIDENCE_HASH_2, "ipfs://ev-21"], {
        account: requester.account,
      });

      await identity.write.setApprovalForAll([operator.account.address, true], {
        account: arbiterOwner.account,
      });
      await validation.write.submitValidation(
        [reqId2, 1, REASONING_HASH_2, "ipfs://proof-21", "0x"],
        { account: operator.account },
      );

      const rec2 = await validation.read.getValidation([reqId2]);
      assert.equal(rec2.status, ValidationStatus.Approved);
    });

    it("allows REQUESTER_ROLE to submit validation and sets Rejected when responseCode == 0", async () => {
      const { validation, requester } = await deployFixture();

      const { result: reqId } = await validation.simulate.requestValidation(
        [1n, 30n, EVIDENCE_HASH_1, "ipfs://ev-30"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 30n, EVIDENCE_HASH_1, "ipfs://ev-30"], {
        account: requester.account,
      });

      await validation.write.submitValidation(
        [reqId, 0, REASONING_HASH_1, "ipfs://proof-reject", "0x"],
        { account: requester.account },
      );

      const rec = await validation.read.getValidation([reqId]);
      assert.equal(rec.status, ValidationStatus.Rejected);
      assert.equal(rec.responseCode, 0);
      assert.equal(rec.reasoningHash, REASONING_HASH_1);
      assert.equal(rec.proofURI, "ipfs://proof-reject");
    });

    it("reverts with UnauthorizedValidator for unauthorized wallet", async () => {
      const { viem, validation, requester, stranger } = await deployFixture();

      const { result: reqId } = await validation.simulate.requestValidation(
        [1n, 40n, EVIDENCE_HASH_1, "ipfs://ev-40"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 40n, EVIDENCE_HASH_1, "ipfs://ev-40"], {
        account: requester.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.submitValidation(
          [reqId, 1, REASONING_HASH_1, "ipfs://spoof", "0x"],
          { account: stranger.account },
        ),
        validation,
        "UnauthorizedValidator",
        [getAddress(stranger.account.address), 1n],
      );
    });

    it("reverts with ValidationAlreadySubmitted on double-submit and ValidationNotFound on unknown requestId", async () => {
      const { viem, validation, requester, arbiterOwner } = await deployFixture();

      // Unknown requestId on submitValidation and getValidation
      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.submitValidation(
          [UNKNOWN_REQUEST_ID, 1, REASONING_HASH_1, "ipfs://p", "0x"],
          { account: arbiterOwner.account },
        ),
        validation,
        "ValidationNotFound",
        [UNKNOWN_REQUEST_ID],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.read.getValidation([UNKNOWN_REQUEST_ID]),
        validation,
        "ValidationNotFound",
        [UNKNOWN_REQUEST_ID],
      );

      // Double-submit after Approved
      const { result: reqId } = await validation.simulate.requestValidation(
        [1n, 50n, EVIDENCE_HASH_1, "ipfs://ev-50"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 50n, EVIDENCE_HASH_1, "ipfs://ev-50"], {
        account: requester.account,
      });
      await validation.write.submitValidation([reqId, 1, REASONING_HASH_1, "ipfs://p", "0x"], {
        account: arbiterOwner.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.submitValidation([reqId, 2, REASONING_HASH_2, "ipfs://p2", "0x"], {
          account: arbiterOwner.account,
        }),
        validation,
        "ValidationAlreadySubmitted",
        [reqId],
      );

      // Double-submit after Rejected
      const { result: reqIdReject } = await validation.simulate.requestValidation(
        [1n, 51n, EVIDENCE_HASH_2, "ipfs://ev-51"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 51n, EVIDENCE_HASH_2, "ipfs://ev-51"], {
        account: requester.account,
      });
      await validation.write.submitValidation(
        [reqIdReject, 0, REASONING_HASH_1, "ipfs://rej", "0x"],
        { account: arbiterOwner.account },
      );

      await viem.assertions.revertWithCustomErrorWithArgs(
        validation.write.submitValidation(
          [reqIdReject, 1, REASONING_HASH_2, "ipfs://retry", "0x"],
          { account: requester.account },
        ),
        validation,
        "ValidationAlreadySubmitted",
        [reqIdReject],
      );
    });
  });

  describe("Indexing Helpers", () => {
    it("returns expected IDs from getSubjectValidations and getValidatorRequests", async () => {
      const { validation, requester } = await deployFixture();

      // Empty lookups initially
      assert.deepEqual(await validation.read.getSubjectValidations([77n]), []);
      assert.deepEqual(await validation.read.getValidatorRequests([1n]), []);
      assert.deepEqual(await validation.read.getValidatorRequests([2n]), []);

      // Subject 77 assigned to arbiter 1, then arbiter 2, then arbiter 1 again
      const { result: r1 } = await validation.simulate.requestValidation(
        [1n, 77n, EVIDENCE_HASH_1, "ipfs://ev-1"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 77n, EVIDENCE_HASH_1, "ipfs://ev-1"], {
        account: requester.account,
      });

      const { result: r2 } = await validation.simulate.requestValidation(
        [2n, 77n, EVIDENCE_HASH_2, "ipfs://ev-2"],
        { account: requester.account },
      );
      await validation.write.requestValidation([2n, 77n, EVIDENCE_HASH_2, "ipfs://ev-2"], {
        account: requester.account,
      });

      const { result: r3 } = await validation.simulate.requestValidation(
        [1n, 88n, EVIDENCE_HASH_1, "ipfs://ev-3"],
        { account: requester.account },
      );
      await validation.write.requestValidation([1n, 88n, EVIDENCE_HASH_1, "ipfs://ev-3"], {
        account: requester.account,
      });

      // Distinct request IDs
      assert.notEqual(r1, r2);
      assert.notEqual(r1, r3);
      assert.notEqual(r2, r3);

      assert.deepEqual(await validation.read.getSubjectValidations([77n]), [r1, r2]);
      assert.deepEqual(await validation.read.getSubjectValidations([88n]), [r3]);
      assert.deepEqual(await validation.read.getValidatorRequests([1n]), [r1, r3]);
      assert.deepEqual(await validation.read.getValidatorRequests([2n]), [r2]);
    });
  });
});
