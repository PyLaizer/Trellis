import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, keccak256, stringToBytes, zeroAddress, zeroHash } from "viem";

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
  Unfunded: 0,
  Locked: 1,
  Released: 2,
  Refunded: 3,
} as const;

const ONE_TUSD = 1_000_000n; // 6 decimals
const DELIVERABLE_HASH_0 = keccak256(stringToBytes("deliverable-milestone-0"));
const DELIVERABLE_HASH_1 = keccak256(stringToBytes("deliverable-milestone-1"));
const COMMENT_HASH_CLIENT = keccak256(stringToBytes("Great work by freelancer"));
const COMMENT_HASH_FREELANCER = keccak256(stringToBytes("Clear specs and fast approval"));
const DUE_DATE_0 = 1_800_000_000n;
const DUE_DATE_1 = 1_800_500_000n;

describe("ProjectManager", () => {
  async function deployFixture() {
    const { viem } = await hre.network.connect();
    const [
      admin,
      treasury,
      disputeResolver,
      client,
      freelancer1,
      freelancer2,
      dualWallet,
      stranger,
    ] = await viem.getWalletClients();

    const token = await viem.deployContract("MockTUSD8");
    const identity = await viem.deployContract("IdentityRegistry");
    const reputation = await viem.deployContract("ReputationRegistry", [
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

    // Wire roles across protocol contracts
    const pmRole = await escrow.read.PROJECT_MANAGER_ROLE();
    const escrowDisputeRole = await escrow.read.DISPUTE_RESOLVER_ROLE();
    const pmDisputeRole = await projectManager.read.DISPUTE_RESOLVER_ROLE();
    const reporterRole = await reputation.read.REPORTER_ROLE();

    await escrow.write.grantRole([pmRole, projectManager.address], { account: admin.account });
    await escrow.write.grantRole([escrowDisputeRole, disputeResolver.account.address], {
      account: admin.account,
    });
    await projectManager.write.grantRole([pmDisputeRole, disputeResolver.account.address], {
      account: admin.account,
    });
    await reputation.write.grantRole([reporterRole, projectManager.address], {
      account: admin.account,
    });

    // Register ERC-8004 identities:
    // 1: client (Client)
    // 2: freelancer1 (Freelancer)
    // 3: freelancer2 (Freelancer)
    // 4: dualWallet (Client)
    // 5: dualWallet (Freelancer)
    await identity.write.register(["ipfs://client-1", AgentRole.Client], {
      account: client.account,
    });
    await identity.write.register(["ipfs://freelancer-1", AgentRole.Freelancer], {
      account: freelancer1.account,
    });
    await identity.write.register(["ipfs://freelancer-2", AgentRole.Freelancer], {
      account: freelancer2.account,
    });
    await identity.write.register(["ipfs://dual-client", AgentRole.Client], {
      account: dualWallet.account,
    });
    await identity.write.register(["ipfs://dual-freelancer", AgentRole.Freelancer], {
      account: dualWallet.account,
    });

    const clientAgentId = 1n;
    const freelancer1AgentId = 2n;
    const freelancer2AgentId = 3n;
    const dualClientAgentId = 4n;
    const dualFreelancerAgentId = 5n;

    // Mint tUSD8 and approve MilestoneEscrow for clients
    const budgetSupply = 20_000n * ONE_TUSD;
    await token.write.mint([client.account.address, budgetSupply]);
    await token.write.approve([escrow.address, budgetSupply], { account: client.account });

    await token.write.mint([dualWallet.account.address, budgetSupply]);
    await token.write.approve([escrow.address, budgetSupply], { account: dualWallet.account });

    return {
      viem,
      token,
      identity,
      reputation,
      escrow,
      projectManager,
      pmDisputeRole,
      admin,
      treasury,
      disputeResolver,
      client,
      freelancer1,
      freelancer2,
      dualWallet,
      stranger,
      clientAgentId,
      freelancer1AgentId,
      freelancer2AgentId,
      dualClientAgentId,
      dualFreelancerAgentId,
    };
  }

  describe("Constructor", () => {
    it("sets immutables, constants, grants DEFAULT_ADMIN_ROLE, and starts with 0 projects", async () => {
      const { identity, reputation, escrow, projectManager, admin } = await deployFixture();

      assert.equal(await projectManager.read.identityRegistry(), getAddress(identity.address));
      assert.equal(await projectManager.read.reputationRegistry(), getAddress(reputation.address));
      assert.equal(await projectManager.read.escrow(), getAddress(escrow.address));
      assert.equal(await projectManager.read.MAX_MILESTONES(), 20n);
      assert.equal(
        await projectManager.read.TAG_MILESTONE(),
        keccak256(stringToBytes("milestone")),
      );
      assert.equal(await projectManager.read.totalProjects(), 0n);

      const adminRole = await projectManager.read.DEFAULT_ADMIN_ROLE();
      assert.equal(await projectManager.read.hasRole([adminRole, admin.account.address]), true);
    });

    it("reverts with ZeroAddress if any constructor address is address(0)", async () => {
      const { viem, identity, reputation, escrow, projectManager, admin } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ProjectManager", [
          zeroAddress,
          reputation.address,
          escrow.address,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        projectManager,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ProjectManager", [
          identity.address,
          zeroAddress,
          escrow.address,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        projectManager,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ProjectManager", [
          identity.address,
          reputation.address,
          zeroAddress,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        projectManager,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("ProjectManager", [
          identity.address,
          reputation.address,
          escrow.address,
          zeroAddress,
        ]) as unknown as Promise<`0x${string}`>,
        projectManager,
        "ZeroAddress",
      );
    });
  });

  describe("Full Happy Path (Open Marketplace)", () => {
    it("runs 2-milestone project end-to-end with upfront lock, 99%/1% splits, completion, and bilateral ratings", async () => {
      const {
        viem,
        token,
        reputation,
        escrow,
        projectManager,
        treasury,
        client,
        freelancer1,
        clientAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      const m0Amount = 1_000n * ONE_TUSD;
      const m1Amount = 2_000n * ONE_TUSD;
      const totalBudget = m0Amount + m1Amount;
      const clientBalanceStart = await token.read.balanceOf([client.account.address]);

      // 1. Client creates 2-milestone open marketplace project (targetFreelancerAgentId = 0)
      const createTx = projectManager.write.createProject(
        [
          clientAgentId,
          0n,
          "ipfs://project-brief-1",
          [m0Amount, m1Amount],
          [DUE_DATE_0, DUE_DATE_1],
          ["ipfs://milestone-0-spec", "ipfs://milestone-1-spec"],
        ],
        { account: client.account },
      );

      await viem.assertions.emitWithArgs(createTx, projectManager, "ProjectCreated", [
        1n,
        clientAgentId,
        0n,
        getAddress(client.account.address),
        totalBudget,
        2,
        "ipfs://project-brief-1",
      ]);

      assert.equal(await projectManager.read.totalProjects(), 1n);
      assert.equal(await token.read.balanceOf([escrow.address]), totalBudget);
      assert.equal(
        await token.read.balanceOf([client.account.address]),
        clientBalanceStart - totalBudget,
      );

      const projectAfterCreate = await projectManager.read.getProject([1n]);
      assert.equal(projectAfterCreate.projectId, 1n);
      assert.equal(projectAfterCreate.clientAgentId, clientAgentId);
      assert.equal(projectAfterCreate.freelancerAgentId, 0n);
      assert.equal(projectAfterCreate.client, getAddress(client.account.address));
      assert.equal(projectAfterCreate.freelancer, zeroAddress);
      assert.equal(projectAfterCreate.status, ProjectStatus.Open);
      assert.equal(projectAfterCreate.milestoneCount, 2);
      assert.equal(projectAfterCreate.settledCount, 0);
      assert.equal(projectAfterCreate.totalBudget, totalBudget);
      assert.equal(projectAfterCreate.metadataURI, "ipfs://project-brief-1");

      const allMilestones = await projectManager.read.getProjectMilestones([1n]);
      assert.equal(allMilestones.length, 2);
      assert.equal(allMilestones[0].amount, m0Amount);
      assert.equal(allMilestones[0].status, MilestoneStatus.Pending);
      assert.equal(allMilestones[1].amount, m1Amount);
      assert.equal(allMilestones[1].status, MilestoneStatus.Pending);

      assert.equal((await escrow.read.getEscrow([1n, 0n])).status, EscrowStatus.Locked);
      assert.equal((await escrow.read.getEscrow([1n, 1n])).status, EscrowStatus.Locked);

      // 2. Freelancer accepts project
      const acceptTx = projectManager.write.acceptProject([1n, freelancer1AgentId], {
        account: freelancer1.account,
      });
      await viem.assertions.emitWithArgs(acceptTx, projectManager, "ProjectAccepted", [
        1n,
        freelancer1AgentId,
        getAddress(freelancer1.account.address),
      ]);

      const projectAfterAccept = await projectManager.read.getProject([1n]);
      assert.equal(projectAfterAccept.status, ProjectStatus.Active);
      assert.equal(projectAfterAccept.freelancerAgentId, freelancer1AgentId);
      assert.equal(projectAfterAccept.freelancer, getAddress(freelancer1.account.address));

      // 3. Freelancer submits milestone 0
      const submit0Tx = projectManager.write.submitDeliverable(
        [1n, 0n, "ipfs://deliverable-0", DELIVERABLE_HASH_0],
        { account: freelancer1.account },
      );
      await viem.assertions.emitWithArgs(submit0Tx, projectManager, "DeliverableSubmitted", [
        1n,
        0n,
        "ipfs://deliverable-0",
        DELIVERABLE_HASH_0,
      ]);

      const m0Submitted = await projectManager.read.getMilestone([1n, 0n]);
      assert.equal(m0Submitted.status, MilestoneStatus.Submitted);
      assert.equal(m0Submitted.deliverableURI, "ipfs://deliverable-0");
      assert.equal(m0Submitted.deliverableHash, DELIVERABLE_HASH_0);
      assert.ok(m0Submitted.submittedAt > 0n);

      // 4. Client approves milestone 0 -> 99% to freelancer1, 1% to treasury
      const approve0Tx = projectManager.write.approveMilestone([1n, 0n], {
        account: client.account,
      });
      await viem.assertions.emitWithArgs(approve0Tx, projectManager, "MilestoneApproved", [
        1n,
        0n,
        m0Amount,
      ]);

      assert.equal(await token.read.balanceOf([freelancer1.account.address]), 990n * ONE_TUSD);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD);
      assert.equal((await projectManager.read.getMilestone([1n, 0n])).status, MilestoneStatus.Approved);
      assert.equal((await projectManager.read.getProject([1n])).settledCount, 1);
      assert.equal((await projectManager.read.getProject([1n])).status, ProjectStatus.Active);

      // 5. Freelancer submits milestone 1 & Client approves -> project transitions to Completed
      await projectManager.write.submitDeliverable(
        [1n, 1n, "ipfs://deliverable-1", DELIVERABLE_HASH_1],
        { account: freelancer1.account },
      );

      const approve1Tx = projectManager.write.approveMilestone([1n, 1n], {
        account: client.account,
      });
      await viem.assertions.emitWithArgs(approve1Tx, projectManager, "ProjectCompleted", [1n]);

      assert.equal(
        await token.read.balanceOf([freelancer1.account.address]),
        (990n + 1_980n) * ONE_TUSD,
      );
      assert.equal(await token.read.balanceOf([treasury.account.address]), (10n + 20n) * ONE_TUSD);
      assert.equal(await token.read.balanceOf([escrow.address]), 0n);

      const completedProject = await projectManager.read.getProject([1n]);
      assert.equal(completedProject.status, ProjectStatus.Completed);
      assert.equal(completedProject.settledCount, 2);

      // 6. Bilateral rateCounterparty updates ReputationRegistry for both Client and Freelancer
      const rateFreelancerM0 = projectManager.write.rateCounterparty(
        [1n, 0n, 95, "ipfs://review-f-m0", COMMENT_HASH_CLIENT],
        { account: client.account },
      );
      await viem.assertions.emitWithArgs(rateFreelancerM0, projectManager, "CounterpartyRated", [
        1n,
        0n,
        freelancer1AgentId,
        getAddress(client.account.address),
        95,
      ]);

      await projectManager.write.rateCounterparty(
        [1n, 1n, 85, "ipfs://review-f-m1", COMMENT_HASH_CLIENT],
        { account: client.account },
      );

      const rateClientM0 = projectManager.write.rateCounterparty(
        [1n, 0n, 90, "ipfs://review-c-m0", COMMENT_HASH_FREELANCER],
        { account: freelancer1.account },
      );
      await viem.assertions.emitWithArgs(rateClientM0, projectManager, "CounterpartyRated", [
        1n,
        0n,
        clientAgentId,
        getAddress(freelancer1.account.address),
        90,
      ]);

      const [fCount, fAvg] = await reputation.read.getSummary([freelancer1AgentId]);
      assert.equal(fCount, 2n);
      assert.equal(fAvg, 90); // (95 + 85) / 2

      const [cCount, cAvg] = await reputation.read.getSummary([clientAgentId]);
      assert.equal(cCount, 1n);
      assert.equal(cAvg, 90);

      const fFeedback0 = await reputation.read.getFeedback([freelancer1AgentId, 0n]);
      assert.equal(fFeedback0.reviewer, getAddress(client.account.address));
      assert.equal(fFeedback0.score, 95);
      assert.equal(fFeedback0.tag, await projectManager.read.TAG_MILESTONE());
    });
  });

  describe("Direct Hire Path", () => {
    it("restricts acceptance to the targeted freelancerAgentId", async () => {
      const {
        viem,
        projectManager,
        client,
        freelancer1,
        freelancer2,
        clientAgentId,
        freelancer1AgentId,
        freelancer2AgentId,
      } = await deployFixture();

      await projectManager.write.createProject(
        [
          clientAgentId,
          freelancer1AgentId,
          "ipfs://direct-hire-brief",
          [500n * ONE_TUSD],
          [DUE_DATE_0],
          ["ipfs://m0"],
        ],
        { account: client.account },
      );

      // Wrong freelancer cannot accept
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.acceptProject([1n, freelancer2AgentId], {
          account: freelancer2.account,
        }),
        projectManager,
        "NotTargetFreelancer",
        [1n, freelancer1AgentId, freelancer2AgentId],
      );

      // Targeted freelancer accepts cleanly
      const acceptTx = projectManager.write.acceptProject([1n, freelancer1AgentId], {
        account: freelancer1.account,
      });
      await viem.assertions.emitWithArgs(acceptTx, projectManager, "ProjectAccepted", [
        1n,
        freelancer1AgentId,
        getAddress(freelancer1.account.address),
      ]);

      const project = await projectManager.read.getProject([1n]);
      assert.equal(project.status, ProjectStatus.Active);
      assert.equal(project.freelancer, getAddress(freelancer1.account.address));
    });
  });

  describe("Self-Hiring Prevention", () => {
    it("blocks a wallet owning both Client and Freelancer NFTs from targeting self or accepting own project", async () => {
      const {
        viem,
        identity,
        projectManager,
        dualWallet,
        freelancer1,
        dualClientAgentId,
        dualFreelancerAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      // Cannot direct-hire own freelancerAgentId on createProject
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [
            dualClientAgentId,
            dualFreelancerAgentId,
            "ipfs://self-hire",
            [200n * ONE_TUSD],
            [DUE_DATE_0],
            ["ipfs://m0"],
          ],
          { account: dualWallet.account },
        ),
        projectManager,
        "SelfHiringNotAllowed",
        [dualClientAgentId, dualFreelancerAgentId],
      );

      // Create an open project as dualWallet
      await projectManager.write.createProject(
        [
          dualClientAgentId,
          0n,
          "ipfs://open-by-dual",
          [200n * ONE_TUSD],
          [DUE_DATE_0],
          ["ipfs://m0"],
        ],
        { account: dualWallet.account },
      );

      // Same wallet cannot accept its own project with its Freelancer NFT
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.acceptProject([1n, dualFreelancerAgentId], {
          account: dualWallet.account,
        }),
        projectManager,
        "SelfHiringNotAllowed",
        [dualClientAgentId, dualFreelancerAgentId],
      );

      // Another wallet approved as operator on the client's NFT also cannot accept
      await identity.write.approve([freelancer1.account.address, dualClientAgentId], {
        account: dualWallet.account,
      });
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.acceptProject([1n, freelancer1AgentId], {
          account: freelancer1.account,
        }),
        projectManager,
        "SelfHiringNotAllowed",
        [dualClientAgentId, freelancer1AgentId],
      );
    });
  });

  describe("Cancellation Path", () => {
    it("allows client to cancel an Open project for 100% (0% fee) refund and blocks cancel after Active", async () => {
      const {
        viem,
        token,
        escrow,
        projectManager,
        treasury,
        client,
        freelancer1,
        stranger,
        clientAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      const clientInitial = await token.read.balanceOf([client.account.address]);
      const amounts = [300n * ONE_TUSD, 700n * ONE_TUSD];
      const total = 1_000n * ONE_TUSD;

      await projectManager.write.createProject(
        [
          clientAgentId,
          0n,
          "ipfs://cancel-me",
          amounts,
          [DUE_DATE_0, DUE_DATE_1],
          ["ipfs://m0", "ipfs://m1"],
        ],
        { account: client.account },
      );

      // Non-client cannot cancel
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.cancelProject([1n], { account: stranger.account }),
        projectManager,
        "UnauthorizedParticipant",
        [getAddress(stranger.account.address), 1n],
      );

      // Client cancels Open project -> 100% refund, 0% fee
      const cancelTx = projectManager.write.cancelProject([1n], { account: client.account });
      await viem.assertions.emitWithArgs(cancelTx, projectManager, "ProjectCancelled", [
        1n,
        getAddress(client.account.address),
        total,
      ]);

      assert.equal(await token.read.balanceOf([client.account.address]), clientInitial);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
      assert.equal(await token.read.balanceOf([escrow.address]), 0n);
      assert.equal((await projectManager.read.getProject([1n])).status, ProjectStatus.Cancelled);
      assert.equal((await escrow.read.getEscrow([1n, 0n])).status, EscrowStatus.Refunded);
      assert.equal((await escrow.read.getEscrow([1n, 1n])).status, EscrowStatus.Refunded);

      // Cannot cancel already-cancelled project
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.cancelProject([1n], { account: client.account }),
        projectManager,
        "InvalidProjectStatus",
        [1n, ProjectStatus.Cancelled, ProjectStatus.Open],
      );

      // Create project 2 and accept it -> Active project cannot be cancelled
      await projectManager.write.createProject(
        [clientAgentId, 0n, "ipfs://active-proj", [500n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
        { account: client.account },
      );
      await projectManager.write.acceptProject([2n, freelancer1AgentId], {
        account: freelancer1.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.cancelProject([2n], { account: client.account }),
        projectManager,
        "InvalidProjectStatus",
        [2n, ProjectStatus.Active, ProjectStatus.Open],
      );
    });
  });

  describe("Dispute Hook Path (DISPUTE_RESOLVER_ROLE)", () => {
    it("marks Submitted milestones as Disputed, resolves release & refund, completes project, and enables bilateral ratings", async () => {
      const {
        viem,
        token,
        reputation,
        projectManager,
        pmDisputeRole,
        treasury,
        disputeResolver,
        client,
        freelancer1,
        stranger,
        clientAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      const m0Amount = 1_000n * ONE_TUSD;
      const m1Amount = 500n * ONE_TUSD;

      await projectManager.write.createProject(
        [
          clientAgentId,
          0n,
          "ipfs://disputed-project",
          [m0Amount, m1Amount],
          [DUE_DATE_0, DUE_DATE_1],
          ["ipfs://m0", "ipfs://m1"],
        ],
        { account: client.account },
      );
      await projectManager.write.acceptProject([1n, freelancer1AgentId], {
        account: freelancer1.account,
      });

      // Cannot dispute a Pending milestone
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.markMilestoneDisputed([1n, 0n], {
          account: disputeResolver.account,
        }),
        projectManager,
        "InvalidMilestoneStatus",
        [1n, 0n, MilestoneStatus.Pending],
      );

      // Submit both milestones
      await projectManager.write.submitDeliverable(
        [1n, 0n, "ipfs://deliv-0", DELIVERABLE_HASH_0],
        { account: freelancer1.account },
      );
      await projectManager.write.submitDeliverable(
        [1n, 1n, "ipfs://deliv-1", DELIVERABLE_HASH_1],
        { account: freelancer1.account },
      );

      // Unauthorized caller cannot mark disputed or resolve
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.markMilestoneDisputed([1n, 0n], { account: stranger.account }),
        projectManager,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), pmDisputeRole],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.resolveDisputedMilestone([1n, 0n, true], {
          account: stranger.account,
        }),
        projectManager,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), pmDisputeRole],
      );

      // Mark milestone 0 as Disputed
      const dispute0Tx = projectManager.write.markMilestoneDisputed([1n, 0n], {
        account: disputeResolver.account,
      });
      await viem.assertions.emitWithArgs(dispute0Tx, projectManager, "MilestoneDisputed", [1n, 0n]);
      assert.equal((await projectManager.read.getMilestone([1n, 0n])).status, MilestoneStatus.Disputed);

      // Resolve milestone 0 in favor of freelancer (releaseToFreelancer = true) -> 99% to freelancer, 1% to treasury
      const resolve0Tx = projectManager.write.resolveDisputedMilestone([1n, 0n, true], {
        account: disputeResolver.account,
      });
      await viem.assertions.emitWithArgs(resolve0Tx, projectManager, "MilestoneDisputeResolved", [
        1n,
        0n,
        true,
      ]);

      assert.equal(await token.read.balanceOf([freelancer1.account.address]), 990n * ONE_TUSD);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD);
      assert.equal(
        (await projectManager.read.getMilestone([1n, 0n])).status,
        MilestoneStatus.ResolvedRelease,
      );
      assert.equal((await projectManager.read.getProject([1n])).status, ProjectStatus.Active);

      // Mark milestone 1 as Disputed and resolve in favor of client (releaseToFreelancer = false) -> 100% refund
      const clientBeforeRefund = await token.read.balanceOf([client.account.address]);
      await projectManager.write.markMilestoneDisputed([1n, 1n], {
        account: disputeResolver.account,
      });

      const resolve1Tx = projectManager.write.resolveDisputedMilestone([1n, 1n, false], {
        account: disputeResolver.account,
      });
      await viem.assertions.emitWithArgs(resolve1Tx, projectManager, "MilestoneDisputeResolved", [
        1n,
        1n,
        false,
      ]);

      assert.equal(
        await token.read.balanceOf([client.account.address]),
        clientBeforeRefund + m1Amount,
      );
      assert.equal(await token.read.balanceOf([treasury.account.address]), 10n * ONE_TUSD); // unchanged (0% fee on refund)
      assert.equal(
        (await projectManager.read.getMilestone([1n, 1n])).status,
        MilestoneStatus.ResolvedRefund,
      );

      // Both milestones settled -> project transitions to Completed
      const project = await projectManager.read.getProject([1n]);
      assert.equal(project.status, ProjectStatus.Completed);
      assert.equal(project.settledCount, 2);

      // Bilateral rating works on both ResolvedRelease and ResolvedRefund milestones
      await projectManager.write.rateCounterparty(
        [1n, 0n, 70, "ipfs://dispute-rate-f", COMMENT_HASH_CLIENT],
        { account: client.account },
      );
      await projectManager.write.rateCounterparty(
        [1n, 1n, 40, "ipfs://dispute-rate-c", COMMENT_HASH_FREELANCER],
        { account: freelancer1.account },
      );

      const [fCount, fAvg] = await reputation.read.getSummary([freelancer1AgentId]);
      assert.equal(fCount, 1n);
      assert.equal(fAvg, 70);

      const [cCount, cAvg] = await reputation.read.getSummary([clientAgentId]);
      assert.equal(cCount, 1n);
      assert.equal(cAvg, 40);
    });
  });

  describe("Validation & Error Edge Cases", () => {
    it("validates createProject inputs (agent role/active, auth, milestone count, array lengths, amounts, URIs)", async () => {
      const {
        viem,
        identity,
        projectManager,
        client,
        freelancer1,
        stranger,
        clientAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      // Unauthorized caller for clientAgentId
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", [100n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
          { account: stranger.account },
        ),
        projectManager,
        "UnauthorizedAgent",
        [getAddress(stranger.account.address), clientAgentId],
      );

      // Non-client role (Freelancer trying to create project)
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [freelancer1AgentId, 0n, "ipfs://p", [100n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
          { account: freelancer1.account },
        ),
        projectManager,
        "InvalidAgentRoleOrInactive",
        [freelancer1AgentId],
      );

      // Inactive client cannot create project
      await identity.write.setActive([clientAgentId, false], { account: client.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", [100n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
          { account: client.account },
        ),
        projectManager,
        "InvalidAgentRoleOrInactive",
        [clientAgentId],
      );
      await identity.write.setActive([clientAgentId, true], { account: client.account });

      // Non-existent target freelancer
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [clientAgentId, 999n, "ipfs://p", [100n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
          { account: client.account },
        ),
        projectManager,
        "InvalidAgentRoleOrInactive",
        [999n],
      );

      // Inactive target freelancer
      await identity.write.setActive([freelancer1AgentId, false], { account: freelancer1.account });
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [
            clientAgentId,
            freelancer1AgentId,
            "ipfs://p",
            [100n * ONE_TUSD],
            [DUE_DATE_0],
            ["ipfs://m0"],
          ],
          { account: client.account },
        ),
        projectManager,
        "InvalidAgentRoleOrInactive",
        [freelancer1AgentId],
      );
      await identity.write.setActive([freelancer1AgentId, true], { account: freelancer1.account });

      // Empty metadataURI
      await viem.assertions.revertWithCustomError(
        projectManager.write.createProject(
          [clientAgentId, 0n, "", [100n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
          { account: client.account },
        ),
        projectManager,
        "EmptyURI",
      );

      // 0 milestones
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject([clientAgentId, 0n, "ipfs://p", [], [], []], {
          account: client.account,
        }),
        projectManager,
        "InvalidMilestoneCount",
        [0n],
      );

      // > MAX_MILESTONES (21 milestones)
      const twentyOneAmounts = Array(21).fill(10n * ONE_TUSD);
      const twentyOneDates = Array(21).fill(DUE_DATE_0);
      const twentyOneUris = Array(21).fill("ipfs://m");
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", twentyOneAmounts, twentyOneDates, twentyOneUris],
          { account: client.account },
        ),
        projectManager,
        "InvalidMilestoneCount",
        [21n],
      );

      // Mismatched array lengths
      await viem.assertions.revertWithCustomError(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", [100n * ONE_TUSD, 200n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0", "ipfs://m1"]],
          { account: client.account },
        ),
        projectManager,
        "ArrayLengthMismatch",
      );

      await viem.assertions.revertWithCustomError(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", [100n * ONE_TUSD, 200n * ONE_TUSD], [DUE_DATE_0, DUE_DATE_1], ["ipfs://m0"]],
          { account: client.account },
        ),
        projectManager,
        "ArrayLengthMismatch",
      );

      // Zero milestone amount
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.createProject(
          [
            clientAgentId,
            0n,
            "ipfs://p",
            [100n * ONE_TUSD, 0n],
            [DUE_DATE_0, DUE_DATE_1],
            ["ipfs://m0", "ipfs://m1"],
          ],
          { account: client.account },
        ),
        projectManager,
        "ZeroMilestoneAmount",
        [1n],
      );

      // Empty milestone descriptionURI
      await viem.assertions.revertWithCustomError(
        projectManager.write.createProject(
          [clientAgentId, 0n, "ipfs://p", [100n * ONE_TUSD], [DUE_DATE_0], [""]],
          { account: client.account },
        ),
        projectManager,
        "EmptyURI",
      );
    });

    it("enforces deliverable, approval, rating, and query error conditions including duplicate rating revert", async () => {
      const {
        viem,
        reputation,
        projectManager,
        client,
        freelancer1,
        stranger,
        clientAgentId,
        freelancer1AgentId,
      } = await deployFixture();

      // Unknown project ID reverts ProjectNotFound
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.read.getProject([0n]),
        projectManager,
        "ProjectNotFound",
        [0n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.read.getProject([99n]),
        projectManager,
        "ProjectNotFound",
        [99n],
      );

      // Create & accept a 1-milestone project
      await projectManager.write.createProject(
        [clientAgentId, 0n, "ipfs://p1", [500n * ONE_TUSD], [DUE_DATE_0], ["ipfs://m0"]],
        { account: client.account },
      );

      // Cannot submit deliverable while project is still Open
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.submitDeliverable(
          [1n, 0n, "ipfs://d0", DELIVERABLE_HASH_0],
          { account: freelancer1.account },
        ),
        projectManager,
        "InvalidProjectStatus",
        [1n, ProjectStatus.Open, ProjectStatus.Active],
      );

      await projectManager.write.acceptProject([1n, freelancer1AgentId], {
        account: freelancer1.account,
      });

      // Unauthorized submitter (client or stranger)
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.submitDeliverable(
          [1n, 0n, "ipfs://d0", DELIVERABLE_HASH_0],
          { account: client.account },
        ),
        projectManager,
        "UnauthorizedParticipant",
        [getAddress(client.account.address), 1n],
      );

      // Empty deliverable URI
      await viem.assertions.revertWithCustomError(
        projectManager.write.submitDeliverable([1n, 0n, "", DELIVERABLE_HASH_0], {
          account: freelancer1.account,
        }),
        projectManager,
        "EmptyURI",
      );

      // Zero deliverable hash
      await viem.assertions.revertWithCustomError(
        projectManager.write.submitDeliverable([1n, 0n, "ipfs://d0", zeroHash], {
          account: freelancer1.account,
        }),
        projectManager,
        "EmptyDeliverableHash",
      );

      // Out-of-bounds milestone index
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.submitDeliverable(
          [1n, 5n, "ipfs://d0", DELIVERABLE_HASH_0],
          { account: freelancer1.account },
        ),
        projectManager,
        "MilestoneNotFound",
        [1n, 5n],
      );

      // Cannot approve before submission
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.approveMilestone([1n, 0n], { account: client.account }),
        projectManager,
        "InvalidMilestoneStatus",
        [1n, 0n, MilestoneStatus.Pending],
      );

      // Cannot rate before settlement
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.rateCounterparty([1n, 0n, 90, "ipfs://r", COMMENT_HASH_CLIENT], {
          account: client.account,
        }),
        projectManager,
        "MilestoneNotSettled",
        [1n, 0n],
      );

      // Submit deliverable cleanly
      await projectManager.write.submitDeliverable(
        [1n, 0n, "ipfs://d0", DELIVERABLE_HASH_0],
        { account: freelancer1.account },
      );

      // Unauthorized approver (freelancer1 or stranger)
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.approveMilestone([1n, 0n], { account: freelancer1.account }),
        projectManager,
        "UnauthorizedParticipant",
        [getAddress(freelancer1.account.address), 1n],
      );

      // Approve milestone
      await projectManager.write.approveMilestone([1n, 0n], { account: client.account });

      // Unauthorized rater (stranger)
      await viem.assertions.revertWithCustomErrorWithArgs(
        projectManager.write.rateCounterparty([1n, 0n, 80, "ipfs://r", COMMENT_HASH_CLIENT], {
          account: stranger.account,
        }),
        projectManager,
        "UnauthorizedParticipant",
        [getAddress(stranger.account.address), 1n],
      );

      // First rating succeeds, duplicate rating reverts via ReputationRegistry.DuplicateFeedback
      await projectManager.write.rateCounterparty([1n, 0n, 95, "ipfs://r1", COMMENT_HASH_CLIENT], {
        account: client.account,
      });

      await viem.assertions.revertWithCustomError(
        projectManager.write.rateCounterparty([1n, 0n, 95, "ipfs://r2", COMMENT_HASH_CLIENT], {
          account: client.account,
        }),
        reputation,
        "DuplicateFeedback",
      );
    });
  });
});
