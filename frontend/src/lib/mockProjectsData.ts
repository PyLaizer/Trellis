import { zeroAddress, type Address } from "viem";
import { MOCK_USER_ADDRESS } from "@/lib/mockIdentityData";
import {
  buildJsonDataUri,
  type MilestoneStatusId,
  type ProjectStatusId,
} from "@/lib/projectMetadata";

export interface MilestoneRecord {
  index: number;
  title: string;
  amount: bigint; // 6-decimal tUSD8
  dueDate: number; // Unix seconds
  submittedAt: number; // Unix seconds (0 if not submitted)
  status: MilestoneStatusId;
  deliverableHash: `0x${string}`;
  descriptionURI: string;
  deliverableURI: string;
}

export interface ProjectRecord {
  projectId: number;
  title: string;
  summary: string;
  category: string;
  clientAgentId: number;
  clientName: string;
  clientTrustScore: number;
  clientAddress: Address;
  freelancerAgentId: number; // 0 for Open Marketplace until accepted; > 0 for Direct Hire or accepted
  freelancerName?: string;
  freelancerAddress: Address;
  isDirectHire: boolean;
  status: ProjectStatusId;
  totalBudget: bigint; // 6-decimal tUSD8
  settledCount: number;
  createdAt: number; // Unix seconds
  metadataURI: string;
  milestones: MilestoneRecord[];
}

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

const EXTERNAL_CLIENT_1: Address =
  "0x3A1f92B048E71c6D59A0b3F2418eC790D4e18B12";
const EXTERNAL_CLIENT_3: Address =
  "0x94D28bC31F0e5A82C71B9e60A34D8F21C5b74E90";
const EXTERNAL_FREELANCER_7: Address =
  "0x58E10aD72C94b3F18A6E2d50B91C47f8E3a62C44";

export const MOCK_USER_TUSD8_BALANCE = 4_500_000_000n; // $4,500.00 tUSD8
export const MOCK_PROTOCOL_FEE_BPS = 100; // 1.0%

