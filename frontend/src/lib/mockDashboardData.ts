export type ProjectStatus = "ACTIVE" | "DISPUTED" | "OPEN" | "COMPLETED";

export type MilestoneSegmentState = "approved" | "disputed" | "locked";

export interface DashboardProject {
  id: string;
  title: string;
  clientAddress: string;
  budgetTUSD8: bigint; // 6 decimals
  status: ProjectStatus;
  milestones: MilestoneSegmentState[];
  completedCount: number;
  totalCount: number;
  icon: "shield" | "cpu" | "layout" | "database";
}

export interface DashboardPassport {
  tokenId: number;
  label: string;
  role: "CLIENT" | "FREELANCER" | "ARBITER";
  badge: string;
  trustScore: number;
  isActiveArbiter: boolean;
  metadataUri: string;
}

export interface ArbitrationFeedEvent {
  id: string;
  type: "approved" | "disputed" | "validated";
  title: string;
  detail: string;
  timestamp: string;
  txHash: string;
}

export interface DashboardKpiSnapshot {
  totalValueEscrowedUsd: number;
  tvlDeltaLabel: string;
  activeProjects: number;
  lockedMilestonesCount: number;
  activeArbiters: number;
  quorumLabel: string;
  feePercent: number;
  feeSublabel: string;
}

export const MOCK_KPI_SNAPSHOT: DashboardKpiSnapshot = {
  totalValueEscrowedUsd: 48250.0,
  tvlDeltaLabel: "+12.4% this week",
  activeProjects: 14,
  lockedMilestonesCount: 38,
  activeArbiters: 9,
  quorumLabel: "2-of-3 consensus threshold",
  feePercent: 1.0,
  feeSublabel: "0% on client refunds",
};

export const MOCK_PROJECTS: DashboardProject[] = [
  {
    id: "#TRL-104",
    title: "Smart Contract Audit — DeFi Vault",
    clientAddress: "0x71C4b82e9F3a881C90e4D391aB420F77E5A99A2B",
    budgetTUSD8: 14500_000000n,
    status: "ACTIVE",
    milestones: ["approved", "approved", "locked", "locked"],
    completedCount: 2,
    totalCount: 4,
    icon: "shield",
  },
  {
    id: "#TRL-102",
    title: "Post-Quantum SDK Integration",
    clientAddress: "0x3A9f2c1B4e08a7D2b1C58aF6e91D0bC4278E1F4C",
    budgetTUSD8: 18750_000000n,
    status: "DISPUTED",
    milestones: ["approved", "disputed", "locked"],
    completedCount: 1,
    totalCount: 3,
    icon: "cpu",
  },
  {
    id: "#TRL-098",
    title: "Next.js Dashboard Redesign",
    clientAddress: "0x9D4e7a2F1c8B5e30a4F7d6C2b8E1a390F5C28E11",
    budgetTUSD8: 6400_000000n,
    status: "ACTIVE",
    milestones: ["approved", "approved", "approved", "locked"],
    completedCount: 3,
    totalCount: 4,
    icon: "layout",
  },
  {
    id: "#TRL-089",
    title: "ERC-8004 Indexer Subgraph",
    clientAddress: "0x52B8e1A7c4D9f03E6b2A8c1D4e7F9a0B3C6d44F9",
    budgetTUSD8: 8600_000000n,
    status: "COMPLETED",
    milestones: ["approved", "approved", "approved"],
    completedCount: 3,
    totalCount: 3,
    icon: "database",
  },
];

export const MOCK_PASSPORTS: DashboardPassport[] = [
  {
    tokenId: 1,
    label: "Client Passport #1",
    role: "CLIENT",
    badge: "VERIFIED CLIENT",
    trustScore: 94,
    isActiveArbiter: false,
    metadataUri: "ipfs://bafybeigdyrzttrellisclient001",
  },
  {
    tokenId: 5,
    label: "Arbiter Passport #5",
    role: "ARBITER",
    badge: "ACTIVE ARBITER",
    trustScore: 100,
    isActiveArbiter: true,
    metadataUri: "ipfs://bafybeigdyrzttrellisarbiter005",
  },
];

export const MOCK_ARBITRATION_FEED: ArbitrationFeedEvent[] = [
  {
    id: "evt-1",
    type: "approved",
    title: "Milestone #0 Approved",
    detail: "Released $3,625.00 tUSD8 for #TRL-104 DeFi Vault Audit",
    timestamp: "2m ago",
    txHash:
      "0x8a4f92c1e7b03d5a6f19c8e4b2d7a0f3c5e1b8d4a9f2c6e0b3d7a1f5c9e33c1e",
  },
  {
    id: "evt-2",
    type: "disputed",
    title: "Dispute #2 Opened",
    detail: "3 AI Arbiters assigned for #TRL-102 Post-Quantum SDK",
    timestamp: "14m ago",
    txHash:
      "0x4c1e8b3a9f2d7e5c0a6b4d1f8e2c9a7b3d5f0e1a8c4b6d2f9e3a7c5b1d8a7f04",
  },
  {
    id: "evt-3",
    type: "validated",
    title: "Validation Proof Recorded",
    detail: "Dilithium-3 quorum 3/3 signed ERC-8004 receipt on #TRL-089",
    timestamp: "41m ago",
    txHash:
      "0x9f3b2e7c1a5d8f0b4e6c2a9d7f1b5e3c8a0d4f6b2e9c7a1d5f3b8e0c4a6d2e91",
  },
];
