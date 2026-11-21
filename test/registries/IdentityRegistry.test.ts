import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { getAddress, stringToHex, toHex } from "viem";

const AgentRole = {
  Client: 0,
  Freelancer: 1,
  Arbiter: 2,
} as const;

describe("IdentityRegistry", () => {
  async function deployFixture() {
    const { viem } = await hre.network.connect();
    const [alice, bob, carol, dave] = await viem.getWalletClients();
    const identity = await viem.deployContract("IdentityRegistry");
    return { viem, identity, alice, bob, carol, dave };
  }

  describe("Deployment & Registration", () => {
    it("sets ERC-721 name/symbol and starts with zero agents and zero active arbiters", async () => {
      const { identity } = await deployFixture();

      assert.equal(await identity.read.name(), "Trellis Agent Identity");
      assert.equal(await identity.read.symbol(), "TRELLIS-ID");
      assert.equal(await identity.read.totalAgents(), 0n);
      assert.equal(await identity.read.getActiveArbiterCount(), 0n);
      assert.deepEqual(await identity.read.getActiveArbiters(), []);
      assert.equal(await identity.read.agentExists([0n]), false);
      assert.equal(await identity.read.agentExists([1n]), false);
    });

    it("mints Client, Freelancer, and Arbiter NFTs with 1-indexed IDs, URIs, and totalAgents", async () => {
      const { viem, identity, alice, bob, carol } = await deployFixture();

      const tx1 = identity.write.register(["ipfs://client-1", AgentRole.Client], {
        account: alice.account,
      });
      await viem.assertions.emitWithArgs(tx1, identity, "AgentRegistered", [
        1n,
        getAddress(alice.account.address),
        AgentRole.Client,
        "ipfs://client-1",
      ]);

      const tx2 = identity.write.register(["ipfs://freelancer-2", AgentRole.Freelancer], {
        account: bob.account,
      });
      await viem.assertions.emitWithArgs(tx2, identity, "AgentRegistered", [
        2n,
        getAddress(bob.account.address),
        AgentRole.Freelancer,
        "ipfs://freelancer-2",
      ]);

      const tx3 = identity.write.register(["ipfs://arbiter-3", AgentRole.Arbiter], {
        account: carol.account,
      });
      await viem.assertions.emitWithArgs(tx3, identity, "AgentRegistered", [
        3n,
        getAddress(carol.account.address),
        AgentRole.Arbiter,
        "ipfs://arbiter-3",
      ]);

      assert.equal(await identity.read.totalAgents(), 3n);

      assert.equal(await identity.read.ownerOf([1n]), getAddress(alice.account.address));
      assert.equal(await identity.read.ownerOf([2n]), getAddress(bob.account.address));
      assert.equal(await identity.read.ownerOf([3n]), getAddress(carol.account.address));

      assert.equal(await identity.read.tokenURI([1n]), "ipfs://client-1");
      assert.equal(await identity.read.tokenURI([2n]), "ipfs://freelancer-2");
      assert.equal(await identity.read.tokenURI([3n]), "ipfs://arbiter-3");

      const info1 = await identity.read.getAgentInfo([1n]);
      assert.equal(info1.role, AgentRole.Client);
      assert.equal(info1.active, true);
      assert.ok(info1.registeredAt > 0n);

      const info2 = await identity.read.getAgentInfo([2n]);
      assert.equal(info2.role, AgentRole.Freelancer);
      assert.equal(info2.active, true);

      const info3 = await identity.read.getAgentInfo([3n]);
      assert.equal(info3.role, AgentRole.Arbiter);
      assert.equal(info3.active, true);

      assert.equal(await identity.read.isActiveArbiter([1n]), false);
      assert.equal(await identity.read.isActiveArbiter([2n]), false);
      assert.equal(await identity.read.isActiveArbiter([3n]), true);
      assert.deepEqual(await identity.read.getActiveArbiters(), [3n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 1n);
    });

    it("allows a single wallet to mint multiple identity NFTs across roles", async () => {
      const { identity, alice } = await deployFixture();

      await identity.write.register(["ipfs://alice-client", AgentRole.Client], {
        account: alice.account,
      });
      await identity.write.register(["ipfs://alice-freelancer", AgentRole.Freelancer], {
        account: alice.account,
      });
      await identity.write.register(["ipfs://alice-arbiter-a", AgentRole.Arbiter], {
        account: alice.account,
      });
      await identity.write.register(["ipfs://alice-arbiter-b", AgentRole.Arbiter], {
        account: alice.account,
      });

      assert.equal(await identity.read.balanceOf([alice.account.address]), 4n);
      assert.equal(await identity.read.totalAgents(), 4n);
      assert.deepEqual(await identity.read.getActiveArbiters(), [3n, 4n]);
    });

    it("reverts with EmptyURI when registering with an empty URI", async () => {
      const { viem, identity, alice } = await deployFixture();

      await viem.assertions.revertWithCustomError(
        identity.write.register(["", AgentRole.Client], { account: alice.account }),
        identity,
        "EmptyURI",
      );
    });

    it("reverts with AgentNotFound for non-existent agent queries", async () => {
      const { viem, identity, alice } = await deployFixture();

      assert.equal(await identity.read.agentExists([99n]), false);
      assert.equal(await identity.read.isActiveArbiter([99n]), false);
      assert.equal(await identity.read.isAuthorized([alice.account.address, 99n]), false);

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.read.getAgentInfo([99n]),
        identity,
        "AgentNotFound",
        [99n],
      );

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.read.getMetadata([99n, "model"]),
        identity,
        "AgentNotFound",
        [99n],
      );
    });
  });

  describe("setAgentURI", () => {
    it("allows owner, token-approved address, and approved-for-all operator to update URI", async () => {
      const { viem, identity, alice, bob, carol } = await deployFixture();

      await identity.write.register(["ipfs://v1", AgentRole.Freelancer], {
        account: alice.account,
      });

      // Owner update
      const txOwner = identity.write.setAgentURI([1n, "ipfs://v2"], {
        account: alice.account,
      });
      await viem.assertions.emitWithArgs(txOwner, identity, "AgentURIUpdated", [1n, "ipfs://v2"]);
      assert.equal(await identity.read.tokenURI([1n]), "ipfs://v2");

      // Single-token approval update
      await identity.write.approve([bob.account.address, 1n], { account: alice.account });
      assert.equal(await identity.read.isAuthorized([bob.account.address, 1n]), true);
      await identity.write.setAgentURI([1n, "ipfs://v3"], { account: bob.account });
      assert.equal(await identity.read.tokenURI([1n]), "ipfs://v3");

      // Operator approval-for-all update
      await identity.write.setApprovalForAll([carol.account.address, true], {
        account: alice.account,
      });
      assert.equal(await identity.read.isAuthorized([carol.account.address, 1n]), true);
      await identity.write.setAgentURI([1n, "ipfs://v4"], { account: carol.account });
      assert.equal(await identity.read.tokenURI([1n]), "ipfs://v4");
    });

    it("reverts with EmptyURI when newURI is empty", async () => {
      const { viem, identity, alice } = await deployFixture();

      await identity.write.register(["ipfs://v1", AgentRole.Client], { account: alice.account });

      await viem.assertions.revertWithCustomError(
        identity.write.setAgentURI([1n, ""], { account: alice.account }),
        identity,
        "EmptyURI",
      );
    });

    it("reverts with UnauthorizedAgentOperator for unauthorized caller and AgentNotFound for unknown ID", async () => {
      const { viem, identity, alice, bob } = await deployFixture();

      await identity.write.register(["ipfs://v1", AgentRole.Client], { account: alice.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setAgentURI([1n, "ipfs://hack"], { account: bob.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(bob.account.address), 1n],
      );

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setAgentURI([42n, "ipfs://unknown"], { account: alice.account }),
        identity,
        "AgentNotFound",
        [42n],
      );
    });
  });

  describe("setActive & Active Arbiter Enumeration", () => {
    it("toggles single arbiter off and back on cleanly", async () => {
      const { viem, identity, alice } = await deployFixture();

      await identity.write.register(["ipfs://arb-1", AgentRole.Arbiter], {
        account: alice.account,
      });

      assert.equal(await identity.read.isActiveArbiter([1n]), true);
      assert.equal(await identity.read.getActiveArbiterCount(), 1n);
      assert.equal(await identity.read.getActiveArbiterAt([0n]), 1n);
      assert.deepEqual(await identity.read.getActiveArbiters(), [1n]);

      // Deactivate single arbiter
      const txOff = identity.write.setActive([1n, false], { account: alice.account });
      await viem.assertions.emitWithArgs(txOff, identity, "AgentStatusUpdated", [1n, false]);

      assert.equal(await identity.read.isActiveArbiter([1n]), false);
      assert.equal(await identity.read.getActiveArbiterCount(), 0n);
      assert.deepEqual(await identity.read.getActiveArbiters(), []);
      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.read.getActiveArbiterAt([0n]),
        identity,
        "ArbiterIndexOutOfBounds",
        [0n, 0n],
      );

      // Idempotent call (false -> false) is a no-op
      await identity.write.setActive([1n, false], { account: alice.account });
      assert.equal(await identity.read.getActiveArbiterCount(), 0n);

      // Re-activate single arbiter
      const txOn = identity.write.setActive([1n, true], { account: alice.account });
      await viem.assertions.emitWithArgs(txOn, identity, "AgentStatusUpdated", [1n, true]);

      assert.equal(await identity.read.isActiveArbiter([1n]), true);
      assert.equal(await identity.read.getActiveArbiterCount(), 1n);
      assert.equal(await identity.read.getActiveArbiterAt([0n]), 1n);
      assert.deepEqual(await identity.read.getActiveArbiters(), [1n]);
    });

    it("handles swap-and-pop when deactivating first, middle, last, and single arbiters then re-activating", async () => {
      const { viem, identity, alice } = await deployFixture();

      // Register 4 arbiters -> IDs 1, 2, 3, 4
      await identity.write.register(["ipfs://arb-1", AgentRole.Arbiter], { account: alice.account });
      await identity.write.register(["ipfs://arb-2", AgentRole.Arbiter], { account: alice.account });
      await identity.write.register(["ipfs://arb-3", AgentRole.Arbiter], { account: alice.account });
      await identity.write.register(["ipfs://arb-4", AgentRole.Arbiter], { account: alice.account });

      assert.deepEqual(await identity.read.getActiveArbiters(), [1n, 2n, 3n, 4n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 4n);

      // 1. Deactivate FIRST (1n) -> swaps with last (4n): [4n, 2n, 3n]
      await identity.write.setActive([1n, false], { account: alice.account });
      assert.deepEqual(await identity.read.getActiveArbiters(), [4n, 2n, 3n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 3n);
      assert.equal(await identity.read.isActiveArbiter([1n]), false);
      assert.equal(await identity.read.isActiveArbiter([4n]), true);
      assert.equal(await identity.read.getActiveArbiterAt([0n]), 4n);
      assert.equal(await identity.read.getActiveArbiterAt([1n]), 2n);
      assert.equal(await identity.read.getActiveArbiterAt([2n]), 3n);

      // 2. Deactivate MIDDLE (2n at index 1) -> swaps with last (3n): [4n, 3n]
      await identity.write.setActive([2n, false], { account: alice.account });
      assert.deepEqual(await identity.read.getActiveArbiters(), [4n, 3n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 2n);
      assert.equal(await identity.read.isActiveArbiter([2n]), false);
      assert.equal(await identity.read.getActiveArbiterAt([0n]), 4n);
      assert.equal(await identity.read.getActiveArbiterAt([1n]), 3n);

      // 3. Deactivate LAST (3n at index 1) -> pops without swap: [4n]
      await identity.write.setActive([3n, false], { account: alice.account });
      assert.deepEqual(await identity.read.getActiveArbiters(), [4n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 1n);
      assert.equal(await identity.read.isActiveArbiter([3n]), false);
      assert.equal(await identity.read.getActiveArbiterAt([0n]), 4n);

      // 4. Deactivate remaining SINGLE (4n) -> []
      await identity.write.setActive([4n, false], { account: alice.account });
      assert.deepEqual(await identity.read.getActiveArbiters(), []);
      assert.equal(await identity.read.getActiveArbiterCount(), 0n);
      assert.equal(await identity.read.isActiveArbiter([4n]), false);

      // 5. Re-activate in a new order (2n, 1n, 4n)
      await identity.write.setActive([2n, true], { account: alice.account });
      await identity.write.setActive([1n, true], { account: alice.account });
      await identity.write.setActive([4n, true], { account: alice.account });

      assert.deepEqual(await identity.read.getActiveArbiters(), [2n, 1n, 4n]);
      assert.equal(await identity.read.getActiveArbiterCount(), 3n);
      assert.equal(await identity.read.isActiveArbiter([1n]), true);
      assert.equal(await identity.read.isActiveArbiter([2n]), true);
      assert.equal(await identity.read.isActiveArbiter([3n]), false);
      assert.equal(await identity.read.isActiveArbiter([4n]), true);

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.read.getActiveArbiterAt([3n]),
        identity,
        "ArbiterIndexOutOfBounds",
        [3n, 3n],
      );
    });

    it("toggles non-arbiter active status without affecting active arbiter list", async () => {
      const { identity, alice } = await deployFixture();

      await identity.write.register(["ipfs://client", AgentRole.Client], { account: alice.account });
      await identity.write.setActive([1n, false], { account: alice.account });

      const info = await identity.read.getAgentInfo([1n]);
      assert.equal(info.active, false);
      assert.equal(await identity.read.getActiveArbiterCount(), 0n);
    });

    it("reverts setActive for unauthorized caller", async () => {
      const { viem, identity, alice, bob } = await deployFixture();

      await identity.write.register(["ipfs://arb", AgentRole.Arbiter], { account: alice.account });

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setActive([1n, false], { account: bob.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(bob.account.address), 1n],
      );
    });
  });

  describe("Metadata", () => {
    it("sets and reads key-value metadata for owner and approved operator", async () => {
      const { viem, identity, alice, bob } = await deployFixture();

      await identity.write.register(["ipfs://agent-1", AgentRole.Arbiter], {
        account: alice.account,
      });

      // Unset key returns empty bytes
      assert.equal(await identity.read.getMetadata([1n, "model"]), "0x");

      const modelBytes = stringToHex("claude-3-7-sonnet");
      const tx = identity.write.setMetadata([1n, "model", modelBytes], {
        account: alice.account,
      });
      await viem.assertions.emit(tx, identity, "MetadataSet");
      assert.equal(await identity.read.getMetadata([1n, "model"]), modelBytes);

      // Approved operator can overwrite metadata
      await identity.write.approve([bob.account.address, 1n], { account: alice.account });
      const newBytes = toHex(42n);
      await identity.write.setMetadata([1n, "model", newBytes], { account: bob.account });
      assert.equal(await identity.read.getMetadata([1n, "model"]), newBytes);
    });

    it("reverts with EmptyMetadataKey when key is empty", async () => {
      const { viem, identity, alice } = await deployFixture();

      await identity.write.register(["ipfs://agent-1", AgentRole.Client], {
        account: alice.account,
      });

      await viem.assertions.revertWithCustomError(
        identity.write.setMetadata([1n, "", stringToHex("val")], { account: alice.account }),
        identity,
        "EmptyMetadataKey",
      );
    });

    it("reverts with UnauthorizedAgentOperator when caller is not authorized", async () => {
      const { viem, identity, alice, bob } = await deployFixture();

      await identity.write.register(["ipfs://agent-1", AgentRole.Client], {
        account: alice.account,
      });

      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setMetadata([1n, "model", stringToHex("val")], { account: bob.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(bob.account.address), 1n],
      );
    });
  });

  describe("NFT Transfer Updates Authorization", () => {
    it("revokes previous owner & approval access and grants access to new owner", async () => {
      const { viem, identity, alice, bob, carol } = await deployFixture();

      await identity.write.register(["ipfs://arb-1", AgentRole.Arbiter], {
        account: alice.account,
      });
      await identity.write.approve([carol.account.address, 1n], { account: alice.account });

      assert.equal(await identity.read.isAuthorized([alice.account.address, 1n]), true);
      assert.equal(await identity.read.isAuthorized([carol.account.address, 1n]), true);
      assert.equal(await identity.read.isAuthorized([bob.account.address, 1n]), false);

      // Transfer NFT from Alice to Bob
      await identity.write.transferFrom(
        [alice.account.address, bob.account.address, 1n],
        { account: alice.account },
      );

      assert.equal(await identity.read.ownerOf([1n]), getAddress(bob.account.address));
      assert.equal(await identity.read.isAuthorized([alice.account.address, 1n]), false);
      assert.equal(await identity.read.isAuthorized([carol.account.address, 1n]), false);
      assert.equal(await identity.read.isAuthorized([bob.account.address, 1n]), true);

      // Previous owner loses access
      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setAgentURI([1n, "ipfs://alice-fail"], { account: alice.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(alice.account.address), 1n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setActive([1n, false], { account: alice.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(alice.account.address), 1n],
      );
      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setMetadata([1n, "k", stringToHex("v")], { account: alice.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(alice.account.address), 1n],
      );

      // Previous single-token approved address also loses access
      await viem.assertions.revertWithCustomErrorWithArgs(
        identity.write.setAgentURI([1n, "ipfs://carol-fail"], { account: carol.account }),
        identity,
        "UnauthorizedAgentOperator",
        [getAddress(carol.account.address), 1n],
      );

      // New owner (Bob) has full access
      await identity.write.setAgentURI([1n, "ipfs://bob-updated"], { account: bob.account });
      await identity.write.setMetadata([1n, "k", stringToHex("bob")], { account: bob.account });
      await identity.write.setActive([1n, false], { account: bob.account });

      assert.equal(await identity.read.tokenURI([1n]), "ipfs://bob-updated");
      assert.equal(await identity.read.getMetadata([1n, "k"]), stringToHex("bob"));
      assert.equal(await identity.read.isActiveArbiter([1n]), false);
    });
  });
});
