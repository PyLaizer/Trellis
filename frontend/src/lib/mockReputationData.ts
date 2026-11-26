import { toHex } from "viem";

export type ReputationRole = "Client" | "Freelancer" | "Arbiter";
export type FeedbackTag = "milestone" | "arbiter";
export type ValidationStatusLabel = "Pending" | "Approved" | "Rejected";

export interface AgentReputationProfile {
  agentId: number;
  name: string;
  monogram: string;
  role: ReputationRole;
  wallet: `0x${string}`;
  averageScore: number;
  reviewCount: number;
  subtitleMetric: string;
  footerHighlight: string;
  active: boolean;
}

export interface FeedbackEntryRecord {
  id: string;
  agentId: number;
  agentName: string;
  agentRole: ReputationRole;
  reviewer: `0x${string}`;
  reviewerLabel: string;
  score: number;
  tag: FeedbackTag;
  referenceId: `0x${string}`;
  referenceLabel: string;
  comment: string;
  commentURI: string;
  timestamp: number;
  revoked: boolean;
}

export interface ValidationLogRecord {
  requestId: `0x${string}`;
  validatorAgentId: number;
  validatorName: string;
  subjectId: number;
  subjectLabel: string;
  status: ValidationStatusLabel;
  responseCode: number;
  reasoningHash: `0x${string}`;
  reasoningSummary: string;
  proofURI: string;
  proofHex: `0x${string}`;
  proofTypeLabel: string;
  respondedAt: number;
  blockNumber: number;
}

export const DEFAULT_REPUTATION_NOW_SEC = 1_764_000_000;

function encodeProofJson(payload: Record<string, unknown>): `0x${string}` {
  return toHex(JSON.stringify(payload));
}

export function createMockReputationAgents(): AgentReputationProfile[] {
  return [
    {
      agentId: 5,
      name: "Sentinel-7",
      monogram: "S7",
      role: "Arbiter",
      wallet: "0x5E7a910C4d2B813f6A90e412C7b3D851a04F7E05",
      averageScore: 100,
      reviewCount: 6,
      subtitleMetric: "6 consensus rulings • 0 dissents",
      footerHighlight: "zkML Verification Active",
      active: true,
    },
    {
      agentId: 4,
      name: "LatticeJudge",
      monogram: "LJ",
      role: "Arbiter",
      wallet: "0x4B2d881A9c0F374e51D6a208E9c4B712f38A6C04",
      averageScore: 99,
      reviewCount: 5,
      subtitleMetric: "5 consensus rulings • 1 dissent",
      footerHighlight: "TEE-TDX Attestation Verified",
      active: true,
    },
    {
      agentId: 2,
      name: "0xLaizer Audits",
      monogram: "LA",
      role: "Freelancer",
      wallet: "0x3A9f810C7d5B229aE8431bA10E447908c7544F1E",
      averageScore: 98,
      reviewCount: 8,
      subtitleMetric: "8 milestones delivered • $18,400 earned",
      footerHighlight: "100% On-Time Tranche Delivery",
      active: true,
    },
    {
      agentId: 3,
      name: "AuditMind",
      monogram: "AM",
      role: "Arbiter",
      wallet: "0x8C3f410D6a9E251b74C0d832F1e5A904b67D2E03",
      averageScore: 96,
      reviewCount: 7,
      subtitleMetric: "6 consensus rulings • 1 dissent",
      footerHighlight: "RISC0 zkML Prover Online",
      active: true,
    },
    {
      agentId: 1,
      name: "Acme Protocol",
      monogram: "AP",
      role: "Client",
      wallet: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
      averageScore: 94,
      reviewCount: 5,
      subtitleMetric: "5 funded escrows • $24,800 settled",
      footerHighlight: "Avg Release Latency: 4.2 hrs",
      active: true,
    },
    {
      agentId: 7,
      name: "Nova Labs",
      monogram: "NL",
      role: "Client",
      wallet: "0x4B8e9102F7a3D54c61E0b294A8c7F135d9204C7A",
      averageScore: 91,
      reviewCount: 4,
      subtitleMetric: "4 funded escrows • $11,200 settled",
      footerHighlight: "Zero Abandoned Escrows",
      active: true,
    },
  ];
}

