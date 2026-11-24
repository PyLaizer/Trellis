import { toHex } from "viem";

export type DisputeStatusId = 0 | 1 | 2;
export type RulingId = 0 | 1 | 2;

export const DISPUTE_STATUS_LABELS: Record<
  DisputeStatusId,
  "Open" | "ResolvedRelease" | "ResolvedRefund"
> = {
  0: "Open",
  1: "ResolvedRelease",
  2: "ResolvedRefund",
};

export const RULING_LABELS: Record<
  RulingId,
  "None" | "ReleaseToFreelancer" | "RefundToClient"
> = {
  0: "None",
  1: "ReleaseToFreelancer",
  2: "RefundToClient",
};

export interface ArbiterSeatRecord {
  arbiterAgentId: number;
  name: string;
  monogram: string;
  reputationScore: number;
  isYou: boolean;
  ruling: RulingId;
  votedAt: number;
  reasoningSummary: string;
  reasoningHash: `0x${string}`;
  proofURI: string;
  validationRequestId: `0x${string}`;
  validationStatus: "Pending" | "Approved" | "Rejected";
  responseCode: number;
  proofHex: `0x${string}`;
  blockNumber?: number;
}

export interface DisputeRecord {
  disputeId: number;
  code: string;
  projectId: number;
  projectTitle: string;
  milestoneIndex: number;
  milestoneTitle: string;
  amount: bigint;
  status: DisputeStatusId;
  openedBy: `0x${string}`;
  clientAgentId: number;
  clientAddress: `0x${string}`;
  freelancerAgentId: number;
  freelancerAddress: `0x${string}`;
  deliverableURI: string;
  deliverableHash: `0x${string}`;
  deliverableSummary: string;
  evidenceURI: string;
  evidenceHash: `0x${string}`;
  evidenceSummary: string;
  evidenceClaimTag: string;
  createdAt: number;
  votingDeadline: number;
  releaseVotes: number;
  refundVotes: number;
  expiredTie?: boolean;
  arbiters: [ArbiterSeatRecord, ArbiterSeatRecord, ArbiterSeatRecord];
}

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const DEFAULT_PREVIEW_NOW_SEC = 1_764_000_000;

function encodeAttestationHex(payload: Record<string, unknown>): `0x${string}` {
  return toHex(JSON.stringify(payload));
}

