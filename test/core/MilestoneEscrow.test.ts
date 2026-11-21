import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, zeroAddress } from "viem";

const EscrowStatus = {
  Unfunded: 0,
  Locked: 1,
  Released: 2,
  Refunded: 3,
} as const;

const ONE_TUSD = 1_000_000n; // 6 decimals

describe("MilestoneEscrow", () => {
  async function deployFixture() {
    const { viem } = await hre.network.connect();
    const [admin, projectManager, disputeResolver, treasury, payer, recipient, stranger] =
      await viem.getWalletClients();

    const token = await viem.deployContract("MockTUSD8");
    const escrow = await viem.deployContract("MilestoneEscrow", [
      token.address,
      treasury.account.address,
      100, // 1% default fee
      admin.account.address,
    ]);

    const projectManagerRole = await escrow.read.PROJECT_MANAGER_ROLE();
    const disputeResolverRole = await escrow.read.DISPUTE_RESOLVER_ROLE();
    const defaultAdminRole = await escrow.read.DEFAULT_ADMIN_ROLE();

    await escrow.write.grantRole([projectManagerRole, projectManager.account.address], {
      account: admin.account,
    });
    await escrow.write.grantRole([disputeResolverRole, disputeResolver.account.address], {
      account: admin.account,
    });

    // Mint tUSD8 to payer and approve escrow
    const initialSupply = 10_000n * ONE_TUSD;
    await token.write.mint([payer.account.address, initialSupply]);
    await token.write.approve([escrow.address, initialSupply], {
      account: payer.account,
    });

    return {
      viem,
      token,
      escrow,
      projectManagerRole,
      disputeResolverRole,
      defaultAdminRole,
      admin,
      projectManager,
      disputeResolver,
      treasury,
      payer,
      recipient,
      stranger,
    };
  }

  describe("Constructor", () => {
    it("sets token, treasury, feeBps, constants, and grants DEFAULT_ADMIN_ROLE", async () => {
      const { token, escrow, defaultAdminRole, admin, treasury } = await deployFixture();

      assert.equal(await escrow.read.token(), getAddress(token.address));
      assert.equal(await escrow.read.treasury(), getAddress(treasury.account.address));
      assert.equal(await escrow.read.feeBps(), 100);
      assert.equal(await escrow.read.MAX_FEE_BPS(), 500);
      assert.equal(await escrow.read.BPS_DENOMINATOR(), 10_000);
      assert.equal(await escrow.read.hasRole([defaultAdminRole, admin.account.address]), true);
    });

    it("reverts with ZeroAddress if token, treasury, or admin is address(0)", async () => {
      const { viem, token, escrow, admin, treasury } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        viem.deployContract("MilestoneEscrow", [
          zeroAddress,
          treasury.account.address,
          100,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        escrow,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("MilestoneEscrow", [
          token.address,
          zeroAddress,
          100,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        escrow,
        "ZeroAddress",
      );

      await viem.assertions.revertWithCustomError(
        viem.deployContract("MilestoneEscrow", [
          token.address,
          treasury.account.address,
          100,
          zeroAddress,
        ]) as unknown as Promise<`0x${string}`>,
        escrow,
        "ZeroAddress",
      );
    });

    it("reverts with FeeTooHigh if initial feeBps exceeds MAX_FEE_BPS (500)", async () => {
      const { viem, token, escrow, admin, treasury } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        viem.deployContract("MilestoneEscrow", [
          token.address,
          treasury.account.address,
          501,
          admin.account.address,
        ]) as unknown as Promise<`0x${string}`>,
        escrow,
        "FeeTooHigh",
        [501],
      );
    });
  });

  describe("setFeeConfig", () => {
    it("allows admin to update feeBps (0..MAX_FEE_BPS) and treasury and emits FeeConfigUpdated", async () => {
      const { viem, escrow, admin, stranger } = await deployFixture();

      const tx1 = escrow.write.setFeeConfig([250, stranger.account.address], {
        account: admin.account,
      });
      await viem.assertions.emitWithArgs(tx1, escrow, "FeeConfigUpdated", [
        250,
        getAddress(stranger.account.address),
      ]);

      assert.equal(await escrow.read.feeBps(), 250);
      assert.equal(await escrow.read.treasury(), getAddress(stranger.account.address));

      // Boundary values: 0 bps and MAX_FEE_BPS (500)
      await escrow.write.setFeeConfig([0, stranger.account.address], { account: admin.account });
      assert.equal(await escrow.read.feeBps(), 0);

      await escrow.write.setFeeConfig([500, stranger.account.address], { account: admin.account });
      assert.equal(await escrow.read.feeBps(), 500);
    });

    it("reverts with FeeTooHigh when newFeeBps > MAX_FEE_BPS", async () => {
      const { viem, escrow, admin, treasury } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.setFeeConfig([501, treasury.account.address], { account: admin.account }),
        escrow,
        "FeeTooHigh",
        [501],
      );
    });

    it("reverts with ZeroAddress when newTreasury is address(0)", async () => {
      const { viem, escrow, admin } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        escrow.write.setFeeConfig([100, zeroAddress], { account: admin.account }),
        escrow,
        "ZeroAddress",
      );
    });

    it("reverts when called by a non-admin", async () => {
      const { viem, escrow, defaultAdminRole, treasury, stranger } = await deployFixture();

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.setFeeConfig([200, treasury.account.address], { account: stranger.account }),
        escrow,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), defaultAdminRole],
      );
    });
  });

  describe("fundProjectMilestones", () => {
    it("pulls total tUSD8 from payer, sets all records to Locked, and emits ProjectFunded", async () => {
      const { viem, token, escrow, projectManager, payer } = await deployFixture();

      const amounts = [500n * ONE_TUSD, 1_500n * ONE_TUSD, 250n * ONE_TUSD];
      const totalAmount = 2_250n * ONE_TUSD;
      const payerBefore = await token.read.balanceOf([payer.account.address]);

      const tx = escrow.write.fundProjectMilestones([1n, payer.account.address, amounts], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "ProjectFunded", [
        1n,
        getAddress(payer.account.address),
        totalAmount,
        3n,
      ]);

      assert.equal(await token.read.balanceOf([escrow.address]), totalAmount);
      assert.equal(await token.read.balanceOf([payer.account.address]), payerBefore - totalAmount);

      for (let i = 0; i < amounts.length; i++) {
        const record = await escrow.read.getEscrow([1n, BigInt(i)]);
        assert.equal(record.amount, amounts[i]);
        assert.equal(record.payer, getAddress(payer.account.address));
        assert.equal(record.status, EscrowStatus.Locked);
      }
    });

    it("reverts when called by non-manager, empty array, zero amount, zero payer, or already-funded project", async () => {
      const { viem, escrow, projectManagerRole, projectManager, disputeResolver, payer, stranger } =
        await deployFixture();

      // Non-manager (stranger and disputeResolver)
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD]], {
          account: stranger.account,
        }),
        escrow,
        "AccessControlUnauthorizedAccount",
        [getAddress(stranger.account.address), projectManagerRole],
      );

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD]], {
          account: disputeResolver.account,
        }),
        escrow,
        "AccessControlUnauthorizedAccount",
        [getAddress(disputeResolver.account.address), projectManagerRole],
      );

      // Zero payer
      await viem.assertions.revertWithCustomError(
        escrow.write.fundProjectMilestones([1n, zeroAddress, [100n * ONE_TUSD]], {
          account: projectManager.account,
        }),
        escrow,
        "ZeroAddress",
      );

      // Empty milestones
      await viem.assertions.revertWithCustomError(
        escrow.write.fundProjectMilestones([1n, payer.account.address, []], {
          account: projectManager.account,
        }),
        escrow,
        "EmptyMilestones",
      );

      // Zero amount in array
      await viem.assertions.revertWithCustomError(
        escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD, 0n]], {
          account: projectManager.account,
        }),
        escrow,
        "ZeroAmount",
      );

      // Fund once cleanly, then attempt duplicate funding
      await escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD]], {
        account: projectManager.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD]], {
          account: projectManager.account,
        }),
        escrow,
        "AlreadyFunded",
        [1n],
      );
    });
  });

  describe("releaseMilestone", () => {
    it("releases via PROJECT_MANAGER_ROLE with 1% fee to treasury and 99% to recipient", async () => {
      const { viem, token, escrow, projectManager, treasury, payer, recipient } =
        await deployFixture();

      const amount = 1_000n * ONE_TUSD;
      const expectedFee = 10n * ONE_TUSD;
      const expectedPayout = 990n * ONE_TUSD;

      await escrow.write.fundProjectMilestones([1n, payer.account.address, [amount]], {
        account: projectManager.account,
      });

      const tx = escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "MilestoneReleased", [
        1n,
        0n,
        getAddress(recipient.account.address),
        expectedPayout,
        expectedFee,
      ]);

      assert.equal(await token.read.balanceOf([recipient.account.address]), expectedPayout);
      assert.equal(await token.read.balanceOf([treasury.account.address]), expectedFee);
      assert.equal(await token.read.balanceOf([escrow.address]), 0n);

      const record = await escrow.read.getEscrow([1n, 0n]);
      assert.equal(record.status, EscrowStatus.Released);
    });

    it("releases via DISPUTE_RESOLVER_ROLE with 1% fee to treasury and 99% to recipient", async () => {
      const { viem, token, escrow, projectManager, disputeResolver, treasury, payer, recipient } =
        await deployFixture();

      const amount = 500n * ONE_TUSD;
      const expectedFee = 5n * ONE_TUSD;
      const expectedPayout = 495n * ONE_TUSD;

      await escrow.write.fundProjectMilestones([1n, payer.account.address, [amount]], {
        account: projectManager.account,
      });

      const tx = escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: disputeResolver.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "MilestoneReleased", [
        1n,
        0n,
        getAddress(recipient.account.address),
        expectedPayout,
        expectedFee,
      ]);

      assert.equal(await token.read.balanceOf([recipient.account.address]), expectedPayout);
      assert.equal(await token.read.balanceOf([treasury.account.address]), expectedFee);
      assert.equal((await escrow.read.getEscrow([1n, 0n])).status, EscrowStatus.Released);
    });

    it("transfers 100% to recipient when feeBps is set to 0", async () => {
      const { viem, token, escrow, admin, projectManager, treasury, payer, recipient } =
        await deployFixture();

      await escrow.write.setFeeConfig([0, treasury.account.address], { account: admin.account });

      const amount = 300n * ONE_TUSD;
      await escrow.write.fundProjectMilestones([1n, payer.account.address, [amount]], {
        account: projectManager.account,
      });

      const tx = escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "MilestoneReleased", [
        1n,
        0n,
        getAddress(recipient.account.address),
        amount,
        0n,
      ]);

      assert.equal(await token.read.balanceOf([recipient.account.address]), amount);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
    });

    it("reverts on double-release, non-locked, zero recipient, and unauthorized caller", async () => {
      const { viem, escrow, projectManager, payer, recipient, stranger } = await deployFixture();

      await escrow.write.fundProjectMilestones(
        [1n, payer.account.address, [100n * ONE_TUSD, 200n * ONE_TUSD]],
        { account: projectManager.account },
      );

      // Unauthorized caller
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
          account: stranger.account,
        }),
        escrow,
        "UnauthorizedCaller",
        [getAddress(stranger.account.address)],
      );

      // Zero recipient
      await viem.assertions.revertWithCustomError(
        escrow.write.releaseMilestone([1n, 0n, zeroAddress], {
          account: projectManager.account,
        }),
        escrow,
        "ZeroAddress",
      );

      // Non-locked (Unfunded milestone)
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.releaseMilestone([1n, 9n, recipient.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 9n, EscrowStatus.Unfunded],
      );

      // Release once, then double-release
      await escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: projectManager.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 0n, EscrowStatus.Released],
      );

      // Refund milestone 1, then attempt release on Refunded record
      await escrow.write.refundMilestone([1n, 1n, payer.account.address], {
        account: projectManager.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.releaseMilestone([1n, 1n, recipient.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 1n, EscrowStatus.Refunded],
      );
    });
  });

  describe("refundMilestone", () => {
    it("refunds 100% (0% fee) via PROJECT_MANAGER_ROLE and DISPUTE_RESOLVER_ROLE", async () => {
      const { viem, token, escrow, projectManager, disputeResolver, treasury, payer } =
        await deployFixture();

      const m0 = 400n * ONE_TUSD;
      const m1 = 600n * ONE_TUSD;

      await escrow.write.fundProjectMilestones([1n, payer.account.address, [m0, m1]], {
        account: projectManager.account,
      });

      const payerAfterFund = await token.read.balanceOf([payer.account.address]);

      // Refund milestone 0 via PROJECT_MANAGER_ROLE
      const tx0 = escrow.write.refundMilestone([1n, 0n, payer.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx0, escrow, "MilestoneRefunded", [
        1n,
        0n,
        getAddress(payer.account.address),
        m0,
      ]);

      assert.equal(await token.read.balanceOf([payer.account.address]), payerAfterFund + m0);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
      assert.equal((await escrow.read.getEscrow([1n, 0n])).status, EscrowStatus.Refunded);

      // Refund milestone 1 via DISPUTE_RESOLVER_ROLE
      const tx1 = escrow.write.refundMilestone([1n, 1n, payer.account.address], {
        account: disputeResolver.account,
      });
      await viem.assertions.emitWithArgs(tx1, escrow, "MilestoneRefunded", [
        1n,
        1n,
        getAddress(payer.account.address),
        m1,
      ]);

      assert.equal(await token.read.balanceOf([payer.account.address]), payerAfterFund + m0 + m1);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
      assert.equal(await token.read.balanceOf([escrow.address]), 0n);
      assert.equal((await escrow.read.getEscrow([1n, 1n])).status, EscrowStatus.Refunded);
    });

    it("reverts on already-released, already-refunded, unfunded, zero recipient, and unauthorized caller", async () => {
      const { viem, escrow, projectManager, payer, recipient, stranger } = await deployFixture();

      await escrow.write.fundProjectMilestones(
        [1n, payer.account.address, [100n * ONE_TUSD, 200n * ONE_TUSD]],
        { account: projectManager.account },
      );

      // Unauthorized caller
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundMilestone([1n, 0n, payer.account.address], {
          account: stranger.account,
        }),
        escrow,
        "UnauthorizedCaller",
        [getAddress(stranger.account.address)],
      );

      // Zero recipient
      await viem.assertions.revertWithCustomError(
        escrow.write.refundMilestone([1n, 0n, zeroAddress], {
          account: projectManager.account,
        }),
        escrow,
        "ZeroAddress",
      );

      // Unfunded
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundMilestone([1n, 5n, payer.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 5n, EscrowStatus.Unfunded],
      );

      // Already released
      await escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundMilestone([1n, 0n, payer.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 0n, EscrowStatus.Released],
      );

      // Already refunded
      await escrow.write.refundMilestone([1n, 1n, payer.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundMilestone([1n, 1n, payer.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "EscrowNotLocked",
        [1n, 1n, EscrowStatus.Refunded],
      );
    });
  });

  describe("refundAllLockedMilestones", () => {
    it("refunds all locked milestones in a single 0%-fee transfer and emits ProjectRefunded", async () => {
      const { viem, token, escrow, projectManager, treasury, payer } = await deployFixture();

      const amounts = [250n * ONE_TUSD, 500n * ONE_TUSD, 750n * ONE_TUSD];
      const total = 1_500n * ONE_TUSD;
      const payerInitial = await token.read.balanceOf([payer.account.address]);

      await escrow.write.fundProjectMilestones([1n, payer.account.address, amounts], {
        account: projectManager.account,
      });

      const tx = escrow.write.refundAllLockedMilestones([1n, 3n, payer.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "ProjectRefunded", [
        1n,
        getAddress(payer.account.address),
        total,
      ]);

      assert.equal(await token.read.balanceOf([payer.account.address]), payerInitial);
      assert.equal(await token.read.balanceOf([treasury.account.address]), 0n);
      assert.equal(await token.read.balanceOf([escrow.address]), 0n);

      for (let i = 0; i < 3; i++) {
        assert.equal((await escrow.read.getEscrow([1n, BigInt(i)])).status, EscrowStatus.Refunded);
      }
    });

    it("refunds only remaining locked milestones when some were already released", async () => {
      const { viem, token, escrow, projectManager, payer, recipient } = await deployFixture();

      await escrow.write.fundProjectMilestones(
        [1n, payer.account.address, [200n * ONE_TUSD, 300n * ONE_TUSD, 500n * ONE_TUSD]],
        { account: projectManager.account },
      );

      // Release milestone 0 first
      await escrow.write.releaseMilestone([1n, 0n, recipient.account.address], {
        account: projectManager.account,
      });

      const payerBefore = await token.read.balanceOf([payer.account.address]);

      const tx = escrow.write.refundAllLockedMilestones([1n, 3n, payer.account.address], {
        account: projectManager.account,
      });
      await viem.assertions.emitWithArgs(tx, escrow, "ProjectRefunded", [
        1n,
        getAddress(payer.account.address),
        800n * ONE_TUSD,
      ]);

      assert.equal(
        await token.read.balanceOf([payer.account.address]),
        payerBefore + 800n * ONE_TUSD,
      );
      assert.equal((await escrow.read.getEscrow([1n, 0n])).status, EscrowStatus.Released);
      assert.equal((await escrow.read.getEscrow([1n, 1n])).status, EscrowStatus.Refunded);
      assert.equal((await escrow.read.getEscrow([1n, 2n])).status, EscrowStatus.Refunded);
    });

    it("reverts with NothingToRefund, ZeroAddress, or AccessControlUnauthorizedAccount", async () => {
      const { viem, escrow, projectManagerRole, projectManager, disputeResolver, payer } =
        await deployFixture();

      await escrow.write.fundProjectMilestones([1n, payer.account.address, [100n * ONE_TUSD]], {
        account: projectManager.account,
      });

      // Non-manager (including disputeResolver) cannot call refundAllLockedMilestones
      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundAllLockedMilestones([1n, 1n, payer.account.address], {
          account: disputeResolver.account,
        }),
        escrow,
        "AccessControlUnauthorizedAccount",
        [getAddress(disputeResolver.account.address), projectManagerRole],
      );

      // Zero recipient
      await viem.assertions.revertWithCustomError(
        escrow.write.refundAllLockedMilestones([1n, 1n, zeroAddress], {
          account: projectManager.account,
        }),
        escrow,
        "ZeroAddress",
      );

      // Refund all once, then second attempt reverts NothingToRefund
      await escrow.write.refundAllLockedMilestones([1n, 1n, payer.account.address], {
        account: projectManager.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        escrow.write.refundAllLockedMilestones([1n, 1n, payer.account.address], {
          account: projectManager.account,
        }),
        escrow,
        "NothingToRefund",
        [1n],
      );
    });
  });
});
