import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, keccak256, stringToBytes, stringToHex, zeroAddress, zeroHash } from "viem";

const AgentRole = {
  Client: 0,
  Freelancer: 1,
  Arbiter: 2,
} as const;

const ProjectStatus = {
  Open: 0,
  Active: 1,
  Completed: 2,
  Cancelled: 3,
} as const;

const MilestoneStatus = {
  Pending: 0,
  Submitted: 1,
  Approved: 2,
  Disputed: 3,
  ResolvedRelease: 4,
  ResolvedRefund: 5,
} as const;

const ValidationStatus = {
  Pending: 0,
  Approved: 1,
  Rejected: 2,
} as const;

const DisputeStatus = {
  Open: 0,
  ResolvedRelease: 1,
  ResolvedRefund: 2,
} as const;

const Ruling = {
  None: 0,
  ReleaseToFreelancer: 1,
  RefundToClient: 2,
} as const;

const ONE_TUSD = 1_000_000n; // 6 decimals
const CLIENT_REVIEW_PERIOD = 3n * 24n * 60n * 60n; // 3 days
const VOTING_PERIOD = 2n * 24n * 60n * 60n; // 2 days

const DELIVERABLE_HASH = keccak256(stringToBytes("deliverable-v1"));
const EVIDENCE_HASH = keccak256(stringToBytes("dispute-evidence-bundle-1"));
const REASONING_HASH_1 = keccak256(stringToBytes("arbiter-reasoning-1"));
const REASONING_HASH_2 = keccak256(stringToBytes("arbiter-reasoning-2"));
const REASONING_HASH_3 = keccak256(stringToBytes("arbiter-reasoning-3"));
const PROOF_BYTES_1 = stringToHex("zkml-attestation-arbiter-1");
const PROOF_BYTES_2 = stringToHex("tee-quote-arbiter-2");
const PROOF_BYTES_3 = stringToHex("zkml-attestation-arbiter-3");

