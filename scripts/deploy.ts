import fs from "node:fs/promises";
import path from "node:path";
import hre from "hardhat";
import { formatEther, getAddress, type Address, type Hash } from "viem";

const AEVUM_CHAIN_ID = 44005;
const HARDHAT_CHAIN_ID = 31337;
const DEFAULT_AEVUM_TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
const AEVUM_EXPLORER_ADDRESS_BASE = "https://explorer-test.qday.info/address/";

const FEE_BPS = 100; // 1%
const CLIENT_REVIEW_PERIOD = 300n; // 5 minutes (demo-friendly testnet timing)
const VOTING_PERIOD = 3600n; // 1 hour (demo-friendly testnet timing)

interface DeploymentManifest {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: Address;
  treasury: Address;
  feeBps: number;
  clientReviewPeriod: number;
  votingPeriod: number;
  contracts: {
    tUSD8: Address;
    IdentityRegistry: Address;
    ReputationRegistry: Address;
    ValidationRegistry: Address;
    MilestoneEscrow: Address;
    ProjectManager: Address;
    DisputeResolution: Address;
  };
}

function resolveAddressEnv(value: string | undefined, fallback: Address): Address {
  const trimmed = value?.trim();
  return getAddress(trimmed && trimmed.length > 0 ? trimmed : fallback);
}

