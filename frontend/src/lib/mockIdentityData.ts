import type { Address } from "viem";
import type { AgentRoleId } from "@/lib/agentCard";

export interface PassportRecord {
  agentId: number;
  owner: Address;
  role: AgentRoleId;
  active: boolean;
  registeredAt: number; // Unix seconds
  agentURI: string;
  displayName: string;
  subtitle: string;
  description: string;
  endpoint: string;
  trustScore: number; // 0..100
  reviewCount: number;
  reviewLabel: string;
  tags: string[];
  metadata: Record<string, string>;
}

export const MOCK_USER_ADDRESS: Address =
  "0x71C9482a9E6f43D09B27F1c8405D63c11E2a9A2B";

export const MOCK_USER_PASSPORTS: PassportRecord[] = [
  {
    agentId: 1,
    owner: MOCK_USER_ADDRESS,
    role: 0,
    active: true,
    registeredAt: 1794787200, // Nov 16, 2026
    agentURI: "ipfs://bafybeig4x9k7m2q8p3r5v6w1y0z2client01.json",
    displayName: "Acme Protocol Treasury",
    subtitle: "Main Treasury Vault",
    description:
      "Multi-sig protocol treasury funding smart contract audits, ZK circuits, and post-quantum SDK milestones in tUSD8.",
    endpoint: "https://treasury.acmeprotocol.xyz/a2a",
    trustScore: 94,
    reviewCount: 12,
    reviewLabel: "12 reviews",
    tags: ["Treasury", "tUSD8 Escrow"],
    metadata: {
      treasury_tier: "protocol-dao",
      jurisdiction: "on-chain",
    },
  },
  {
    agentId: 2,
    owner: MOCK_USER_ADDRESS,
    role: 1,
    active: true,
    registeredAt: 1794960000, // Nov 18, 2026
    agentURI: "ipfs://bafybeih8n3v2k5p7q1r9s4t6u0w2auditor.json",
    displayName: "0xLaizer Security Audits",
    subtitle: "Smart Contract Architect",
    description:
      "Independent Solidity, Foundry, and zero-knowledge security engineer delivering formally verified DeFi vaults and L2 dApps.",
    endpoint: "https://laizer.dev/agent-card.json",
    trustScore: 98,
    reviewCount: 8,
    reviewLabel: "8 milestones",
    tags: ["Solidity", "ZK", "Next.js"],
    metadata: {
      specialization: "defi-security",
      github: "github.com/0xlaizer",
    },
  },
  {
    agentId: 5,
    owner: MOCK_USER_ADDRESS,
    role: 2,
    active: true,
    registeredAt: 1795219200, // Nov 21, 2026
    agentURI: "https://sentinel7.trellis.ai/mcp",
    displayName: "Sentinel-7 Arbiter Node",
    subtitle: "Autonomous Solidity & DeFi security reviewer",
    description:
      "Autonomous AI dispute arbiter inspecting GitHub commits, Foundry test suites, and milestone specs with ML-DSA-65 attestations.",
    endpoint: "https://sentinel7.trellis.ai/mcp",
    trustScore: 100,
    reviewCount: 6,
    reviewLabel: "6 disputes resolved",
    tags: ["Dilithium-3", "MCP"],
    metadata: {
      model: "dilithium-verifier-v1",
      quorum: "2-of-3",
    },
  },
];

export const MOCK_EXTERNAL_ARBITERS: PassportRecord[] = [
  {
    agentId: 3,
    owner: "0x3A1f92B048E71c6D59A0b3F2418eC790D4e18B12",
    role: 2,
    active: true,
    registeredAt: 1794614400, // Nov 14, 2026
    agentURI: "https://auditmind.trellis.ai/mcp",
    displayName: "AuditMind",
    subtitle: "Automated EVM Formal Verifier",
    description:
      "Formal verification and invariant testing arbiter specializing in ERC-4626 vaults, escrow contracts, and Solidity static analysis.",
    endpoint: "https://auditmind.trellis.ai/mcp",
    trustScore: 99,
    reviewCount: 19,
    reviewLabel: "19 disputes resolved",
    tags: ["Formal Verification", "EVM"],
    metadata: {
      model: "formal-smt-v2",
    },
  },
  {
    agentId: 4,
    owner: "0x94D28bC31F0e5A82C71B9e60A34D8F21C5b74E90",
    role: 2,
    active: true,
    registeredAt: 1794700800, // Nov 15, 2026
    agentURI: "https://latticejudge.qday.network/a2a",
    displayName: "LatticeJudge",
    subtitle: "Post-Quantum Spec & Deliverable Verifier",
    description:
      "QDay native arbitration agent validating cryptographic proofs, API deliverables, and acceptance criteria against milestone hashes.",
    endpoint: "https://latticejudge.qday.network/a2a",
    trustScore: 97,
    reviewCount: 14,
    reviewLabel: "14 disputes resolved",
    tags: ["Post-Quantum", "A2A"],
    metadata: {
      model: "ml-dsa-65-judge",
    },
  },
  {
    agentId: 6,
    owner: "0x58E10aD72C94b3F18A6E2d50B91C47f8E3a62C44",
    role: 2,
    active: true,
    registeredAt: 1795305600, // Nov 22, 2026
    agentURI: "https://verifierx.trellis.ai/mcp",
    displayName: "VerifierX",
    subtitle: "Full-Stack & GitHub Commit Arbiter",
    description:
      "Deterministic build and deliverable verifier evaluating TypeScript frontends, API endpoints, and CI artifacts for escrow disputes.",
    endpoint: "https://verifierx.trellis.ai/mcp",
    trustScore: 95,
    reviewCount: 11,
    reviewLabel: "11 disputes resolved",
    tags: ["TypeScript", "CI Proofs"],
    metadata: {
      model: "code-diff-arbiter-v3",
    },
  },
];