export function createMockFeedbackEntries(
  nowSec: number
): FeedbackEntryRecord[] {
  return [
    {
      id: "fb-1",
      agentId: 5,
      agentName: "Sentinel-7",
      agentRole: "Arbiter",
      reviewer: "0xD150a884C2b9F013e6A7d421B9c8E504f13A0001",
      reviewerLabel: "DisputeResolution.sol",
      score: 100,
      tag: "arbiter",
      referenceId:
        "0x2f18a0c4e9b713d658a24c0f91b37e6d48a10c5f2b9e73d4a6c18f0e3b5d9a11",
      referenceLabel: "Dispute #DSP-02 • Majority Consensus",
      comment:
        "Aligned with 2-of-3 majority ruling on Dispute #DSP-02 (Release to Freelancer). TEE-TDX attestation verified against NIST FIPS 204 test vector bundle.",
      commentURI:
        "ipfs://bafybeifb01sentinel7dsp02majority/feedback-attestation.json",
      timestamp: nowSec - 18 * 60,
      revoked: false,
    },
    {
      id: "fb-2",
      agentId: 2,
      agentName: "0xLaizer Audits",
      agentRole: "Freelancer",
      reviewer: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
      reviewerLabel: "Acme Protocol (#1)",
      score: 99,
      tag: "milestone",
      referenceId:
        "0x8a4f19c8e3d209a4c117f2b0934e65a18732d9c0f4421a8e7c9b334109a83c1e",
      referenceLabel: "Project #102 • M0 Architecture Spec",
      comment:
        "Delivered complete ML-DSA-65 threat model, deterministic key derivation spec, and Foundry invariant suite 24 hours ahead of deadline.",
      commentURI:
        "ipfs://bafybeifb02laizerproj102m0/milestone-review.json",
      timestamp: nowSec - 2 * 3600,
      revoked: false,
    },
    {
      id: "fb-3",
      agentId: 4,
      agentName: "LatticeJudge",
      agentRole: "Arbiter",
      reviewer: "0xD150a884C2b9F013e6A7d421B9c8E504f13A0001",
      reviewerLabel: "DisputeResolution.sol",
      score: 25,
      tag: "arbiter",
      referenceId:
        "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e03",
      referenceLabel: "Dispute #DSP-01 • Minority Dissent",
      comment:
        "Automated protocol penalty: dissenting vote (Refund) diverged from 2-of-3 tribunal consensus (Release) on Dispute #DSP-01.",
      commentURI:
        "ipfs://bafybeifb03latticejudgedsp01dissent/penalty-log.json",
      timestamp: nowSec - 5 * 3600,
      revoked: false,
    },
    {
      id: "fb-4",
      agentId: 1,
      agentName: "Acme Protocol",
      agentRole: "Client",
      reviewer: "0x3A9f810C7d5B229aE8431bA10E447908c7544F1E",
      reviewerLabel: "0xLaizer Audits (#2)",
      score: 96,
      tag: "milestone",
      referenceId:
        "0x4c91e2a7b8d03f56c1e4a9b2d7f083c5e6a1b9d4f2c8e0a7b3d5f1c9e4a2b612",
      referenceLabel: "Project #101 • M2 Post-Quantum Bridge Audit",
      comment:
        "Clear milestone acceptance criteria, fast review turnaround, and immediate on-chain tUSD8 release upon deliverable hash verification.",
      commentURI:
        "ipfs://bafybeifb04acmeproj101m2/client-review.json",
      timestamp: nowSec - 9 * 3600,
      revoked: false,
    },
    {
      id: "fb-5",
      agentId: 3,
      agentName: "AuditMind",
      agentRole: "Arbiter",
      reviewer: "0xD150a884C2b9F013e6A7d421B9c8E504f13A0001",
      reviewerLabel: "DisputeResolution.sol",
      score: 100,
      tag: "arbiter",
      referenceId:
        "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
      referenceLabel: "Dispute #DSP-01 • Majority Consensus",
      comment:
        "Aligned with 2-of-3 majority consensus on Dispute #DSP-01 (zkSNARK Circuit). RISC0 zkML verification receipt anchored on Aevum Testnet.",
      commentURI:
        "ipfs://bafybeifb05auditminddsp01majority/feedback-attestation.json",
      timestamp: nowSec - 19 * 3600,
      revoked: false,
    },
    {
      id: "fb-6",
      agentId: 2,
      agentName: "0xLaizer Audits",
      agentRole: "Freelancer",
      reviewer: "0x4B8e9102F7a3D54c61E0b294A8c7F135d9204C7A",
      reviewerLabel: "Nova Labs (#7)",
      score: 97,
      tag: "milestone",
      referenceId:
        "0x7b3e9d1a5c408f26e9b1d3a7c5f028e4a6c9d1b3f7e2a5c8d0b4f6e9a1c3d722",
      referenceLabel: "Project #98 • M1 ERC-8004 Identity Hardening",
      comment:
        "Identified two subtle signature replay edge cases and supplied complete regression tests. Zero gas overhead regressions.",
      commentURI:
        "ipfs://bafybeifb06laizerproj98m1/milestone-review.json",
      timestamp: nowSec - 28 * 3600,
      revoked: false,
    },
    {
      id: "fb-7",
      agentId: 5,
      agentName: "Sentinel-7",
      agentRole: "Arbiter",
      reviewer: "0xD150a884C2b9F013e6A7d421B9c8E504f13A0001",
      reviewerLabel: "DisputeResolution.sol",
      score: 100,
      tag: "arbiter",
      referenceId:
        "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
      referenceLabel: "Dispute #DSP-01 • Majority Consensus",
      comment:
        "Submitted verifiable TEE quote within 18 minutes of dispute assignment. Consensus verdict executed escrow release cleanly.",
      commentURI:
        "ipfs://bafybeifb07sentinel7dsp01majority/feedback-attestation.json",
      timestamp: nowSec - 42 * 3600,
      revoked: false,
    },
    {
      id: "fb-8",
      agentId: 7,
      agentName: "Nova Labs",
      agentRole: "Client",
      reviewer: "0x3A9f810C7d5B229aE8431bA10E447908c7544F1E",
      reviewerLabel: "0xLaizer Audits (#2)",
      score: 92,
      tag: "milestone",
      referenceId:
        "0x6a1c8e3b9d047f52a8c6e1b4d9f037a5c2e8b1d6f4a9c0e3b7d2f5a8c1e4b933",
      referenceLabel: "Project #98 • M0 Threat Model Escrow",
      comment:
        "Funded full escrow upfront in tUSD8 and provided rapid technical feedback on milestone deliverable review.",
      commentURI:
        "ipfs://bafybeifb08novalabsproj98m0/client-review.json",
      timestamp: nowSec - 56 * 3600,
      revoked: false,
    },
    {
      id: "fb-9",
      agentId: 3,
      agentName: "AuditMind",
      agentRole: "Arbiter",
      reviewer: "0xD150a884C2b9F013e6A7d421B9c8E504f13A0001",
      reviewerLabel: "DisputeResolution.sol",
      score: 25,
      tag: "arbiter",
      referenceId:
        "0xa000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
      referenceLabel: "Dispute #DSP-00 • Minority Dissent",
      comment:
        "Automated protocol penalty: dissenting evaluation on Dispute #DSP-00 diverged from final 2-of-3 refund settlement.",
      commentURI:
        "ipfs://bafybeifb09auditminddsp00dissent/penalty-log.json",
      timestamp: nowSec - 74 * 3600,
      revoked: false,
    },
    {
      id: "fb-10",
      agentId: 1,
      agentName: "Acme Protocol",
      agentRole: "Client",
      reviewer: "0x8F4c2291A0d6E53b7C18a490D2e5F713c6019A44",
      reviewerLabel: "ZKForge Studio (#14)",
      score: 93,
      tag: "milestone",
      referenceId:
        "0xa1c3e5f7b9d02468a1c3e5f7b9d02468a1c3e5f7b9d02468a1c3e5f7b9d02468",
      referenceLabel: "Project #89 • M0 Verifier Spec",
      comment:
        "Well-structured milestone breakdown with unambiguous cryptographic acceptance criteria and prompt payment release.",
      commentURI:
        "ipfs://bafybeifb10acmeproj89m0/client-review.json",
      timestamp: nowSec - 96 * 3600,
      revoked: false,
    },
  ];
}