export const MOCK_PROJECTS: ProjectRecord[] = [
  {
    projectId: 105,
    title: "Zero-Knowledge Proof Verifier Circuit",
    summary:
      "Implement Halo2 Plonk verifier contract and Circom witness generator with sub-250k gas verification on QDay Aevum L2.",
    category: "Zero-Knowledge",
    clientAgentId: 1,
    clientName: "Acme Protocol Treasury",
    clientTrustScore: 94,
    clientAddress: EXTERNAL_CLIENT_1,
    freelancerAgentId: 0,
    freelancerAddress: zeroAddress,
    isDirectHire: false,
    status: 0, // Open
    totalBudget: 3_200_000_000n, // $3,200.00 tUSD8
    settledCount: 0,
    createdAt: 1795305600, // Nov 22, 2026
    metadataURI: buildJsonDataUri({
      title: "Zero-Knowledge Proof Verifier Circuit",
      summary:
        "Implement Halo2 Plonk verifier contract and Circom witness generator with sub-250k gas verification on QDay Aevum L2.",
      category: "Zero-Knowledge",
    }),
    milestones: [
      {
        index: 0,
        title: "Circuit Architecture & R1CS Constraints",
        amount: 1_000_000_000n,
        dueDate: 1796601599, // Dec 6, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Circuit Architecture & R1CS Constraints",
        }),
        deliverableURI: "",
      },
      {
        index: 1,
        title: "Solidity Verifier & Gas Optimization",
        amount: 1_200_000_000n,
        dueDate: 1797206399, // Dec 13, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Solidity Verifier & Gas Optimization",
        }),
        deliverableURI: "",
      },
      {
        index: 2,
        title: "Foundry Fuzz Suite & Audit Handoff",
        amount: 1_000_000_000n,
        dueDate: 1797811199, // Dec 20, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Foundry Fuzz Suite & Audit Handoff",
        }),
        deliverableURI: "",
      },
    ],
  },
  {
    projectId: 104,
    title: "Smart Contract Audit — DeFi Vault",
    summary:
      "Full line-by-line security review, invariant fuzzing, and formal verification of ERC-4626 quantum-safe yield vault.",
    category: "Security Audit",
    clientAgentId: 1,
    clientName: "Acme Protocol Treasury",
    clientTrustScore: 94,
    clientAddress: MOCK_USER_ADDRESS,
    freelancerAgentId: 2,
    freelancerName: "0xLaizer Security Audits",
    freelancerAddress: MOCK_USER_ADDRESS,
    isDirectHire: true,
    status: 1, // Active
    totalBudget: 4_500_000_000n, // $4,500.00 tUSD8
    settledCount: 1,
    createdAt: 1795046400, // Nov 19, 2026
    metadataURI: buildJsonDataUri({
      title: "Smart Contract Audit — DeFi Vault",
      summary:
        "Full line-by-line security review, invariant fuzzing, and formal verification of ERC-4626 quantum-safe yield vault.",
      category: "Security Audit",
    }),
    milestones: [
      {
        index: 0,
        title: "Threat Model & Static Analysis Report",
        amount: 1_500_000_000n,
        dueDate: 1795651199, // Nov 25, 2026
        submittedAt: 1795219200,
        status: 2, // Approved
        deliverableHash:
          "0x8a4f9b2c1d3e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e3c1e",
        descriptionURI: buildJsonDataUri({
          title: "Threat Model & Static Analysis Report",
        }),
        deliverableURI: "ipfs://bafybeig4x9k7m2q8p3r5v6w1y0z2audit-m1.pdf",
      },
      {
        index: 1,
        title: "Foundry Invariant Suite & PoC Exploits",
        amount: 1_500_000_000n,
        dueDate: 1796255999, // Dec 2, 2026
        submittedAt: 1795392000,
        status: 1, // Submitted
        deliverableHash:
          "0x4c1e7d9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c9d2f",
        descriptionURI: buildJsonDataUri({
          title: "Foundry Invariant Suite & PoC Exploits",
        }),
        deliverableURI: "https://github.com/0xlaizer/vault-audit/commit/9f2a4c1",
      },
      {
        index: 2,
        title: "Remediation Review & Final Sign-off",
        amount: 1_500_000_000n,
        dueDate: 1796860799, // Dec 9, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Remediation Review & Final Sign-off",
        }),
        deliverableURI: "",
      },
    ],
  },
  {
    projectId: 102,
    title: "Post-Quantum SDK Integration",
    summary:
      "TypeScript SDK wrapper for ML-DSA-65 (Dilithium-3) transaction signing and ERC-8004 agent verification endpoints.",
    category: "Cryptography",
    clientAgentId: 3,
    clientName: "QDay Labs Core",
    clientTrustScore: 91,
    clientAddress: EXTERNAL_CLIENT_3,
    freelancerAgentId: 2,
    freelancerName: "0xLaizer Security Audits",
    freelancerAddress: MOCK_USER_ADDRESS,
    isDirectHire: false,
    status: 1, // Active (with Disputed milestone!)
    totalBudget: 2_200_000_000n, // $2,200.00 tUSD8
    settledCount: 1,
    createdAt: 1794873600, // Nov 17, 2026
    metadataURI: buildJsonDataUri({
      title: "Post-Quantum SDK Integration",
      summary:
        "TypeScript SDK wrapper for ML-DSA-65 (Dilithium-3) transaction signing and ERC-8004 agent verification endpoints.",
      category: "Cryptography",
    }),
    milestones: [
      {
        index: 0,
        title: "WASM Dilithium-3 Keygen & Signer",
        amount: 1_100_000_000n,
        dueDate: 1795478399, // Nov 23, 2026
        submittedAt: 1795046400,
        status: 2, // Approved
        deliverableHash:
          "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
        descriptionURI: buildJsonDataUri({
          title: "WASM Dilithium-3 Keygen & Signer",
        }),
        deliverableURI: "https://github.com/qday-labs/pq-sdk/releases/v0.1.0",
      },
      {
        index: 1,
        title: "ERC-8004 Verification Middleware & Tests",
        amount: 1_100_000_000n,
        dueDate: 1796083199, // Nov 30, 2026
        submittedAt: 1795305600,
        status: 3, // Disputed
        deliverableHash:
          "0x7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e",
        descriptionURI: buildJsonDataUri({
          title: "ERC-8004 Verification Middleware & Tests",
        }),
        deliverableURI: "https://github.com/qday-labs/pq-sdk/pull/42",
      },
    ],
  },
  {
    projectId: 98,
    title: "Next.js Dashboard Redesign",
    summary:
      "Design and implement Copper & Ice telemetry dashboard with Framer Motion state transitions and live wagmi hooks.",
    category: "Frontend",
    clientAgentId: 1,
    clientName: "Acme Protocol Treasury",
    clientTrustScore: 94,
    clientAddress: MOCK_USER_ADDRESS,
    freelancerAgentId: 0,
    freelancerAddress: zeroAddress,
    isDirectHire: false,
    status: 0, // Open (owned by mock user -> shows Cancel & Refund 100%!)
    totalBudget: 1_800_000_000n, // $1,800.00 tUSD8
    settledCount: 0,
    createdAt: 1795219200, // Nov 21, 2026
    metadataURI: buildJsonDataUri({
      title: "Next.js Dashboard Redesign",
      summary:
        "Design and implement Copper & Ice telemetry dashboard with Framer Motion state transitions and live wagmi hooks.",
      category: "Frontend",
    }),
    milestones: [
      {
        index: 0,
        title: "Design System Tokens & Component Library",
        amount: 900_000_000n,
        dueDate: 1796428799, // Dec 4, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Design System Tokens & Component Library",
        }),
        deliverableURI: "",
      },
      {
        index: 1,
        title: "Live Wagmi Telemetry & Responsive QA",
        amount: 900_000_000n,
        dueDate: 1797033599, // Dec 11, 2026
        submittedAt: 0,
        status: 0, // Pending
        deliverableHash: ZERO_HASH,
        descriptionURI: buildJsonDataUri({
          title: "Live Wagmi Telemetry & Responsive QA",
        }),
        deliverableURI: "",
      },
    ],
  },
  {
    projectId: 89,
    title: "ERC-8004 Indexer Subgraph",
    summary:
      "GraphQL subgraph indexing IdentityRegistry mints, ReputationRegistry feedback events, and MilestoneEscrow settlements.",
    category: "Infrastructure",
    clientAgentId: 1,
    clientName: "Acme Protocol Treasury",
    clientTrustScore: 94,
    clientAddress: MOCK_USER_ADDRESS,
    freelancerAgentId: 7,
    freelancerName: "GraphNode Labs",
    freelancerAddress: EXTERNAL_FREELANCER_7,
    isDirectHire: true,
    status: 2, // Completed
    totalBudget: 3_000_000_000n, // $3,000.00 tUSD8
    settledCount: 3,
    createdAt: 1794096000, // Nov 8, 2026
    metadataURI: buildJsonDataUri({
      title: "ERC-8004 Indexer Subgraph",
      summary:
        "GraphQL subgraph indexing IdentityRegistry mints, ReputationRegistry feedback events, and MilestoneEscrow settlements.",
      category: "Infrastructure",
    }),
    milestones: [
      {
        index: 0,
        title: "Schema Definition & Event Handlers",
        amount: 1_000_000_000n,
        dueDate: 1794527999,
        submittedAt: 1794441600,
        status: 2, // Approved
        deliverableHash:
          "0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
        descriptionURI: buildJsonDataUri({
          title: "Schema Definition & Event Handlers",
        }),
        deliverableURI: "ipfs://bafybeih-subgraph-m1.json",
      },
      {
        index: 1,
        title: "Aevum Testnet Deployment & Backfill",
        amount: 1_000_000_000n,
        dueDate: 1794959999,
        submittedAt: 1794873600,
        status: 2, // Approved
        deliverableHash:
          "0x5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
        descriptionURI: buildJsonDataUri({
          title: "Aevum Testnet Deployment & Backfill",
        }),
        deliverableURI: "ipfs://bafybeih-subgraph-m2.json",
      },
      {
        index: 2,
        title: "Query Latency Benchmarks & Docs",
        amount: 1_000_000_000n,
        dueDate: 1795219199,
        submittedAt: 1795132800,
        status: 2, // Approved
        deliverableHash:
          "0x2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a",
        descriptionURI: buildJsonDataUri({
          title: "Query Latency Benchmarks & Docs",
        }),
        deliverableURI: "ipfs://bafybeih-subgraph-m3.json",
      },
    ],
  },
];