describe("DisputeResolution", () => {
  async function advanceTime(
    provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
    seconds: number | bigint,
  ) {
    await provider.request({ method: "evm_increaseTime", params: [Number(seconds)] });
    await provider.request({ method: "evm_mine", params: [] });
  }

  async function deployFixture() {
    const { viem, provider } = await hre.network.connect();
    const publicClient = await viem.getPublicClient();
    const [
      admin,
      treasury,
      client,
      freelancer,
      arbiter1,
      arbiter2,
      arbiter3,
      arbiter4,
      operator,
      stranger,
    ] = await viem.getWalletClients();

    const token = await viem.deployContract("MockTUSD8");
    const identity = await viem.deployContract("IdentityRegistry");
    const reputation = await viem.deployContract("ReputationRegistry", [
      identity.address,
      admin.account.address,
    ]);
    const validation = await viem.deployContract("ValidationRegistry", [
      identity.address,
      admin.account.address,
    ]);
    const escrow = await viem.deployContract("MilestoneEscrow", [
      token.address,
      treasury.account.address,
      100, // 1% fee
      admin.account.address,
    ]);
    const projectManager = await viem.deployContract("ProjectManager", [
      identity.address,
      reputation.address,
      escrow.address,
      admin.account.address,
    ]);
    const disputeResolution = await viem.deployContract("DisputeResolution", [
      identity.address,
      reputation.address,
      validation.address,
      projectManager.address,
      admin.account.address,
      CLIENT_REVIEW_PERIOD,
      VOTING_PERIOD,
    ]);

    // Wire protocol roles
    const pmRole = await escrow.read.PROJECT_MANAGER_ROLE();
    const pmDisputeRole = await projectManager.read.DISPUTE_RESOLVER_ROLE();
    const reporterRole = await reputation.read.REPORTER_ROLE();
    const requesterRole = await validation.read.REQUESTER_ROLE();

    await escrow.write.grantRole([pmRole, projectManager.address], { account: admin.account });
    await projectManager.write.grantRole([pmDisputeRole, disputeResolution.address], {
      account: admin.account,
    });
    await reputation.write.grantRole([reporterRole, projectManager.address], {
      account: admin.account,
    });
    await reputation.write.grantRole([reporterRole, disputeResolution.address], {
      account: admin.account,
    });
    await validation.write.grantRole([requesterRole, disputeResolution.address], {
      account: admin.account,
    });

    // Register ERC-8004 identities:
    // 1: client (Client)
    // 2: freelancer (Freelancer)
    // 3..6: arbiter1..arbiter4 (Arbiter)
    await identity.write.register(["ipfs://client-1", AgentRole.Client], {
      account: client.account,
    });
    await identity.write.register(["ipfs://freelancer-1", AgentRole.Freelancer], {
      account: freelancer.account,
    });
    await identity.write.register(["ipfs://arbiter-1", AgentRole.Arbiter], {
      account: arbiter1.account,
    });
    await identity.write.register(["ipfs://arbiter-2", AgentRole.Arbiter], {
      account: arbiter2.account,
    });
    await identity.write.register(["ipfs://arbiter-3", AgentRole.Arbiter], {
      account: arbiter3.account,
    });
    await identity.write.register(["ipfs://arbiter-4", AgentRole.Arbiter], {
      account: arbiter4.account,
    });

    const clientAgentId = 1n;
    const freelancerAgentId = 2n;
    const arbiterIds = [3n, 4n, 5n, 6n] as const;
    const arbiterWalletById = new Map([
      [3n, arbiter1],
      [4n, arbiter2],
      [5n, arbiter3],
      [6n, arbiter4],
    ]);

    // Mint tUSD8 and approve MilestoneEscrow for client
    const budgetSupply = 20_000n * ONE_TUSD;
    await token.write.mint([client.account.address, budgetSupply]);
    await token.write.approve([escrow.address, budgetSupply], { account: client.account });

    async function createActiveProject(
      amounts: bigint[] = [1_000n * ONE_TUSD],
      dueDateOffsets: bigint[] = [7n * 24n * 60n * 60n],
    ) {
      const latestBlock = await publicClient.getBlock();
      const dueDates = dueDateOffsets.map((offset) => latestBlock.timestamp + offset);
      const uris = amounts.map((_, i) => `ipfs://milestone-${i}-spec`);

      await projectManager.write.createProject(
        [clientAgentId, 0n, "ipfs://project-brief", amounts, dueDates, uris],
        { account: client.account },
      );
      const projectId = await projectManager.read.totalProjects();

      await projectManager.write.acceptProject([projectId, freelancerAgentId], {
        account: freelancer.account,
      });

      return { projectId, dueDates };
    }

    return {
      viem,
      provider,
      publicClient,
      token,
      identity,
      reputation,
      validation,
      escrow,
      projectManager,
      disputeResolution,
      admin,
      treasury,
      client,
      freelancer,
      arbiter1,
      arbiter2,
      arbiter3,
      arbiter4,
      operator,
      stranger,
      clientAgentId,
      freelancerAgentId,
      arbiterIds,
      arbiterWalletById,
      createActiveProject,
    };
  }

  describe("Constructor & Admin Config", () => {
    it("sets immutables, constants, initial timing config, DEFAULT_ADMIN_ROLE, and starts with 0 disputes", async () => {
      const {
        identity,
        reputation,
        validation,
        projectManager,
        disputeResolution,
        admin,
      } = await deployFixture();

      assert.equal(await disputeResolution.read.identityRegistry(), getAddress(identity.address));
      assert.equal(
        await disputeResolution.read.reputationRegistry(),
        getAddress(reputation.address),
      );
      assert.equal(
        await disputeResolution.read.validationRegistry(),
        getAddress(validation.address),
      );
      assert.equal(
        await disputeResolution.read.projectManager(),
        getAddress(projectManager.address),
      );

      assert.equal(await disputeResolution.read.PANEL_SIZE(), 3);
      assert.equal(await disputeResolution.read.QUORUM(), 2);
      assert.equal(await disputeResolution.read.MAJORITY_REPUTATION_SCORE(), 100);
      assert.equal(await disputeResolution.read.DISSENT_REPUTATION_SCORE(), 25);
      assert.equal(
        await disputeResolution.read.TAG_ARBITER(),
        keccak256(stringToBytes("arbiter")),
      );
      assert.equal(await disputeResolution.read.VOTE_RELEASE(), 1);
      assert.equal(await disputeResolution.read.VOTE_REFUND(), 2);

      assert.equal(await disputeResolution.read.clientReviewPeriod(), CLIENT_REVIEW_PERIOD);
      assert.equal(await disputeResolution.read.votingPeriod(), VOTING_PERIOD);
      assert.equal(await disputeResolution.read.totalDisputes(), 0n);

      const adminRole = await disputeResolution.read.DEFAULT_ADMIN_ROLE();
      assert.equal(await disputeResolution.read.hasRole([adminRole, admin.account.address]), true);
    });

    it("reverts with ZeroAddress for any zero address arg and InvalidVotingPeriod when votingPeriod == 0", async () => {
      const {
        viem,
        identity,
        reputation,
        validation,
        projectManager,
        disputeResolution,
        admin,
      } = await deployFixture();

      const zeroArgCases: [
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
        `0x${string}`,
      ][] = [
        [zeroAddress, reputation.address, validation.address, projectManager.address, admin.account.address],
        [identity.address, zeroAddress, validation.address, projectManager.address, admin.account.address],
        [identity.address, reputation.address, zeroAddress, projectManager.address, admin.account.address],
        [identity.address, reputation.address, validation.address, zeroAddress, admin.account.address],
        [identity.address, reputation.address, validation.address, projectManager.address, zeroAddress],
      ];

      for (const addrs of zeroArgCases) {
        await viem.assertions.revertWithCustomError(
          viem.deployContract("DisputeResolution", [
            ...addrs,
            CLIENT_REVIEW_PERIOD,
            VOTING_PERIOD,
          ]) as unknown as Promise<`0x${string}`>,
          disputeResolution,
          "ZeroAddress",
        );
      }

      await viem.assertions.revertWithCustomError(
        viem.deployContract("DisputeResolution", [
          identity.address,
          reputation.address,
          validation.address,
          projectManager.address,
          admin.account.address,
          CLIENT_REVIEW_PERIOD,
          0n,
        ]) as unknown as Promise<`0x${string}`>,
        disputeResolution,
        "InvalidVotingPeriod",
      );
    });

    it("allows admin to update timing config (including reviewPeriod = 0) and rejects non-admin or zero votingPeriod", async () => {
      const { viem, disputeResolution, admin, stranger } = await deployFixture();

      const adminRole = await disputeResolution.read.DEFAULT_ADMIN_ROLE();

      // Non-admin reverts
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.setTimingConfig([0n, 3600n], { account: stranger.account }),
        disputeResolution,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), adminRole],
      );

      // Zero votingPeriod reverts
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.setTimingConfig([0n, 0n], { account: admin.account }),
        disputeResolution,
        "InvalidVotingPeriod",
      );

      // Admin updates config with reviewPeriod = 0
      const updateTx = disputeResolution.write.setTimingConfig([0n, 3600n], {
        account: admin.account,
      });
      await viem.assertions.emitWithArgs(updateTx, disputeResolution, "TimingConfigUpdated", [
        0n,
        3600n,
      ]);

      assert.equal(await disputeResolution.read.clientReviewPeriod(), 0n);
      assert.equal(await disputeResolution.read.votingPeriod(), 3600n);
    });
  });

  describe("Dispute Opening (openDispute)", () => {
    it("allows client to open dispute on Submitted milestone, assigns 3 distinct arbiters, marks Disputed, and creates 3 Pending ValidationRegistry requests", async () => {
      const {
        viem,
        validation,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        arbiterIds,
        createActiveProject,
      } = await deployFixture();

      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );

      const openTx = disputeResolution.write.openDispute(
        [projectId, 0n, EVIDENCE_HASH, "ipfs://evidence-bundle-0"],
        { account: client.account },
      );
      await viem.assertions.emit(openTx, disputeResolution, "DisputeOpened");

      assert.equal(await disputeResolution.read.totalDisputes(), 1n);
      assert.equal(await disputeResolution.read.getMilestoneDisputeId([projectId, 0n]), 1n);

      // ProjectManager milestone is marked Disputed
      const milestone = await projectManager.read.getMilestone([projectId, 0n]);
      assert.equal(milestone.status, MilestoneStatus.Disputed);

      // Dispute record fields are populated accurately
      const dispute = await disputeResolution.read.getDispute([1n]);
      assert.equal(dispute.disputeId, 1n);
      assert.equal(dispute.projectId, projectId);
      assert.equal(dispute.milestoneIndex, 0n);
      assert.equal(dispute.openedBy, getAddress(client.account.address));
      assert.equal(dispute.status, DisputeStatus.Open);
      assert.equal(dispute.releaseVotes, 0);
      assert.equal(dispute.refundVotes, 0);
      assert.equal(dispute.votingDeadline, dispute.createdAt + VOTING_PERIOD);
      assert.equal(dispute.evidenceHash, EVIDENCE_HASH);
      assert.equal(dispute.evidenceURI, "ipfs://evidence-bundle-0");

      // 3 distinct active arbiters selected
      assert.equal(dispute.arbiters.length, 3);
      const uniqueArbiters = new Set(dispute.arbiters);
      assert.equal(uniqueArbiters.size, 3);
      for (const arbiterId of dispute.arbiters) {
        assert.ok(arbiterIds.includes(arbiterId as 3n | 4n | 5n | 6n));
      }

      // 3 Pending validation requests created in ValidationRegistry
      const subjectReqs = await validation.read.getSubjectValidations([1n]);
      assert.equal(subjectReqs.length, 3);
      for (let i = 0; i < 3; i++) {
        const reqId = dispute.validationRequestIds[i];
        assert.equal(subjectReqs[i], reqId);

        const req = await validation.read.getValidation([reqId]);
        assert.equal(req.requestId, reqId);
        assert.equal(req.validatorAgentId, dispute.arbiters[i]);
        assert.equal(req.subjectId, 1n);
        assert.equal(req.requester, getAddress(disputeResolution.address));
        assert.equal(req.evidenceHash, EVIDENCE_HASH);
        assert.equal(req.evidenceURI, "ipfs://evidence-bundle-0");
        assert.equal(req.status, ValidationStatus.Pending);
      }
    });

    it("allows client to open dispute on overdue Pending milestone (freelancer ghosted past dueDate), but reverts before dueDate", async () => {
      const {
        viem,
        provider,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        createActiveProject,
      } = await deployFixture();

      const dueOffset = 1000n;
      const { projectId } = await createActiveProject([1_000n * ONE_TUSD], [dueOffset]);

      // Before dueDate -> reverts MilestoneNotDisputable
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute(
          [projectId, 0n, EVIDENCE_HASH, "ipfs://ghosted-evidence"],
          { account: client.account },
        ),
        disputeResolution,
        "MilestoneNotDisputable",
        [projectId, 0n, MilestoneStatus.Pending],
      );

      // Advance EVM time past dueDate
      await advanceTime(provider, dueOffset + 10n);

      // Freelancer still cannot dispute a Pending milestone even when overdue
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute(
          [projectId, 0n, EVIDENCE_HASH, "ipfs://freelancer-cannot-dispute-pending"],
          { account: freelancer.account },
        ),
        disputeResolution,
        "MilestoneNotDisputable",
        [projectId, 0n, MilestoneStatus.Pending],
      );

      // Client succeeds on overdue Pending milestone
      const openTx = disputeResolution.write.openDispute(
        [projectId, 0n, EVIDENCE_HASH, "ipfs://ghosted-evidence"],
        { account: client.account },
      );
      await viem.assertions.emit(openTx, disputeResolution, "DisputeOpened");

      assert.equal((await projectManager.read.getMilestone([projectId, 0n])).status, MilestoneStatus.Disputed);
      assert.equal((await disputeResolution.read.getDispute([1n])).openedBy, getAddress(client.account.address));
    });

    it("reverts ReviewPeriodNotElapsed for freelancer before submittedAt + clientReviewPeriod and succeeds after advancing EVM time", async () => {
      const {
        viem,
        provider,
        projectManager,
        disputeResolution,
        freelancer,
        createActiveProject,
      } = await deployFixture();

      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );

      const milestone = await projectManager.read.getMilestone([projectId, 0n]);
      const expectedReviewEnd = milestone.submittedAt + CLIENT_REVIEW_PERIOD;

      // Before review period elapses -> reverts ReviewPeriodNotElapsed
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute(
          [projectId, 0n, EVIDENCE_HASH, "ipfs://freelancer-dispute"],
          { account: freelancer.account },
        ),
        disputeResolution,
        "ReviewPeriodNotElapsed",
        [projectId, 0n, expectedReviewEnd],
      );

      // Advance time past clientReviewPeriod
      await advanceTime(provider, CLIENT_REVIEW_PERIOD + 1n);

      // Freelancer succeeds
      const openTx = disputeResolution.write.openDispute(
        [projectId, 0n, EVIDENCE_HASH, "ipfs://freelancer-dispute"],
        { account: freelancer.account },
      );
      await viem.assertions.emit(openTx, disputeResolution, "DisputeOpened");

      const dispute = await disputeResolution.read.getDispute([1n]);
      assert.equal(dispute.openedBy, getAddress(freelancer.account.address));
      assert.equal(dispute.status, DisputeStatus.Open);
    });

    it("excludes arbiters owned by client or freelancer and reverts InsufficientArbiters if < 3 conflict-free active arbiters exist", async () => {
      const {
        viem,
        identity,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        arbiter3,
        arbiter4,
        createActiveProject,
      } = await deployFixture();

      // Register an arbiter NFT owned by client (agentId 7) and one owned by freelancer (agentId 8)
      await identity.write.register(["ipfs://client-arbiter", AgentRole.Arbiter], {
        account: client.account,
      });
      await identity.write.register(["ipfs://freelancer-arbiter", AgentRole.Arbiter], {
        account: freelancer.account,
      });
      const clientArbiterId = 7n;
      const freelancerArbiterId = 8n;

      // Deactivate arbiter4 (id 6) so exactly 3 non-conflicted active arbiters remain: 3, 4, 5
      await identity.write.setActive([6n, false], { account: arbiter4.account });

      const { projectId } = await createActiveProject(
        [500n * ONE_TUSD, 500n * ONE_TUSD],
        [7n * 24n * 60n * 60n, 14n * 24n * 60n * 60n],
      );
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliv-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await projectManager.write.submitDeliverable(
        [projectId, 1n, "ipfs://deliv-1", DELIVERABLE_HASH],
        { account: freelancer.account },
      );

      // Open dispute on milestone 0 -> must select {3, 4, 5}, excluding clientArbiterId (7) & freelancerArbiterId (8)
      await disputeResolution.write.openDispute(
        [projectId, 0n, EVIDENCE_HASH, "ipfs://evidence-0"],
        { account: client.account },
      );
      const dispute = await disputeResolution.read.getDispute([1n]);
      for (const id of dispute.arbiters) {
        assert.notEqual(id, clientArbiterId);
        assert.notEqual(id, freelancerArbiterId);
        assert.ok(id === 3n || id === 4n || id === 5n);
      }

      // Now deactivate arbiter3 (id 5) -> only 2 non-conflicted active arbiters remain (3, 4)
      // even though 4 total active arbiters exist (3, 4, 7, 8)
      await identity.write.setActive([5n, false], { account: arbiter3.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute(
          [projectId, 1n, EVIDENCE_HASH, "ipfs://evidence-1"],
          { account: client.account },
        ),
        disputeResolution,
        "InsufficientArbiters",
        [2n, 3n],
      );
    });

    it("reverts on unauthorized opener, empty evidenceHash/URI, non-active project, and duplicate dispute on same milestone", async () => {
      const {
        viem,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        stranger,
        clientAgentId,
        createActiveProject,
      } = await deployFixture();

      // Create an Open (unaccepted) project -> ProjectNotActive
      await projectManager.write.createProject(
        [clientAgentId, 0n, "ipfs://open-brief", [500n * ONE_TUSD], [1_900_000_000n], ["ipfs://m0"]],
        { account: client.account },
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute([1n, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
          account: client.account,
        }),
        disputeResolution,
        "ProjectNotActive",
        [1n, ProjectStatus.Open],
      );

      // Active project with Submitted milestone
      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliv-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );

      // Empty evidenceHash
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.openDispute([projectId, 0n, zeroHash, "ipfs://evidence"], {
          account: client.account,
        }),
        disputeResolution,
        "EmptyEvidenceHash",
      );

      // Empty evidenceURI
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, ""], {
          account: client.account,
        }),
        disputeResolution,
        "EmptyURI",
      );

      // Unauthorized opener (stranger)
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
          account: stranger.account,
        }),
        disputeResolution,
        "UnauthorizedDisputeOpener",
        [getAddress(stranger.account.address), projectId],
      );

      // Valid open succeeds
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      // Duplicate dispute on same milestone reverts (milestone is now Disputed)
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence-2"], {
          account: client.account,
        }),
        disputeResolution,
        "MilestoneNotDisputable",
        [projectId, 0n, MilestoneStatus.Disputed],
      );
    });
  });

  describe("Voting & 2-of-3 Consensus (castVote)", () => {
    it("resolves 2-of-3 ReleaseToFreelancer (with 1 dissenter voting first), splits 99%/1%, logs opaque proofs, and scores 100/25", async () => {
      const {
        viem,
        token,
        reputation,
        validation,
        projectManager,
        disputeResolution,
        treasury,
        client,
        freelancer,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const amount = 1_000n * ONE_TUSD;
      const { projectId } = await createActiveProject([amount]);
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );

      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1, arb2] = dispute.arbiters;
      const w0 = arbiterWalletById.get(arb0)!;
      const w1 = arbiterWalletById.get(arb1)!;
      const w2 = arbiterWalletById.get(arb2)!;

      // 1. Dissenter (arb0) votes RefundToClient first
      const vote0Tx = disputeResolution.write.castVote(
        [1n, arb0, Ruling.RefundToClient, REASONING_HASH_1, "ipfs://proof-0", PROOF_BYTES_1],
        { account: w0.account },
      );
      await viem.assertions.emitWithArgs(vote0Tx, disputeResolution, "VoteCast", [
        1n,
        arb0,
        Ruling.RefundToClient,
        REASONING_HASH_1,
        "ipfs://proof-0",
      ]);

      // Still Open (0 release, 1 refund)
      let current = await disputeResolution.read.getDispute([1n]);
      assert.equal(current.status, DisputeStatus.Open);
      assert.equal(current.releaseVotes, 0);
      assert.equal(current.refundVotes, 1);

      // 2. Majority voter 1 (arb1) votes ReleaseToFreelancer
      const vote1Tx = disputeResolution.write.castVote(
        [1n, arb1, Ruling.ReleaseToFreelancer, REASONING_HASH_2, "ipfs://proof-1", PROOF_BYTES_2],
        { account: w1.account },
      );
      await viem.assertions.emitWithArgs(vote1Tx, disputeResolution, "VoteCast", [
        1n,
        arb1,
        Ruling.ReleaseToFreelancer,
        REASONING_HASH_2,
        "ipfs://proof-1",
      ]);

      current = await disputeResolution.read.getDispute([1n]);
      assert.equal(current.status, DisputeStatus.Open);
      assert.equal(current.releaseVotes, 1);
      assert.equal(current.refundVotes, 1);

      // 3. Majority voter 2 (arb2) votes ReleaseToFreelancer -> reaches 2-of-3 quorum & auto-resolves!
      const vote2Tx = disputeResolution.write.castVote(
        [1n, arb2, Ruling.ReleaseToFreelancer, REASONING_HASH_3, "ipfs://proof-2", PROOF_BYTES_3],
        { account: w2.account },
      );
      await viem.assertions.emitWithArgs(vote2Tx, disputeResolution, "DisputeResolved", [
        1n,
        projectId,
        0n,
        true,
        2,
        1,
      ]);

      // Verify dispute & milestone state
      current = await disputeResolution.read.getDispute([1n]);
      assert.equal(current.status, DisputeStatus.ResolvedRelease);
      assert.equal(current.releaseVotes, 2);
      assert.equal(current.refundVotes, 1);
      assert.equal(
        (await projectManager.read.getMilestone([projectId, 0n])).status,
        MilestoneStatus.ResolvedRelease,
      );
      assert.equal(
        (await projectManager.read.getProject([projectId])).status,
        ProjectStatus.Completed,
      );

      // Verify 99% to freelancer, 1% to treasury
      assert.equal(await token.read.balanceOf([freelancer.account.address]), 990n * ONE_TUSD);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD);

      // Verify all 3 votes stored in DisputeResolution
      const storedVote0 = await disputeResolution.read.getArbiterVote([1n, arb0]);
      assert.equal(storedVote0.ruling, Ruling.RefundToClient);
      assert.equal(storedVote0.reasoningHash, REASONING_HASH_1);
      assert.equal(storedVote0.proofURI, "ipfs://proof-0");

      const storedVote1 = await disputeResolution.read.getArbiterVote([1n, arb1]);
      assert.equal(storedVote1.ruling, Ruling.ReleaseToFreelancer);

      const storedVote2 = await disputeResolution.read.getArbiterVote([1n, arb2]);
      assert.equal(storedVote2.ruling, Ruling.ReleaseToFreelancer);

      // Verify all 3 votes & opaque proof bytes recorded in ValidationRegistry
      const val0 = await validation.read.getValidation([dispute.validationRequestIds[0]]);
      assert.equal(val0.status, ValidationStatus.Approved);
      assert.equal(val0.responseCode, 2); // VOTE_REFUND
      assert.equal(val0.reasoningHash, REASONING_HASH_1);
      assert.equal(val0.proofURI, "ipfs://proof-0");
      assert.equal(val0.proof, PROOF_BYTES_1);

      const val1 = await validation.read.getValidation([dispute.validationRequestIds[1]]);
      assert.equal(val1.status, ValidationStatus.Approved);
      assert.equal(val1.responseCode, 1); // VOTE_RELEASE
      assert.equal(val1.reasoningHash, REASONING_HASH_2);
      assert.equal(val1.proofURI, "ipfs://proof-1");
      assert.equal(val1.proof, PROOF_BYTES_2);

      const val2 = await validation.read.getValidation([dispute.validationRequestIds[2]]);
      assert.equal(val2.status, ValidationStatus.Approved);
      assert.equal(val2.responseCode, 1); // VOTE_RELEASE
      assert.equal(val2.reasoningHash, REASONING_HASH_3);
      assert.equal(val2.proofURI, "ipfs://proof-2");
      assert.equal(val2.proof, PROOF_BYTES_3);

      // Verify ReputationRegistry auto-scoring: majority = 100, dissenter = 25
      const [c0, avg0] = await reputation.read.getSummary([arb0]);
      assert.equal(c0, 1n);
      assert.equal(avg0, 25);

      const [c1, avg1] = await reputation.read.getSummary([arb1]);
      assert.equal(c1, 1n);
      assert.equal(avg1, 100);

      const [c2, avg2] = await reputation.read.getSummary([arb2]);
      assert.equal(c2, 1n);
      assert.equal(avg2, 100);

      const fb0 = await reputation.read.getFeedback([arb0, 0n]);
      assert.equal(fb0.reviewer, getAddress(disputeResolution.address));
      assert.equal(fb0.tag, await disputeResolution.read.TAG_ARBITER());
      assert.equal(fb0.score, 25);
    });

    it("resolves 2-of-3 RefundToClient with 100% (0% fee) refund to client and scores only voting arbiters", async () => {
      const {
        viem,
        token,
        reputation,
        projectManager,
        disputeResolution,
        treasury,
        client,
        freelancer,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const amount = 1_500n * ONE_TUSD;
      const clientStart = await token.read.balanceOf([client.account.address]);

      const { projectId } = await createActiveProject([amount]);
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1, arb2] = dispute.arbiters;
      const w0 = arbiterWalletById.get(arb0)!;
      const w1 = arbiterWalletById.get(arb1)!;

      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.RefundToClient, REASONING_HASH_1, "ipfs://proof-0", PROOF_BYTES_1],
        { account: w0.account },
      );

      const vote1Tx = disputeResolution.write.castVote(
        [1n, arb1, Ruling.RefundToClient, REASONING_HASH_2, "ipfs://proof-1", PROOF_BYTES_2],
        { account: w1.account },
      );
      await viem.assertions.emitWithArgs(vote1Tx, disputeResolution, "DisputeResolved", [
        1n,
        projectId,
        0n,
        false,
        0,
        2,
      ]);

      // 100% refunded to client, 0% fee to treasury
      assert.equal(await token.read.balanceOf([client.account.address]), clientStart);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
      assert.equal(await token.read.balanceOf([freelancer.account.address]), 0n);

      assert.equal(
        (await disputeResolution.read.getDispute([1n])).status,
        DisputeStatus.ResolvedRefund,
      );
      assert.equal(
        (await projectManager.read.getMilestone([projectId, 0n])).status,
        MilestoneStatus.ResolvedRefund,
      );

      // Majority voters get 100; non-voter (arb2) has 0 feedback
      const [c0, avg0] = await reputation.read.getSummary([arb0]);
      assert.equal(c0, 1n);
      assert.equal(avg0, 100);

      const [c1, avg1] = await reputation.read.getSummary([arb1]);
      assert.equal(c1, 1n);
      assert.equal(avg1, 100);

      const [c2, avg2] = await reputation.read.getSummary([arb2]);
      assert.equal(c2, 0n);
      assert.equal(avg2, 0);
    });

    it("allows an arbiter who already submitted directly to ValidationRegistry to castVote without reverting (Stage 1B M-2 mitigation)", async () => {
      const {
        validation,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1] = dispute.arbiters;
      const w0 = arbiterWalletById.get(arb0)!;
      const w1 = arbiterWalletById.get(arb1)!;

      // arb0 submits directly to ValidationRegistry first
      const directProof = stringToHex("direct-validation-proof");
      await validation.write.submitValidation(
        [dispute.validationRequestIds[0], 1, REASONING_HASH_1, "ipfs://direct-proof", directProof],
        { account: w0.account },
      );

      // arb0 can still call castVote on DisputeResolution without reverting
      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://cast-vote-proof", PROOF_BYTES_1],
        { account: w0.account },
      );

      // Direct validation record is preserved
      const val0 = await validation.read.getValidation([dispute.validationRequestIds[0]]);
      assert.equal(val0.status, ValidationStatus.Approved);
      assert.equal(val0.proofURI, "ipfs://direct-proof");
      assert.equal(val0.proof, directProof);

      // Second vote reaches quorum cleanly
      await disputeResolution.write.castVote(
        [1n, arb1, Ruling.ReleaseToFreelancer, REASONING_HASH_2, "ipfs://proof-1", PROOF_BYTES_2],
        { account: w1.account },
      );
      assert.equal(
        (await disputeResolution.read.getDispute([1n])).status,
        DisputeStatus.ResolvedRelease,
      );
    });

    it("allows an approved ERC-721 operator on an arbiter NFT to castVote", async () => {
      const {
        identity,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        operator,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const arb0 = dispute.arbiters[0];
      const w0 = arbiterWalletById.get(arb0)!;

      await identity.write.approve([operator.account.address, arb0], { account: w0.account });

      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://op-proof", PROOF_BYTES_1],
        { account: operator.account },
      );

      const vote = await disputeResolution.read.getArbiterVote([1n, arb0]);
      assert.equal(vote.ruling, Ruling.ReleaseToFreelancer);
    });

    it("reverts on invalid ruling, empty reasoningHash/proofURI, non-panel arbiter, unauthorized operator, double-vote, and already-resolved dispute", async () => {
      const {
        viem,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        stranger,
        arbiterIds,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const { projectId } = await createActiveProject();
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1, arb2] = dispute.arbiters;
      const nonPanelArbiter = arbiterIds.find((id) => !dispute.arbiters.includes(id))!;
      const w0 = arbiterWalletById.get(arb0)!;
      const w1 = arbiterWalletById.get(arb1)!;
      const w2 = arbiterWalletById.get(arb2)!;
      const wNonPanel = arbiterWalletById.get(nonPanelArbiter)!;

      // Non-existent dispute
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.castVote(
          [999n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p", PROOF_BYTES_1],
          { account: w0.account },
        ),
        disputeResolution,
        "DisputeNotFound",
        [999n],
      );

      // Invalid ruling (Ruling.None)
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.castVote(
          [1n, arb0, Ruling.None, REASONING_HASH_1, "ipfs://p", PROOF_BYTES_1],
          { account: w0.account },
        ),
        disputeResolution,
        "InvalidRuling",
      );

      // Empty reasoningHash
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.castVote(
          [1n, arb0, Ruling.ReleaseToFreelancer, zeroHash, "ipfs://p", PROOF_BYTES_1],
          { account: w0.account },
        ),
        disputeResolution,
        "EmptyReasoningHash",
      );

      // Empty proofURI
      await viem.assertions.revertWithCustomError(
        disputeResolution.write.castVote(
          [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "", PROOF_BYTES_1],
          { account: w0.account },
        ),
        disputeResolution,
        "EmptyURI",
      );

      // Non-panel arbiter
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.castVote(
          [1n, nonPanelArbiter, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p", PROOF_BYTES_1],
          { account: wNonPanel.account },
        ),
        disputeResolution,
        "ArbiterNotAssigned",
        [1n, nonPanelArbiter],
      );

      // Unauthorized operator
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.castVote(
          [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p", PROOF_BYTES_1],
          { account: stranger.account },
        ),
        disputeResolution,
        "UnauthorizedArbiterOperator",
        [getAddress(stranger.account.address), arb0],
      );

      // First valid vote by arb0
      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p0", PROOF_BYTES_1],
        { account: w0.account },
      );

      // Double-vote by arb0
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.castVote(
          [1n, arb0, Ruling.RefundToClient, REASONING_HASH_2, "ipfs://p0-dup", PROOF_BYTES_2],
          { account: w0.account },
        ),
        disputeResolution,
        "ArbiterAlreadyVoted",
        [1n, arb0],
      );

      // Second valid vote by arb1 resolves the dispute
      await disputeResolution.write.castVote(
        [1n, arb1, Ruling.ReleaseToFreelancer, REASONING_HASH_2, "ipfs://p1", PROOF_BYTES_2],
        { account: w1.account },
      );

      // Third arbiter voting after resolution reverts DisputeNotOpen
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.castVote(
          [1n, arb2, Ruling.ReleaseToFreelancer, REASONING_HASH_3, "ipfs://p2", PROOF_BYTES_3],
          { account: w2.account },
        ),
        disputeResolution,
        "DisputeNotOpen",
        [1n, DisputeStatus.ResolvedRelease],
      );
    });
  });

  describe("Expired Dispute Fallback (finalizeExpiredDispute)", () => {
    it("reverts VotingPeriodNotExpired before deadline, resolves 1-0 Release after deadline, and reverts DisputeNotOpen if called again", async () => {
      const {
        viem,
        provider,
        token,
        reputation,
        projectManager,
        disputeResolution,
        treasury,
        client,
        freelancer,
        stranger,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const amount = 1_000n * ONE_TUSD;
      const { projectId } = await createActiveProject([amount]);
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1, arb2] = dispute.arbiters;
      const w0 = arbiterWalletById.get(arb0)!;

      // Only 1 arbiter votes ReleaseToFreelancer
      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p0", PROOF_BYTES_1],
        { account: w0.account },
      );

      // Before votingDeadline -> reverts VotingPeriodNotExpired
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.finalizeExpiredDispute([1n], { account: stranger.account }),
        disputeResolution,
        "VotingPeriodNotExpired",
        [1n, dispute.votingDeadline],
      );

      // Advance past votingDeadline
      await advanceTime(provider, VOTING_PERIOD + 1n);

      // Anyone can finalize -> 1-0 resolves ReleaseToFreelancer
      const finalizeTx = disputeResolution.write.finalizeExpiredDispute([1n], {
        account: stranger.account,
      });
      await viem.assertions.emitWithArgs(finalizeTx, disputeResolution, "DisputeResolved", [
        1n,
        projectId,
        0n,
        true,
        1,
        0,
      ]);

      assert.equal(
        (await disputeResolution.read.getDispute([1n])).status,
        DisputeStatus.ResolvedRelease,
      );
      assert.equal(await token.read.balanceOf([freelancer.account.address]), 990n * ONE_TUSD);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD);

      // Voter gets 100, non-voters get 0 feedback
      const [c0, avg0] = await reputation.read.getSummary([arb0]);
      assert.equal(c0, 1n);
      assert.equal(avg0, 100);
      assert.equal((await reputation.read.getSummary([arb1]))[0], 0n);
      assert.equal((await reputation.read.getSummary([arb2]))[0], 0n);

      // Calling finalizeExpiredDispute again reverts DisputeNotOpen
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.finalizeExpiredDispute([1n], { account: stranger.account }),
        disputeResolution,
        "DisputeNotOpen",
        [1n, DisputeStatus.ResolvedRelease],
      );
    });

    it("defaults 1-1 tie to RefundToClient after deadline and scores refund voter 100 and release voter 25", async () => {
      const {
        viem,
        provider,
        token,
        reputation,
        projectManager,
        disputeResolution,
        treasury,
        client,
        freelancer,
        stranger,
        arbiterWalletById,
        createActiveProject,
      } = await deployFixture();

      const amount = 800n * ONE_TUSD;
      const clientStart = await token.read.balanceOf([client.account.address]);

      const { projectId } = await createActiveProject([amount]);
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);
      const [arb0, arb1, arb2] = dispute.arbiters;
      const w0 = arbiterWalletById.get(arb0)!;
      const w1 = arbiterWalletById.get(arb1)!;

      // 1-1 tie
      await disputeResolution.write.castVote(
        [1n, arb0, Ruling.ReleaseToFreelancer, REASONING_HASH_1, "ipfs://p0", PROOF_BYTES_1],
        { account: w0.account },
      );
      await disputeResolution.write.castVote(
        [1n, arb1, Ruling.RefundToClient, REASONING_HASH_2, "ipfs://p1", PROOF_BYTES_2],
        { account: w1.account },
      );

      await advanceTime(provider, VOTING_PERIOD + 1n);

      const finalizeTx = disputeResolution.write.finalizeExpiredDispute([1n], {
        account: stranger.account,
      });
      await viem.assertions.emitWithArgs(finalizeTx, disputeResolution, "DisputeResolved", [
        1n,
        projectId,
        0n,
        false,
        1,
        1,
      ]);

      assert.equal(
        (await disputeResolution.read.getDispute([1n])).status,
        DisputeStatus.ResolvedRefund,
      );
      assert.equal(await token.read.balanceOf([client.account.address]), clientStart);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);

      // arb1 voted Refund (final outcome) -> 100; arb0 voted Release (dissent) -> 25; arb2 didn't vote -> 0
      const [c0, avg0] = await reputation.read.getSummary([arb0]);
      assert.equal(c0, 1n);
      assert.equal(avg0, 25);

      const [c1, avg1] = await reputation.read.getSummary([arb1]);
      assert.equal(c1, 1n);
      assert.equal(avg1, 100);

      assert.equal((await reputation.read.getSummary([arb2]))[0], 0n);
    });

    it("defaults 0-0 no-vote expired dispute to RefundToClient with 0 arbiter feedback records", async () => {
      const {
        viem,
        provider,
        token,
        reputation,
        projectManager,
        disputeResolution,
        client,
        freelancer,
        stranger,
        createActiveProject,
      } = await deployFixture();

      const amount = 600n * ONE_TUSD;
      const clientStart = await token.read.balanceOf([client.account.address]);

      const { projectId } = await createActiveProject([amount]);
      await projectManager.write.submitDeliverable(
        [projectId, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH],
        { account: freelancer.account },
      );
      await disputeResolution.write.openDispute([projectId, 0n, EVIDENCE_HASH, "ipfs://evidence"], {
        account: client.account,
      });

      const dispute = await disputeResolution.read.getDispute([1n]);

      await advanceTime(provider, VOTING_PERIOD + 1n);

      const finalizeTx = disputeResolution.write.finalizeExpiredDispute([1n], {
        account: stranger.account,
      });
      await viem.assertions.emitWithArgs(finalizeTx, disputeResolution, "DisputeResolved", [
        1n,
        projectId,
        0n,
        false,
        0,
        0,
      ]);

      assert.equal(
        (await disputeResolution.read.getDispute([1n])).status,
        DisputeStatus.ResolvedRefund,
      );
      assert.equal(await token.read.balanceOf([client.account.address]), clientStart);

      for (const arbiterId of dispute.arbiters) {
        assert.equal((await reputation.read.getSummary([arbiterId]))[0], 0n);
      }

      // Non-existent dispute ID reverts DisputeNotFound
      await viem.assertions.revertWithCustomErrorWithArgs(
        disputeResolution.write.finalizeExpiredDispute([999n], { account: stranger.account }),
        disputeResolution,
        "DisputeNotFound",
        [999n],
      );
    });
  });
});
