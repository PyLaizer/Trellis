import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, keccak256, stringToBytes, stringToHex } from "viem";

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

const EscrowStatus = {
  None: 0,
  Locked: 1,
  Released: 2,
  Refunded: 3,
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
const FEE_BPS = 100; // 1%
const CLIENT_REVIEW_PERIOD = 3n * 24n * 60n * 60n; // 3 days
const VOTING_PERIOD = 2n * 24n * 60n * 60n; // 2 days

describe("Trellis End-to-End Integration", () => {
  async function deployProductionProtocol() {
    const { viem } = await hre.network.connect();
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
    ] = await viem.getWalletClients();

    // 1. Deploy ERC-20 mock token and all 6 Trellis protocol contracts
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
      FEE_BPS,
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

    // 2. Wire production AccessControl roles across all 6 contracts
    const reporterRole = await reputation.read.REPORTER_ROLE();
    const requesterRole = await validation.read.REQUESTER_ROLE();
    const escrowPmRole = await escrow.read.PROJECT_MANAGER_ROLE();
    const escrowDisputeRole = await escrow.read.DISPUTE_RESOLVER_ROLE();
    const pmDisputeRole = await projectManager.read.DISPUTE_RESOLVER_ROLE();

    await reputation.write.grantRole([reporterRole, projectManager.address], {
      account: admin.account,
    });
    await reputation.write.grantRole([reporterRole, disputeResolution.address], {
      account: admin.account,
    });
    await validation.write.grantRole([requesterRole, disputeResolution.address], {
      account: admin.account,
    });
    await escrow.write.grantRole([escrowPmRole, projectManager.address], {
      account: admin.account,
    });
    // Intentionally do NOT grant DISPUTE_RESOLVER_ROLE on MilestoneEscrow:
    // ProjectManager is the sole settlement authority for escrowed funds.
    await projectManager.write.grantRole([pmDisputeRole, disputeResolution.address], {
      account: admin.account,
    });

    // 3. Register ERC-8004 identities with IPFS Agent Card URIs + metadata
    // Agent IDs: 1 = client, 2 = freelancer, 3..6 = arbiter1..arbiter4
    await identity.write.register(["ipfs://QmTrellisClientAgentCardV1", AgentRole.Client], {
      account: client.account,
    });
    await identity.write.setMetadata([1n, "org", stringToHex("QDay Labs")], {
      account: client.account,
    });

    await identity.write.register(
      ["ipfs://QmTrellisFreelancerAgentCardV1", AgentRole.Freelancer],
      { account: freelancer.account },
    );
    await identity.write.setMetadata([2n, "specialty", stringToHex("solidity-security")], {
      account: freelancer.account,
    });

    const arbiterConfigs = [
      {
        wallet: arbiter1,
        id: 3n,
        uri: "ipfs://QmTrellisArbiterCard1",
        model: "claude-3.7-sonnet-tee",
      },
      {
        wallet: arbiter2,
        id: 4n,
        uri: "ipfs://QmTrellisArbiterCard2",
        model: "gpt-4o-zkml-v1",
      },
      {
        wallet: arbiter3,
        id: 5n,
        uri: "ipfs://QmTrellisArbiterCard3",
        model: "gemini-2.5-pro-attest",
      },
      {
        wallet: arbiter4,
        id: 6n,
        uri: "ipfs://QmTrellisArbiterCard4",
        model: "llama-3.3-70b-enclave",
      },
    ] as const;

    for (const cfg of arbiterConfigs) {
      await identity.write.register([cfg.uri, AgentRole.Arbiter], {
        account: cfg.wallet.account,
      });
      await identity.write.setMetadata([cfg.id, "model", stringToHex(cfg.model)], {
        account: cfg.wallet.account,
      });
    }

    const arbiterWalletById = new Map([
      [3n, arbiter1],
      [4n, arbiter2],
      [5n, arbiter3],
      [6n, arbiter4],
    ]);

    return {
      viem,
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
      arbiterWalletById,
      clientAgentId: 1n,
      freelancerAgentId: 2n,
      arbiterIds: [3n, 4n, 5n, 6n] as const,
      roles: {
        reporterRole,
        requesterRole,
        escrowPmRole,
        escrowDisputeRole,
        pmDisputeRole,
      },
    };
  }

  it("verifies full production role wiring across all 6 contracts (with ProjectManager as sole MilestoneEscrow settler)", async () => {
    const {
      reputation,
      validation,
      escrow,
      projectManager,
      disputeResolution,
      roles,
    } = await deployProductionProtocol();

    // ReputationRegistry: REPORTER_ROLE granted to ProjectManager and DisputeResolution
    assert.equal(
      await reputation.read.hasRole([roles.reporterRole, projectManager.address]),
      true,
    );
    assert.equal(
      await reputation.read.hasRole([roles.reporterRole, disputeResolution.address]),
      true,
    );

    // ValidationRegistry: REQUESTER_ROLE granted to DisputeResolution only
    assert.equal(
      await validation.read.hasRole([roles.requesterRole, disputeResolution.address]),
      true,
    );
    assert.equal(
      await validation.read.hasRole([roles.requesterRole, projectManager.address]),
      false,
    );

    // MilestoneEscrow: PROJECT_MANAGER_ROLE granted to ProjectManager;
    // DISPUTE_RESOLVER_ROLE must NOT be granted to DisputeResolution
    assert.equal(
      await escrow.read.hasRole([roles.escrowPmRole, projectManager.address]),
      true,
    );
    assert.equal(
      await escrow.read.hasRole([roles.escrowDisputeRole, disputeResolution.address]),
      false,
    );

    // ProjectManager: DISPUTE_RESOLVER_ROLE granted to DisputeResolution
    assert.equal(
      await projectManager.read.hasRole([roles.pmDisputeRole, disputeResolution.address]),
      true,
    );
  });

  it("Scenario 1: executes complete 3-milestone lifecycle (Happy Path, 2-of-3 Disputed Release, 2-of-3 Disputed Refund + Completion & Bilateral Ratings)", async () => {
    const {
      viem,
      publicClient,
      token,
      identity,
      reputation,
      validation,
      escrow,
      projectManager,
      disputeResolution,
      treasury,
      client,
      freelancer,
      arbiterWalletById,
      clientAgentId,
      freelancerAgentId,
      arbiterIds,
    } = await deployProductionProtocol();

    // Verify ERC-8004 identities, Agent Card URIs, metadata, and active arbiter pool
    assert.equal(await identity.read.totalAgents(), 6n);
    assert.equal(await identity.read.tokenURI([clientAgentId]), "ipfs://QmTrellisClientAgentCardV1");
    assert.equal(
      await identity.read.getMetadata([clientAgentId, "org"]),
      stringToHex("QDay Labs"),
    );
    assert.equal(
      await identity.read.getMetadata([freelancerAgentId, "specialty"]),
      stringToHex("solidity-security"),
    );
    const activeArbiters = await identity.read.getActiveArbiters();
    assert.equal(activeArbiters.length, 4);
    for (const id of arbiterIds) {
      assert.ok(activeArbiters.includes(id));
    }

    // Client mints and approves exact 4,500 tUSD8 (1,000 + 2,000 + 1,500) to MilestoneEscrow
    const m0Amount = 1_000n * ONE_TUSD;
    const m1Amount = 2_000n * ONE_TUSD;
    const m2Amount = 1_500n * ONE_TUSD;
    const totalBudget = m0Amount + m1Amount + m2Amount; // 4,500 tUSD8

    await token.write.mint([client.account.address, totalBudget]);
    await token.write.approve([escrow.address, totalBudget], { account: client.account });

    const latestBlock = await publicClient.getBlock();
    const dueDates = [
      latestBlock.timestamp + 7n * 24n * 60n * 60n,
      latestBlock.timestamp + 14n * 24n * 60n * 60n,
      latestBlock.timestamp + 21n * 24n * 60n * 60n,
    ];
    const milestoneURIs = [
      "ipfs://QmMilestone0SpecArchitecture",
      "ipfs://QmMilestone1SpecContracts",
      "ipfs://QmMilestone2SpecAuditFixes",
    ];

    // Create open project (targetFreelancerAgentId = 0)
    await projectManager.write.createProject(
      [
        clientAgentId,
        0n,
        "ipfs://QmProject1BriefQuantumEscrow",
        [m0Amount, m1Amount, m2Amount],
        dueDates,
        milestoneURIs,
      ],
      { account: client.account },
    );

    const projectId = 1n;
    assert.equal(await projectManager.read.totalProjects(), 1n);
    assert.equal(await token.read.balanceOf([client.account.address]), 0n);
    assert.equal(await token.read.balanceOf([escrow.address]), totalBudget);

    // Freelancer accepts the open project
    await projectManager.write.acceptProject([projectId, freelancerAgentId], {
      account: freelancer.account,
    });
    const activeProject = await projectManager.read.getProject([projectId]);
    assert.equal(activeProject.status, ProjectStatus.Active);
    assert.equal(activeProject.freelancerAgentId, freelancerAgentId);
    assert.equal(activeProject.freelancer, getAddress(freelancer.account.address));

    // =========================================================================
    // MILESTONE 0 (1,000 tUSD8) — Happy Path
    // =========================================================================
    const m0DeliverableHash = keccak256(stringToBytes("milestone-0-architecture-pdf-v1"));
    await projectManager.write.submitDeliverable(
      [projectId, 0n, "ipfs://QmDeliverable0Architecture", m0DeliverableHash],
      { account: freelancer.account },
    );

    const approveTx = projectManager.write.approveMilestone([projectId, 0n], {
      account: client.account,
    });
    await viem.assertions.emitWithArgs(approveTx, projectManager, "MilestoneApproved", [
      projectId,
      0n,
      m0Amount,
    ]);

    // Verify 990 tUSD8 to Freelancer, 10 tUSD8 to treasury, 3,500 tUSD8 remaining in escrow
    assert.equal(await token.read.balanceOf([freelancer.account.address]), 990n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([escrow.address]), 3_500n * ONE_TUSD);
    assert.equal(
      (await projectManager.read.getMilestone([projectId, 0n])).status,
      MilestoneStatus.Approved,
    );
    assert.equal((await escrow.read.getEscrow([projectId, 0n])).status, EscrowStatus.Released);

    // Bilateral counterparty ratings on Milestone 0: Client rates Freelancer 95, Freelancer rates Client 90
    await projectManager.write.rateCounterparty(
      [
        projectId,
        0n,
        95,
        "ipfs://QmClientReviewM0",
        keccak256(stringToBytes("Excellent architecture deliverable")),
      ],
      { account: client.account },
    );
    await projectManager.write.rateCounterparty(
      [
        projectId,
        0n,
        90,
        "ipfs://QmFreelancerReviewM0",
        keccak256(stringToBytes("Fast review and clear requirements")),
      ],
      { account: freelancer.account },
    );

    const [flCountM0, flAvgM0] = await reputation.read.getSummary([freelancerAgentId]);
    assert.equal(flCountM0, 1n);
    assert.equal(flAvgM0, 95);

    const [clCountM0, clAvgM0] = await reputation.read.getSummary([clientAgentId]);
    assert.equal(clCountM0, 1n);
    assert.equal(clAvgM0, 90);

    // =========================================================================
    // MILESTONE 1 (2,000 tUSD8) — Disputed & Resolved Release (2-of-3)
    // =========================================================================
    const m1DeliverableHash = keccak256(stringToBytes("milestone-1-contracts-bundle-v1"));
    await projectManager.write.submitDeliverable(
      [projectId, 1n, "ipfs://QmDeliverable1Contracts", m1DeliverableHash],
      { account: freelancer.account },
    );

    const d1EvidenceHash = keccak256(stringToBytes("dispute-1-evidence-bundle"));
    await disputeResolution.write.openDispute(
      [projectId, 1n, d1EvidenceHash, "ipfs://QmDispute1Evidence"],
      { account: client.account },
    );

    const dispute1Id = 1n;
    const dispute1 = await disputeResolution.read.getDispute([dispute1Id]);
    assert.equal(dispute1.status, DisputeStatus.Open);
    assert.equal(dispute1.arbiters.length, 3);
    assert.equal(new Set(dispute1.arbiters).size, 3);
    for (const arbId of dispute1.arbiters) {
      assert.notEqual(arbId, clientAgentId);
      assert.notEqual(arbId, freelancerAgentId);
      assert.ok(arbiterIds.includes(arbId as 3n | 4n | 5n | 6n));
    }

    const [d1Arb0, d1Arb1, d1Arb2] = dispute1.arbiters;
    const d1W0 = arbiterWalletById.get(d1Arb0)!;
    const d1W1 = arbiterWalletById.get(d1Arb1)!;
    const d1W2 = arbiterWalletById.get(d1Arb2)!;

    const d1Reason0 = keccak256(stringToBytes("d1-arb0-dissent-refund"));
    const d1Reason1 = keccak256(stringToBytes("d1-arb1-majority-release"));
    const d1Reason2 = keccak256(stringToBytes("d1-arb2-majority-release"));
    const d1Proof0 = stringToHex("zkml-proof-d1-arb0");
    const d1Proof1 = stringToHex("tee-quote-d1-arb1");
    const d1Proof2 = stringToHex("zkml-proof-d1-arb2");

    // Arbiter 0 votes RefundToClient (dissenter)
    await disputeResolution.write.castVote(
      [dispute1Id, d1Arb0, Ruling.RefundToClient, d1Reason0, "ipfs://QmD1Proof0", d1Proof0],
      { account: d1W0.account },
    );
    // Arbiter 1 votes ReleaseToFreelancer
    await disputeResolution.write.castVote(
      [dispute1Id, d1Arb1, Ruling.ReleaseToFreelancer, d1Reason1, "ipfs://QmD1Proof1", d1Proof1],
      { account: d1W1.account },
    );
    // Arbiter 2 votes ReleaseToFreelancer -> reaches 2-of-3 quorum & auto-resolves
    const d1ResolveTx = disputeResolution.write.castVote(
      [dispute1Id, d1Arb2, Ruling.ReleaseToFreelancer, d1Reason2, "ipfs://QmD1Proof2", d1Proof2],
      { account: d1W2.account },
    );
    await viem.assertions.emitWithArgs(d1ResolveTx, disputeResolution, "DisputeResolved", [
      dispute1Id,
      projectId,
      1n,
      true,
      2,
      1,
    ]);

    // Verify +1,980 tUSD8 to Freelancer (total 2,970 tUSD8), +20 tUSD8 to treasury (total 30 tUSD8)
    assert.equal(await token.read.balanceOf([freelancer.account.address]), 2_970n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([treasury.account.address]), 30n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([escrow.address]), 1_500n * ONE_TUSD);
    assert.equal(
      (await disputeResolution.read.getDispute([dispute1Id])).status,
      DisputeStatus.ResolvedRelease,
    );
    assert.equal(
      (await projectManager.read.getMilestone([projectId, 1n])).status,
      MilestoneStatus.ResolvedRelease,
    );
    assert.equal((await escrow.read.getEscrow([projectId, 1n])).status, EscrowStatus.Released);

    // Verify all 3 proofs stored in ValidationRegistry
    const d1Val0 = await validation.read.getValidation([dispute1.validationRequestIds[0]]);
    assert.equal(d1Val0.status, ValidationStatus.Approved);
    assert.equal(d1Val0.responseCode, 2); // VOTE_REFUND
    assert.equal(d1Val0.reasoningHash, d1Reason0);
    assert.equal(d1Val0.proofURI, "ipfs://QmD1Proof0");
    assert.equal(d1Val0.proof, d1Proof0);

    const d1Val1 = await validation.read.getValidation([dispute1.validationRequestIds[1]]);
    assert.equal(d1Val1.status, ValidationStatus.Approved);
    assert.equal(d1Val1.responseCode, 1); // VOTE_RELEASE
    assert.equal(d1Val1.reasoningHash, d1Reason1);
    assert.equal(d1Val1.proofURI, "ipfs://QmD1Proof1");
    assert.equal(d1Val1.proof, d1Proof1);

    const d1Val2 = await validation.read.getValidation([dispute1.validationRequestIds[2]]);
    assert.equal(d1Val2.status, ValidationStatus.Approved);
    assert.equal(d1Val2.responseCode, 1); // VOTE_RELEASE
    assert.equal(d1Val2.reasoningHash, d1Reason2);
    assert.equal(d1Val2.proofURI, "ipfs://QmD1Proof2");
    assert.equal(d1Val2.proof, d1Proof2);

    // Track expected arbiter scores across disputes for running-average checks
    const expectedArbiterScores = new Map<bigint, number[]>([
      [3n, []],
      [4n, []],
      [5n, []],
      [6n, []],
    ]);
    expectedArbiterScores.get(d1Arb0)!.push(25); // dissenter
    expectedArbiterScores.get(d1Arb1)!.push(100); // majority
    expectedArbiterScores.get(d1Arb2)!.push(100); // majority

    // Verify ReputationRegistry auto-scored majority arbiters 100 and dissenter 25
    const [d1C0, d1Avg0] = await reputation.read.getSummary([d1Arb0]);
    assert.equal(d1C0, 1n);
    assert.equal(d1Avg0, 25);

    const [d1C1, d1Avg1] = await reputation.read.getSummary([d1Arb1]);
    assert.equal(d1C1, 1n);
    assert.equal(d1Avg1, 100);

    const [d1C2, d1Avg2] = await reputation.read.getSummary([d1Arb2]);
    assert.equal(d1C2, 1n);
    assert.equal(d1Avg2, 100);

    // =========================================================================
    // MILESTONE 2 (1,500 tUSD8) — Disputed & Resolved Refund (2-of-3) + Project Completion
    // =========================================================================
    const m2DeliverableHash = keccak256(stringToBytes("milestone-2-incomplete-fixes"));
    await projectManager.write.submitDeliverable(
      [projectId, 2n, "ipfs://QmDeliverable2AuditFixes", m2DeliverableHash],
      { account: freelancer.account },
    );

    const d2EvidenceHash = keccak256(stringToBytes("dispute-2-evidence-missing-fixes"));
    await disputeResolution.write.openDispute(
      [projectId, 2n, d2EvidenceHash, "ipfs://QmDispute2Evidence"],
      { account: client.account },
    );

    const dispute2Id = 2n;
    const dispute2 = await disputeResolution.read.getDispute([dispute2Id]);
    const [d2Arb0, d2Arb1] = dispute2.arbiters;
    const d2W0 = arbiterWalletById.get(d2Arb0)!;
    const d2W1 = arbiterWalletById.get(d2Arb1)!;

    await disputeResolution.write.castVote(
      [
        dispute2Id,
        d2Arb0,
        Ruling.RefundToClient,
        keccak256(stringToBytes("d2-arb0-refund")),
        "ipfs://QmD2Proof0",
        stringToHex("tee-quote-d2-arb0"),
      ],
      { account: d2W0.account },
    );

    const d2ResolveTx = disputeResolution.write.castVote(
      [
        dispute2Id,
        d2Arb1,
        Ruling.RefundToClient,
        keccak256(stringToBytes("d2-arb1-refund")),
        "ipfs://QmD2Proof1",
        stringToHex("zkml-proof-d2-arb1"),
      ],
      { account: d2W1.account },
    );
    await viem.assertions.emitWithArgs(d2ResolveTx, disputeResolution, "DisputeResolved", [
      dispute2Id,
      projectId,
      2n,
      false,
      0,
      2,
    ]);

    expectedArbiterScores.get(d2Arb0)!.push(100);
    expectedArbiterScores.get(d2Arb1)!.push(100);

    // Verify +1,500 tUSD8 (0% fee!) refunded to Client, treasury & freelancer unchanged, escrow empty
    assert.equal(await token.read.balanceOf([client.account.address]), 1_500n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([freelancer.account.address]), 2_970n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([treasury.account.address]), 30n * ONE_TUSD);
    assert.equal(await token.read.balanceOf([escrow.address]), 0n);

    // Verify Project 1 is Completed and Milestone 2 is ResolvedRefund / Refunded
    const completedProject = await projectManager.read.getProject([projectId]);
    assert.equal(completedProject.status, ProjectStatus.Completed);
    assert.equal(completedProject.settledCount, 3);
    assert.equal(
      (await projectManager.read.getMilestone([projectId, 2n])).status,
      MilestoneStatus.ResolvedRefund,
    );
    assert.equal((await escrow.read.getEscrow([projectId, 2n])).status, EscrowStatus.Refunded);
    assert.equal(
      (await disputeResolution.read.getDispute([dispute2Id])).status,
      DisputeStatus.ResolvedRefund,
    );

    // Verify cumulative arbiter reputation averages across Dispute 1 & Dispute 2
    for (const arbId of arbiterIds) {
      const scores = expectedArbiterScores.get(arbId)!;
      const expectedCount = BigInt(scores.length);
      const expectedAvg =
        scores.length === 0
          ? 0
          : Math.floor(scores.reduce((acc, s) => acc + s, 0) / scores.length);
      const [actualCount, actualAvg] = await reputation.read.getSummary([arbId]);
      assert.equal(actualCount, expectedCount);
      assert.equal(actualAvg, expectedAvg);
    }

    // Final bilateral ratings on Milestone 2 (allowed on ResolvedRefund milestones too)
    // Freelancer scores: [95, 45] -> avg 70
    // Client scores:     [90, 70] -> avg 80
    await projectManager.write.rateCounterparty(
      [
        projectId,
        2n,
        45,
        "ipfs://QmClientReviewM2",
        keccak256(stringToBytes("Audit fixes were incomplete")),
      ],
      { account: client.account },
    );
    await projectManager.write.rateCounterparty(
      [
        projectId,
        2n,
        70,
        "ipfs://QmFreelancerReviewM2",
        keccak256(stringToBytes("Dispute handled fairly through arbiters")),
      ],
      { account: freelancer.account },
    );

    const [flCountFinal, flAvgFinal] = await reputation.read.getSummary([freelancerAgentId]);
    assert.equal(flCountFinal, 2n);
    assert.equal(flAvgFinal, 70);

    const [clCountFinal, clAvgFinal] = await reputation.read.getSummary([clientAgentId]);
    assert.equal(clCountFinal, 2n);
    assert.equal(clAvgFinal, 80);
  });

  it("Scenario 2: Malicious Arbiter Anti-Brick Guard (Stage 1D C-1) resolves cleanly and emits ArbiterFeedbackSkipped", async () => {
    const {
      viem,
      publicClient,
      token,
      identity,
      reputation,
      escrow,
      projectManager,
      disputeResolution,
      treasury,
      client,
      freelancer,
      arbiterWalletById,
      clientAgentId,
      freelancerAgentId,
    } = await deployProductionProtocol();

    const m0Amount = 1_000n * ONE_TUSD;
    const p2Amount = 2_000n * ONE_TUSD;
    await token.write.mint([client.account.address, m0Amount + p2Amount]);
    await token.write.approve([escrow.address, m0Amount + p2Amount], {
      account: client.account,
    });

    const latestBlock = await publicClient.getBlock();
    const dueDate = latestBlock.timestamp + 7n * 24n * 60n * 60n;

    // Create and settle Project 1 quickly so the anti-brick test runs on Project 2
    await projectManager.write.createProject(
      [clientAgentId, freelancerAgentId, "ipfs://QmP1", [m0Amount], [dueDate], ["ipfs://QmP1M0"]],
      { account: client.account },
    );
    await projectManager.write.acceptProject([1n, freelancerAgentId], {
      account: freelancer.account,
    });
    await projectManager.write.submitDeliverable(
      [1n, 0n, "ipfs://QmP1Deliv0", keccak256(stringToBytes("p1-deliv-0"))],
      { account: freelancer.account },
    );
    await projectManager.write.approveMilestone([1n, 0n], { account: client.account });

    const freelancerBeforeP2 = await token.read.balanceOf([freelancer.account.address]);
    const treasuryBeforeP2 = await token.read.balanceOf([treasury.account.address]);

    // Create Project 2 and open a dispute on Milestone 0
    await projectManager.write.createProject(
      [clientAgentId, 0n, "ipfs://QmP2", [p2Amount], [dueDate], ["ipfs://QmP2M0"]],
      { account: client.account },
    );
    const project2Id = 2n;
    await projectManager.write.acceptProject([project2Id, freelancerAgentId], {
      account: freelancer.account,
    });
    await projectManager.write.submitDeliverable(
      [project2Id, 0n, "ipfs://QmP2Deliv0", keccak256(stringToBytes("p2-deliv-0"))],
      { account: freelancer.account },
    );

    await disputeResolution.write.openDispute(
      [
        project2Id,
        0n,
        keccak256(stringToBytes("p2-dispute-evidence")),
        "ipfs://QmP2DisputeEvidence",
      ],
      { account: client.account },
    );

    const disputeId = 1n;
    const dispute = await disputeResolution.read.getDispute([disputeId]);
    const [maliciousArbiterId, honestArbiterId, nonVotingArbiterId] = dispute.arbiters;
    const maliciousWallet = arbiterWalletById.get(maliciousArbiterId)!;
    const honestWallet = arbiterWalletById.get(honestArbiterId)!;

    // Griefing attempt (C-1): malicious arbiter approves DisputeResolution on its own NFT
    // so ReputationRegistry.giveFeedback(maliciousArbiterId, disputeResolution, ...) triggers
    // SelfFeedbackNotAllowed.
    await identity.write.approve([disputeResolution.address, maliciousArbiterId], {
      account: maliciousWallet.account,
    });

    // Malicious arbiter casts first vote for ReleaseToFreelancer
    await disputeResolution.write.castVote(
      [
        disputeId,
        maliciousArbiterId,
        Ruling.ReleaseToFreelancer,
        keccak256(stringToBytes("malicious-arbiter-reasoning")),
        "ipfs://QmMaliciousProof",
        stringToHex("malicious-proof"),
      ],
      { account: maliciousWallet.account },
    );

    // Honest arbiter casts second vote for ReleaseToFreelancer -> reaches 2-of-3 quorum.
    // Dispute MUST still resolve cleanly, emit ArbiterFeedbackSkipped for the malicious arbiter,
    // transfer funds to Freelancer/treasury, and award score 100 to the honest arbiter.
    const resolveTx = disputeResolution.write.castVote(
      [
        disputeId,
        honestArbiterId,
        Ruling.ReleaseToFreelancer,
        keccak256(stringToBytes("honest-arbiter-reasoning")),
        "ipfs://QmHonestProof",
        stringToHex("honest-proof"),
      ],
      { account: honestWallet.account },
    );

    await viem.assertions.emitWithArgs(resolveTx, disputeResolution, "ArbiterFeedbackSkipped", [
      disputeId,
      maliciousArbiterId,
    ]);
    await viem.assertions.emitWithArgs(resolveTx, disputeResolution, "DisputeResolved", [
      disputeId,
      project2Id,
      0n,
      true,
      2,
      0,
    ]);

    // Verify dispute & project settled cleanly
    assert.equal(
      (await disputeResolution.read.getDispute([disputeId])).status,
      DisputeStatus.ResolvedRelease,
    );
    assert.equal(
      (await projectManager.read.getMilestone([project2Id, 0n])).status,
      MilestoneStatus.ResolvedRelease,
    );
    assert.equal(
      (await projectManager.read.getProject([project2Id])).status,
      ProjectStatus.Completed,
    );

    // Verify funds transferred (+1,980 tUSD8 to Freelancer, +20 tUSD8 to treasury, 0 left in escrow)
    assert.equal(
      await token.read.balanceOf([freelancer.account.address]),
      freelancerBeforeP2 + 1_980n * ONE_TUSD,
    );
    assert.equal(
      await token.read.balanceOf([treasury.account.address]),
      treasuryBeforeP2 + 20n * ONE_TUSD,
    );
    assert.equal(await token.read.balanceOf([escrow.address]), 0n);

    // Honest arbiter received score 100; malicious arbiter's feedback was safely skipped; non-voter untouched
    const [honestCount, honestAvg] = await reputation.read.getSummary([honestArbiterId]);
    assert.equal(honestCount, 1n);
    assert.equal(honestAvg, 100);

    const [maliciousCount, maliciousAvg] = await reputation.read.getSummary([maliciousArbiterId]);
    assert.equal(maliciousCount, 0n);
    assert.equal(maliciousAvg, 0);

    const [nonVoterCount, nonVoterAvg] = await reputation.read.getSummary([nonVotingArbiterId]);
    assert.equal(nonVoterCount, 0n);
    assert.equal(nonVoterAvg, 0);
  });
});