export function createMockValidationLogs(
  nowSec: number
): ValidationLogRecord[] {
  return [
    {
      requestId:
        "0x2f18a0c4e9b713d658a24c0f91b37e6d48a10c5f2b9e73d4a6c18f0e3b5d9a11",
      validatorAgentId: 3,
      validatorName: "AuditMind",
      subjectId: 2,
      subjectLabel: "Dispute #DSP-02",
      status: "Approved",
      responseCode: 1,
      reasoningHash:
        "0x91e4c0b7a3d85f12c90e44a7b2183f6c5d902e1a4b7c88d0f123e4a5b6c7d801",
      reasoningSummary:
        "All FIPS 204 cryptographic test vectors pass with zero correctness regressions. Desktop p95 is 4.2ms; mobile Safari overhead stems from WASM SIMD flag omitted in client test harness.",
      proofURI:
        "ipfs://bafybeiauditmind03dsp02verdictrelease/attestation.json",
      proofHex: encodeProofJson({
        scheme: "zkML-RISC0-v1.2",
        validator: "AuditMind (#3)",
        subject: "Dispute #DSP-02",
        responseCode: 1,
        verdict: "RELEASE_TO_FREELANCER",
        katVectorsPassed: 142,
        desktopP95Ms: 4.2,
        confidenceBps: 9420,
        sigAlg: "ML-DSA-65/Dilithium-3",
      }),
      proofTypeLabel: "zkML Proof",
      respondedAt: nowSec - 19 * 60,
      blockNumber: 1_842_911,
    },
    {
      requestId:
        "0x7c44b2e19a0d63f8b512c7e90a3d4f6b81c2e5a9d0f3b7c4e8a1d6f2b9c3e422",
      validatorAgentId: 4,
      validatorName: "LatticeJudge",
      subjectId: 2,
      subjectLabel: "Dispute #DSP-02",
      status: "Approved",
      responseCode: 2,
      reasoningHash:
        "0x4a7b2c9e1f038d6a5c21b4e7f9083a6d1c4e2b8f7a9d03c5e1b6a4f8c2d907e2",
      reasoningSummary:
        "Milestone spec explicitly cites <10ms p95 across Chromium and WebKit targets without conditioning on experimental SIMD flags. Recommend refund so milestone can be re-scoped.",
      proofURI:
        "ipfs://bafybeilatticejudge04dsp02verdictrefund/attestation.json",
      proofHex: encodeProofJson({
        scheme: "TEE-TDX-Quote-v4",
        validator: "LatticeJudge (#4)",
        subject: "Dispute #DSP-02",
        responseCode: 2,
        verdict: "REFUND_TO_CLIENT",
        webkitP95Ms: 14.8,
        specThresholdMs: 10.0,
        confidenceBps: 8150,
        sigAlg: "ML-DSA-65/Dilithium-3",
      }),
      proofTypeLabel: "TEE Attestation",
      respondedAt: nowSec - 14 * 60,
      blockNumber: 1_842_944,
    },
    {
      requestId:
        "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
      validatorAgentId: 5,
      validatorName: "Sentinel-7",
      subjectId: 1,
      subjectLabel: "Dispute #DSP-01",
      status: "Approved",
      responseCode: 1,
      reasoningHash:
        "0xd101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
      reasoningSummary:
        "Verified Groth16 proof generation and on-chain verification on Aevum Testnet. Majority quorum favors freelancer release.",
      proofURI: "ipfs://bafybeidsp01arb5proof/attestation.json",
      proofHex: encodeProofJson({
        scheme: "TEE-TDX-Quote-v4",
        validator: "Sentinel-7 (#5)",
        subject: "Dispute #DSP-01",
        responseCode: 1,
        verdict: "RELEASE_TO_FREELANCER",
        soundnessChecksPassed: true,
        confidenceBps: 9510,
        sigAlg: "ML-DSA-65/Dilithium-3",
      }),
      proofTypeLabel: "TEE Attestation",
      respondedAt: nowSec - 18 * 3600,
      blockNumber: 1_811_489,
    },
    {
      requestId:
        "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
      validatorAgentId: 3,
      validatorName: "AuditMind",
      subjectId: 1,
      subjectLabel: "Dispute #DSP-01",
      status: "Approved",
      responseCode: 1,
      reasoningHash:
        "0xd101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
      reasoningSummary:
        "Circuit passes all soundness invariants; +3.1% constraint overhead is within standard RFC tolerance.",
      proofURI: "ipfs://bafybeidsp01arb3proof/attestation.json",
      proofHex: encodeProofJson({
        scheme: "zkML-RISC0-v1.2",
        validator: "AuditMind (#3)",
        subject: "Dispute #DSP-01",
        responseCode: 1,
        verdict: "RELEASE_TO_FREELANCER",
        constraintOverheadPct: 3.1,
        confidenceBps: 9640,
        sigAlg: "ML-DSA-65/Dilithium-3",
      }),
      proofTypeLabel: "zkML Proof",
      respondedAt: nowSec - 19 * 3600,
      blockNumber: 1_811_420,
    },
  ];
}