async function main(): Promise<void> {
  const { viem } = await hre.network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  const deployer = walletClients[0];
  if (!deployer) {
    throw new Error(
      "No deployer wallet client available. Ensure PRIVATE_KEY is configured in .env for live networks.",
    );
  }

  const chainId = await publicClient.getChainId();
  const isAevum = chainId === AEVUM_CHAIN_ID;
  const networkLabel = isAevum
    ? "aevum"
    : chainId === HARDHAT_CHAIN_ID
      ? "hardhat"
      : `chain-${chainId}`;
  const explorerBase = isAevum ? AEVUM_EXPLORER_ADDRESS_BASE : "";

  const admin = getAddress(deployer.account.address);
  const treasury = resolveAddressEnv(process.env.TREASURY_ADDRESS, admin);
  const deployerBalance = await publicClient.getBalance({ address: admin });

  console.log("============================================================");
  console.log(`Trellis Protocol Deployment (${networkLabel}, chainId=${chainId})`);
  console.log("============================================================");
  console.log(`Deployer           : ${admin}`);
  console.log(`Deployer Balance   : ${formatEther(deployerBalance)} native`);
  console.log(`Treasury           : ${treasury}`);
  console.log(`Fee (bps)          : ${FEE_BPS} (${FEE_BPS / 100}%)`);
  console.log(`Client Review      : ${CLIENT_REVIEW_PERIOD}s`);
  console.log(`Voting Period      : ${VOTING_PERIOD}s`);
  console.log("------------------------------------------------------------");

  async function waitForTx(label: string, hash: Hash): Promise<void> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Transaction failed for ${label}: ${hash}`);
    }
  }

  const deployConfig = {
    client: { public: publicClient, wallet: deployer },
    confirmations: 1,
  };

  async function deployAndLog<T extends { address: Address }>(
    label: string,
    deployFn: () => Promise<T>,
  ): Promise<T> {
    const contract = await deployFn();
    const addr = getAddress(contract.address);
    console.log(`[Deployed] ${label.padEnd(20)} ${addr}`);
    return contract;
  }

  // 0. Resolve or deploy tUSD8
  let tusd8Address: Address;
  if (isAevum) {
    tusd8Address = resolveAddressEnv(process.env.TUSD8_ADDRESS, DEFAULT_AEVUM_TUSD8);
    console.log(`[External] ${"tUSD8".padEnd(20)} ${tusd8Address}`);
  } else {
    const mockTusd8 = await deployAndLog("MockTUSD8", () =>
      viem.deployContract("MockTUSD8", [], deployConfig),
    );
    tusd8Address = getAddress(mockTusd8.address);
  }

  // 1. IdentityRegistry
  const identityRegistry = await deployAndLog("IdentityRegistry", () =>
    viem.deployContract("IdentityRegistry", [], deployConfig),
  );

  // 2. ReputationRegistry
  const reputationRegistry = await deployAndLog("ReputationRegistry", () =>
    viem.deployContract("ReputationRegistry", [identityRegistry.address, admin], deployConfig),
  );

  // 3. ValidationRegistry
  const validationRegistry = await deployAndLog("ValidationRegistry", () =>
    viem.deployContract("ValidationRegistry", [identityRegistry.address, admin], deployConfig),
  );

  // 4. MilestoneEscrow
  const milestoneEscrow = await deployAndLog("MilestoneEscrow", () =>
    viem.deployContract("MilestoneEscrow", [tusd8Address, treasury, FEE_BPS, admin], deployConfig),
  );

  // 5. ProjectManager
  const projectManager = await deployAndLog("ProjectManager", () =>
    viem.deployContract(
      "ProjectManager",
      [identityRegistry.address, reputationRegistry.address, milestoneEscrow.address, admin],
      deployConfig,
    ),
  );

  // 6. DisputeResolution
  // Constructor order: (identityRegistry, reputationRegistry, validationRegistry, projectManager, initialAdmin, clientReviewPeriod, votingPeriod)
  const disputeResolution = await deployAndLog("DisputeResolution", () =>
    viem.deployContract(
      "DisputeResolution",
      [
        identityRegistry.address,
        reputationRegistry.address,
        validationRegistry.address,
        projectManager.address,
        admin,
        CLIENT_REVIEW_PERIOD,
        VOTING_PERIOD,
      ],
      deployConfig,
    ),
  );

  console.log("------------------------------------------------------------");
  console.log("Wiring AccessControl roles...");

  const reporterRole = await reputationRegistry.read.REPORTER_ROLE();
  const requesterRole = await validationRegistry.read.REQUESTER_ROLE();
  const projectManagerRole = await milestoneEscrow.read.PROJECT_MANAGER_ROLE();
  const escrowDisputeRole = await milestoneEscrow.read.DISPUTE_RESOLVER_ROLE();
  const pmDisputeRole = await projectManager.read.DISPUTE_RESOLVER_ROLE();

  // ReputationRegistry: grant REPORTER_ROLE to ProjectManager and DisputeResolution
  const tx1 = await reputationRegistry.write.grantRole([reporterRole, projectManager.address], {
    account: deployer.account,
  });
  await waitForTx("ReputationRegistry.grantRole(REPORTER_ROLE, ProjectManager)", tx1);

  const tx2 = await reputationRegistry.write.grantRole([reporterRole, disputeResolution.address], {
    account: deployer.account,
  });
  await waitForTx("ReputationRegistry.grantRole(REPORTER_ROLE, DisputeResolution)", tx2);

  // ValidationRegistry: grant REQUESTER_ROLE to DisputeResolution
  const tx3 = await validationRegistry.write.grantRole([requesterRole, disputeResolution.address], {
    account: deployer.account,
  });
  await waitForTx("ValidationRegistry.grantRole(REQUESTER_ROLE, DisputeResolution)", tx3);

  // MilestoneEscrow: grant PROJECT_MANAGER_ROLE to ProjectManager only (least privilege)
  const tx4 = await milestoneEscrow.write.grantRole([projectManagerRole, projectManager.address], {
    account: deployer.account,
  });
  await waitForTx("MilestoneEscrow.grantRole(PROJECT_MANAGER_ROLE, ProjectManager)", tx4);

  // ProjectManager: grant DISPUTE_RESOLVER_ROLE to DisputeResolution
  const tx5 = await projectManager.write.grantRole([pmDisputeRole, disputeResolution.address], {
    account: deployer.account,
  });
  await waitForTx("ProjectManager.grantRole(DISPUTE_RESOLVER_ROLE, DisputeResolution)", tx5);

  // Verify all roles
  const roleChecks: Array<{ label: string; actual: boolean; expected: boolean }> = [
    {
      label: "ReputationRegistry.REPORTER_ROLE -> ProjectManager",
      actual: await reputationRegistry.read.hasRole([reporterRole, projectManager.address]),
      expected: true,
    },
    {
      label: "ReputationRegistry.REPORTER_ROLE -> DisputeResolution",
      actual: await reputationRegistry.read.hasRole([reporterRole, disputeResolution.address]),
      expected: true,
    },
    {
      label: "ValidationRegistry.REQUESTER_ROLE -> DisputeResolution",
      actual: await validationRegistry.read.hasRole([requesterRole, disputeResolution.address]),
      expected: true,
    },
    {
      label: "MilestoneEscrow.PROJECT_MANAGER_ROLE -> ProjectManager",
      actual: await milestoneEscrow.read.hasRole([projectManagerRole, projectManager.address]),
      expected: true,
    },
    {
      label: "MilestoneEscrow.DISPUTE_RESOLVER_ROLE -> DisputeResolution (least privilege: false)",
      actual: await milestoneEscrow.read.hasRole([escrowDisputeRole, disputeResolution.address]),
      expected: false,
    },
    {
      label: "ProjectManager.DISPUTE_RESOLVER_ROLE -> DisputeResolution",
      actual: await projectManager.read.hasRole([pmDisputeRole, disputeResolution.address]),
      expected: true,
    },
  ];

  for (const check of roleChecks) {
    if (check.actual !== check.expected) {
      throw new Error(
        `Role verification failed for ${check.label}: expected ${check.expected}, got ${check.actual}`,
      );
    }
    console.log(`[Verified] ${check.label} = ${check.actual}`);
  }

  // Write deployment manifest
  const manifest: DeploymentManifest = {
    network: networkLabel,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: admin,
    treasury,
    feeBps: FEE_BPS,
    clientReviewPeriod: Number(CLIENT_REVIEW_PERIOD),
    votingPeriod: Number(VOTING_PERIOD),
    contracts: {
      tUSD8: tusd8Address,
      IdentityRegistry: getAddress(identityRegistry.address),
      ReputationRegistry: getAddress(reputationRegistry.address),
      ValidationRegistry: getAddress(validationRegistry.address),
      MilestoneEscrow: getAddress(milestoneEscrow.address),
      ProjectManager: getAddress(projectManager.address),
      DisputeResolution: getAddress(disputeResolution.address),
    },
  };

  const deploymentsDir = path.resolve(process.cwd(), "deployments");
  await fs.mkdir(deploymentsDir, { recursive: true });
  const manifestPath = path.join(deploymentsDir, `${networkLabel}.json`);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  console.log("------------------------------------------------------------");
  console.log(`Manifest written to: ${manifestPath}`);
  console.log("------------------------------------------------------------");
  console.log("Deployment Summary:");

  const summaryRows: Array<[string, Address]> = [
    ["tUSD8", manifest.contracts.tUSD8],
    ["IdentityRegistry", manifest.contracts.IdentityRegistry],
    ["ReputationRegistry", manifest.contracts.ReputationRegistry],
    ["ValidationRegistry", manifest.contracts.ValidationRegistry],
    ["MilestoneEscrow", manifest.contracts.MilestoneEscrow],
    ["ProjectManager", manifest.contracts.ProjectManager],
    ["DisputeResolution", manifest.contracts.DisputeResolution],
  ];

  for (const [name, address] of summaryRows) {
    const link = explorerBase ? `  ${explorerBase}${address}` : "";
    console.log(`  ${name.padEnd(20)} ${address}${link}`);
  }
  console.log("============================================================");
}

main().catch((error: unknown) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