export function createMockDisputes(nowSec: number): DisputeRecord[] {
  return [
    // -----------------------------------------------------------------------
    // OPEN DISPUTE #1: #DSP-02 (Featured Tie-Breaker)
    // -----------------------------------------------------------------------
    {
      disputeId: 2,
      code: "#DSP-02",
      projectId: 102,
      projectTitle: "Post-Quantum SDK Integration",
      milestoneIndex: 1,
      milestoneTitle: "Dilithium-3 Signer & Keygen",
      amount: 2_200_000_000n, // $2,200.00 tUSD8
      status: 0,
      openedBy: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
      clientAgentId: 1,
      clientAddress: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
      freelancerAgentId: 2,
      freelancerAddress: "0x3A9f810C7d5B229aE8431bA10E447908c7544F1E",
      deliverableURI:
        "ipfs://bafybeigdyrztx6pqsdk7m1dilithium3signer99a/release-bundle.json",
      deliverableHash:
        "0x8a4f19c8e3d209a4c117f2b0934e65a18732d9c0f4421a8e7c9b334109a83c1e",
      deliverableSummary:
        "Delivered TypeScript + WASM Dilithium-3 keygen, deterministic signing, and browser verification module with 142/142 unit tests passing and NIST FIPS 204 KAT vectors verified.",
      evidenceURI:
        "ipfs://bafybeih4clientclaim7pqsdk8benchmarkgap22b/sla-dispute.json",
      evidenceHash:
        "0x5c2198a3b4f019d7e34a8102c9d771b2e6410f3a9d82c5b1a0e3f77612d94e02",
      evidenceSummary:
        "Client claims cold-start WASM verification latency hits 14.8ms on mobile Safari vs the 10ms p95 target listed in M1 appendix, requesting full tranche refund prior to remediation.",
      evidenceClaimTag: "Contested SLA: Mobile p95 Latency (14.8ms vs 10ms)",
      createdAt: nowSec - 762,
      votingDeadline: nowSec + 47 * 60 + 18, // 47m 18s remaining
      releaseVotes: 1,
      refundVotes: 1,
      arbiters: [
        {
          arbiterAgentId: 3,
          name: "AuditMind",
          monogram: "AM",
          reputationScore: 97,
          isYou: false,
          ruling: 1,
          votedAt: nowSec - 520,
          reasoningSummary:
            "All FIPS 204 cryptographic test vectors pass with zero correctness regressions. Desktop p95 is 4.2ms; mobile Safari overhead stems from WASM SIMD flag omitted in client test harness.",
          reasoningHash:
            "0x91e4c0b7a3d85f12c90e44a7b2183f6c5d902e1a4b7c88d0f123e4a5b6c7d801",
          proofURI:
            "ipfs://bafybeiauditmind03dsp02verdictrelease/attestation.json",
          validationRequestId:
            "0x2f18a0c4e9b713d658a24c0f91b37e6d48a10c5f2b9e73d4a6c18f0e3b5d9a11",
          validationStatus: "Approved",
          responseCode: 1,
          blockNumber: 1_842_911,
          proofHex: encodeAttestationHex({
            scheme: "zkML-RISC0-v1.2",
            arbiter: "AuditMind (#3)",
            disputeId: 2,
            ruling: "RELEASE_TO_FREELANCER",
            responseCode: 1,
            katVectorsPassed: 142,
            desktopP95Ms: 4.2,
            confidenceBps: 9420,
            sigAlg: "ML-DSA-65/Dilithium-3",
          }),
        },
        {
          arbiterAgentId: 4,
          name: "LatticeJudge",
          monogram: "LJ",
          reputationScore: 93,
          isYou: false,
          ruling: 2,
          votedAt: nowSec - 310,
          reasoningSummary:
            "Milestone spec explicitly cites <10ms p95 across Chromium and WebKit targets without conditioning on experimental SIMD flags. Recommend refund so milestone can be re-scoped.",
          reasoningHash:
            "0x4a7b2c9e1f038d6a5c21b4e7f9083a6d1c4e2b8f7a9d03c5e1b6a4f8c2d907e2",
          proofURI:
            "ipfs://bafybeilatticejudge04dsp02verdictrefund/attestation.json",
          validationRequestId:
            "0x7c44b2e19a0d63f8b512c7e90a3d4f6b81c2e5a9d0f3b7c4e8a1d6f2b9c3e422",
          validationStatus: "Approved",
          responseCode: 2,
          blockNumber: 1_842_944,
          proofHex: encodeAttestationHex({
            scheme: "TEE-TDX-Quote-v4",
            arbiter: "LatticeJudge (#4)",
            disputeId: 2,
            ruling: "REFUND_TO_CLIENT",
            responseCode: 2,
            webkitP95Ms: 14.8,
            specThresholdMs: 10.0,
            confidenceBps: 8150,
            sigAlg: "ML-DSA-65/Dilithium-3",
          }),
        },
        {
          arbiterAgentId: 5,
          name: "Sentinel-7",
          monogram: "S7",
          reputationScore: 99,
          isYou: true,
          ruling: 0,
          votedAt: 0,
          reasoningSummary: "",
          reasoningHash: ZERO_BYTES32,
          proofURI: "",
          validationRequestId:
            "0x9d81f3a6c2e507b4d9a1c3f8e2b604d7a9c5e1f3b8d2a6c0e4f9b1d3a7c5e833",
          validationStatus: "Pending",
          responseCode: 0,
          proofHex: "0x",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // OPEN DISPUTE #2: #DSP-03
    // -----------------------------------------------------------------------
    {
      disputeId: 3,
      code: "#DSP-03",
      projectId: 105,
      projectTitle: "Zero-Knowledge Proof Verifier Circuit",
      milestoneIndex: 0,
      milestoneTitle: "Halo2 Constraint System & Verifier",
      amount: 1_200_000_000n, // $1,200.00 tUSD8
      status: 0,
      openedBy: "0x94D2a610E7c8B34f01A9e52D63fC8814a207C311",
      clientAgentId: 8,
      clientAddress: "0x94D2a610E7c8B34f01A9e52D63fC8814a207C311",
      freelancerAgentId: 11,
      freelancerAddress: "0x5E1b4482D9a7C031f6B28d94E11A7059c382F8D0",
      deliverableURI:
        "ipfs://bafybeizkverifier105m0halo2circuit88c/verifier-bundle.json",
      deliverableHash:
        "0x3d91b7c4e2a80f65d1c3e9a7b4f208c6d5a1e9b3f7c2d8a4e6b0c1f5a9d3e744",
      deliverableSummary:
        "Submitted Halo2 Plonkish verifier circuit, Solidity verifier contract, and constraint audit report confirming 0 under-constrained witness columns.",
      evidenceURI:
        "ipfs://bafybeiclientclaim105m0gasceiling/dispute-brief.json",
      evidenceHash:
        "0x6e20a4c8f1b59d37e8a2c6f0b4d19e7a3c5f8b2d0e6a9c4f1b7d3e5a8c2f6055",
      evidenceSummary:
        "Client disputes on-chain verification gas usage (318k gas vs 280k soft target) on Aevum L2 testnet and seeks partial rework before escrow release.",
      evidenceClaimTag: "Contested Gas Target: 318k vs 280k gas",
      createdAt: nowSec - 378,
      votingDeadline: nowSec + 53 * 60 + 42, // 53m 42s remaining
      releaseVotes: 1,
      refundVotes: 0,
      arbiters: [
        {
          arbiterAgentId: 6,
          name: "VerifierX",
          monogram: "VX",
          reputationScore: 95,
          isYou: false,
          ruling: 1,
          votedAt: nowSec - 190,
          reasoningSummary:
            "Soundness proof and constraint audit are complete. 280k gas was marked non-binding advisory in M0 spec; 318k is well within Aevum L2 block gas budget.",
          reasoningHash:
            "0x1b6c8e4a2d90f35b7c1e4a8d2f60b9c3e5a7d1f4b8c2e6a0d3f7b1c5e9a2d666",
          proofURI:
            "ipfs://bafybeiverifierx06dsp03verdictrelease/attestation.json",
          validationRequestId:
            "0x5a9e3c1b7d40f82e6a1c5b9d3f70e2a4c8b6d0f4e8a2c6b0d4f8e2a6c0b4d877",
          validationStatus: "Approved",
          responseCode: 1,
          blockNumber: 1_843_002,
          proofHex: encodeAttestationHex({
            scheme: "zkML-EZKL-v0.9",
            arbiter: "VerifierX (#6)",
            disputeId: 3,
            ruling: "RELEASE_TO_FREELANCER",
            responseCode: 1,
            verifierGas: 318420,
            soundnessVerified: true,
            confidenceBps: 9180,
          }),
        },
        {
          arbiterAgentId: 3,
          name: "AuditMind",
          monogram: "AM",
          reputationScore: 97,
          isYou: false,
          ruling: 0,
          votedAt: 0,
          reasoningSummary: "",
          reasoningHash: ZERO_BYTES32,
          proofURI: "",
          validationRequestId:
            "0x8b2f4d6a0c91e35b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e88",
          validationStatus: "Pending",
          responseCode: 0,
          proofHex: "0x",
        },
        {
          arbiterAgentId: 4,
          name: "LatticeJudge",
          monogram: "LJ",
          reputationScore: 93,
          isYou: false,
          ruling: 0,
          votedAt: 0,
          reasoningSummary: "",
          reasoningHash: ZERO_BYTES32,
          proofURI: "",
          validationRequestId:
            "0x3c7e9a1b5d20f46c8e0a2b4d6f8c0e2a4b6d8f0c2e4a6b8d0f2c4e6a8b0d2f99",
          validationStatus: "Pending",
          responseCode: 0,
          proofHex: "0x",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // PAST RESOLVED #1: #DSP-01 (2 Release — 1 Refund, 3/3 Verified)
    // -----------------------------------------------------------------------
    {
      disputeId: 1,
      code: "#DSP-01",
      projectId: 89,
      projectTitle: "zkSNARK Circuit",
      milestoneIndex: 1,
      milestoneTitle: "zkSNARK Circuit",
      amount: 1_000_000_000n, // $1,000.00 tUSD8
      status: 1, // ResolvedRelease
      openedBy: "0x62A1f408C3b9E71d55a0C824b19F3E72d4408B9C",
      clientAgentId: 9,
      clientAddress: "0x62A1f408C3b9E71d55a0C824b19F3E72d4408B9C",
      freelancerAgentId: 14,
      freelancerAddress: "0x8F4c2291A0d6E53b7C18a490D2e5F713c6019A44",
      deliverableURI: "ipfs://bafybeidsp01zksnarkcircuit/deliverable.json",
      deliverableHash:
        "0xa1c3e5f7b9d02468a1c3e5f7b9d02468a1c3e5f7b9d02468a1c3e5f7b9d02468",
      deliverableSummary:
        "Groth16 witness generator and verifier key bundle with deterministic trusted setup transcript.",
      evidenceURI: "ipfs://bafybeidsp01clientclaim/evidence.json",
      evidenceHash:
        "0xb2d4f6a8c0e13579b2d4f6a8c0e13579b2d4f6a8c0e13579b2d4f6a8c0e13579",
      evidenceSummary:
        "Client contested constraint count variance (+3.1%) relative to initial RFC estimate.",
      evidenceClaimTag: "Constraint Count Variance (+3.1%)",
      createdAt: nowSec - 86_400 * 3,
      votingDeadline: nowSec - 86_400 * 3 + 3600,
      releaseVotes: 2,
      refundVotes: 1,
      arbiters: [
        {
          arbiterAgentId: 3,
          name: "AuditMind",
          monogram: "AM",
          reputationScore: 97,
          isYou: false,
          ruling: 1,
          votedAt: nowSec - 86_400 * 3 + 640,
          reasoningSummary:
            "Circuit passes all soundness invariants; +3.1% constraint overhead is within standard RFC tolerance.",
          reasoningHash:
            "0xd101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          proofURI: "ipfs://bafybeidsp01arb3proof/attestation.json",
          validationRequestId:
            "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          validationStatus: "Approved",
          responseCode: 1,
          blockNumber: 1_811_420,
          proofHex: encodeAttestationHex({
            scheme: "zkML-RISC0-v1.2",
            arbiter: "AuditMind (#3)",
            disputeId: 1,
            ruling: "RELEASE_TO_FREELANCER",
            responseCode: 1,
            confidenceBps: 9640,
          }),
        },
        {
          arbiterAgentId: 5,
          name: "Sentinel-7",
          monogram: "S7",
          reputationScore: 99,
          isYou: true,
          ruling: 1,
          votedAt: nowSec - 86_400 * 3 + 1120,
          reasoningSummary:
            "Verified Groth16 proof generation and on-chain verification on Aevum Testnet. Majority quorum favors freelancer release.",
          reasoningHash:
            "0xd101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          proofURI: "ipfs://bafybeidsp01arb5proof/attestation.json",
          validationRequestId:
            "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          validationStatus: "Approved",
          responseCode: 1,
          blockNumber: 1_811_489,
          proofHex: encodeAttestationHex({
            scheme: "TEE-TDX-Quote-v4",
            arbiter: "Sentinel-7 (#5)",
            disputeId: 1,
            ruling: "RELEASE_TO_FREELANCER",
            responseCode: 1,
            confidenceBps: 9510,
          }),
        },
        {
          arbiterAgentId: 4,
          name: "LatticeJudge",
          monogram: "LJ",
          reputationScore: 93,
          isYou: false,
          ruling: 2,
          votedAt: nowSec - 86_400 * 3 + 1480,
          reasoningSummary:
            "Minority dissent: recommended tighter constraint bound enforcement prior to release.",
          reasoningHash:
            "0xd101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e03",
          proofURI: "ipfs://bafybeidsp01arb4proof/attestation.json",
          validationRequestId:
            "0xe101a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e03",
          validationStatus: "Approved",
          responseCode: 2,
          blockNumber: 1_811_533,
          proofHex: encodeAttestationHex({
            scheme: "TEE-TDX-Quote-v4",
            arbiter: "LatticeJudge (#4)",
            disputeId: 1,
            ruling: "REFUND_TO_CLIENT",
            responseCode: 2,
            confidenceBps: 7420,
          }),
        },
      ],
    },

    // -----------------------------------------------------------------------
    // PAST RESOLVED #2: #DSP-00 (2 Refund — 0 Release, 2/3 Verified)
    // -----------------------------------------------------------------------
    {
      disputeId: 0,
      code: "#DSP-00",
      projectId: 81,
      projectTitle: "Architecture Spec",
      milestoneIndex: 0,
      milestoneTitle: "Architecture Spec",
      amount: 850_000_000n, // $850.00 tUSD8
      status: 2, // ResolvedRefund
      openedBy: "0x4B8e9102F7a3D54c61E0b294A8c7F135d9204C7A",
      clientAgentId: 7,
      clientAddress: "0x4B8e9102F7a3D54c61E0b294A8c7F135d9204C7A",
      freelancerAgentId: 12,
      freelancerAddress: "0x1D9a5573E4b8C20f93A6d148F7e2B604c8135E2F",
      deliverableURI: "ipfs://bafybeidsp00archspec/deliverable.json",
      deliverableHash:
        "0xc3e5a7b9d1f24680c3e5a7b9d1f24680c3e5a7b9d1f24680c3e5a7b9d1f24680",
      deliverableSummary:
        "Draft protocol architecture memo missing threat model and ERC-8004 interface diagrams.",
      evidenceURI: "ipfs://bafybeidsp00clientclaim/evidence.json",
      evidenceHash:
        "0xd4f6b8c0e2a35791d4f6b8c0e2a35791d4f6b8c0e2a35791d4f6b8c0e2a35791",
      evidenceSummary:
        "Core sections 3 and 4 of Milestone M0 spec were omitted from IPFS bundle.",
      evidenceClaimTag: "Incomplete Deliverable Spec",
      createdAt: nowSec - 86_400 * 6,
      votingDeadline: nowSec - 86_400 * 6 + 3600,
      releaseVotes: 0,
      refundVotes: 2,
      arbiters: [
        {
          arbiterAgentId: 3,
          name: "AuditMind",
          monogram: "AM",
          reputationScore: 97,
          isYou: false,
          ruling: 2,
          votedAt: nowSec - 86_400 * 6 + 510,
          reasoningSummary:
            "Verified missing threat model and state-machine invariants required by M0 acceptance criteria.",
          reasoningHash:
            "0xf000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          proofURI: "ipfs://bafybeidsp00arb3proof/attestation.json",
          validationRequestId:
            "0xa000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          validationStatus: "Approved",
          responseCode: 2,
          blockNumber: 1_794_210,
          proofHex: encodeAttestationHex({
            scheme: "zkML-RISC0-v1.2",
            arbiter: "AuditMind (#3)",
            disputeId: 0,
            ruling: "REFUND_TO_CLIENT",
            responseCode: 2,
            missingSections: ["ThreatModel", "ERC8004Sequence"],
          }),
        },
        {
          arbiterAgentId: 6,
          name: "VerifierX",
          monogram: "VX",
          reputationScore: 95,
          isYou: false,
          ruling: 2,
          votedAt: nowSec - 86_400 * 6 + 980,
          reasoningSummary:
            "Confirmed deliverable hash points to incomplete draft. 2-of-3 quorum reached for client refund.",
          reasoningHash:
            "0xf000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          proofURI: "ipfs://bafybeidsp00arb6proof/attestation.json",
          validationRequestId:
            "0xa000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          validationStatus: "Approved",
          responseCode: 2,
          blockNumber: 1_794_265,
          proofHex: encodeAttestationHex({
            scheme: "zkML-EZKL-v0.9",
            arbiter: "VerifierX (#6)",
            disputeId: 0,
            ruling: "REFUND_TO_CLIENT",
            responseCode: 2,
            confidenceBps: 9810,
          }),
        },
        {
          arbiterAgentId: 4,
          name: "LatticeJudge",
          monogram: "LJ",
          reputationScore: 93,
          isYou: false,
          ruling: 0,
          votedAt: 0,
          reasoningSummary: "Quorum reached prior to third seat vote.",
          reasoningHash: ZERO_BYTES32,
          proofURI: "",
          validationRequestId:
            "0xa000a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e03",
          validationStatus: "Pending",
          responseCode: 0,
          proofHex: "0x",
        },
      ],
    },

    // -----------------------------------------------------------------------
    // PAST RESOLVED #3: #DSP-99 (1 — 1 Expired Tie -> Default Refund, 2/3 Verified)
    // -----------------------------------------------------------------------
    {
      disputeId: 99,
      code: "#DSP-99",
      projectId: 74,
      projectTitle: "Security Audit",
      milestoneIndex: 2,
      milestoneTitle: "Security Audit",
      amount: 1_500_000_000n, // $1,500.00 tUSD8
      status: 2, // ResolvedRefund (default on expired tie)
      expiredTie: true,
      openedBy: "0x2E7f3309A1b5C84d62F0e913B4a7D625c8019E4B",
      clientAgentId: 10,
      clientAddress: "0x2E7f3309A1b5C84d62F0e913B4a7D625c8019E4B",
      freelancerAgentId: 15,
      freelancerAddress: "0x9C3b7741D2e6A05f84B1c392E5d8F716a0248D3C",
      deliverableURI: "ipfs://bafybeidsp99secaudit/deliverable.json",
      deliverableHash:
        "0xe5a7c9d1f3b46802e5a7c9d1f3b46802e5a7c9d1f3b46802e5a7c9d1f3b46802",
      deliverableSummary:
        "Static analysis + manual audit report covering 6 core Solidity contracts.",
      evidenceURI: "ipfs://bafybeidsp99clientclaim/evidence.json",
      evidenceHash:
        "0xf6b8d0e2a4c57913f6b8d0e2a4c57913f6b8d0e2a4c57913f6b8d0e2a4c57913",
      evidenceSummary:
        "Disputed reentrancy PoC reproduction steps; 3rd arbiter timed out before voting deadline.",
      evidenceClaimTag: "Expired 1–1 Tie (Default Client Refund)",
      createdAt: nowSec - 86_400 * 11,
      votingDeadline: nowSec - 86_400 * 11 + 3600,
      releaseVotes: 1,
      refundVotes: 1,
      arbiters: [
        {
          arbiterAgentId: 5,
          name: "Sentinel-7",
          monogram: "S7",
          reputationScore: 99,
          isYou: true,
          ruling: 1,
          votedAt: nowSec - 86_400 * 11 + 890,
          reasoningSummary:
            "Audit findings and remediation diffs meet M2 scope; PoC reproduces cleanly on Foundry.",
          reasoningHash:
            "0x9900a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          proofURI: "ipfs://bafybeidsp99arb5proof/attestation.json",
          validationRequestId:
            "0xb990a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e01",
          validationStatus: "Approved",
          responseCode: 1,
          blockNumber: 1_760_104,
          proofHex: encodeAttestationHex({
            scheme: "TEE-TDX-Quote-v4",
            arbiter: "Sentinel-7 (#5)",
            disputeId: 99,
            ruling: "RELEASE_TO_FREELANCER",
            responseCode: 1,
            confidenceBps: 8820,
          }),
        },
        {
          arbiterAgentId: 4,
          name: "LatticeJudge",
          monogram: "LJ",
          reputationScore: 93,
          isYou: false,
          ruling: 2,
          votedAt: nowSec - 86_400 * 11 + 1620,
          reasoningSummary:
            "Gas griefing vector in fallback hook was not flagged in severity matrix.",
          reasoningHash:
            "0x9900a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          proofURI: "ipfs://bafybeidsp99arb4proof/attestation.json",
          validationRequestId:
            "0xb990a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e02",
          validationStatus: "Approved",
          responseCode: 2,
          blockNumber: 1_760_198,
          proofHex: encodeAttestationHex({
            scheme: "TEE-TDX-Quote-v4",
            arbiter: "LatticeJudge (#4)",
            disputeId: 99,
            ruling: "REFUND_TO_CLIENT",
            responseCode: 2,
            confidenceBps: 7940,
          }),
        },
        {
          arbiterAgentId: 6,
          name: "VerifierX",
          monogram: "VX",
          reputationScore: 95,
          isYou: false,
          ruling: 0,
          votedAt: 0,
          reasoningSummary:
            "Arbiter did not submit vote before votingDeadline. Finalized via finalizeExpiredDispute() defaulting to Client Refund.",
          reasoningHash: ZERO_BYTES32,
          proofURI: "",
          validationRequestId:
            "0xb990a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e03",
          validationStatus: "Rejected",
          responseCode: 0,
          proofHex: "0x",
        },
      ],
    },
  ];
}
