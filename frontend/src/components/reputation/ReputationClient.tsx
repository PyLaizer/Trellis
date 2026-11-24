"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import {
  ArrowRight,
  Award,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  Hash,
  MessageSquareQuote,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { hexToString, keccak256, stringToBytes } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { ProofInspectorModal } from "@/components/disputes/ProofInspectorModal";
import {
  AGENT_ROLE_LABELS,
  parseAgentCardUri,
  roleMonogram,
  toAgentRoleId,
} from "@/lib/agentCard";
import { aevumTestnet } from "@/lib/chains";
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
} from "@/lib/contracts/abis";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
} from "@/lib/contracts/addresses";
import {
  explorerAddressUrl,
  shortenAddress,
  shortenHash,
} from "@/lib/format";
import {
  ZERO_BYTES32,
  type ArbiterSeatRecord,
  type DisputeRecord,
  type RulingId,
} from "@/lib/mockDisputesData";
import {
  DEFAULT_REPUTATION_NOW_SEC,
  createMockFeedbackEntries,
  createMockReputationAgents,
  createMockValidationLogs,
  type AgentReputationProfile,
  type FeedbackEntryRecord,
  type FeedbackTag,
  type ReputationRole,
  type ValidationLogRecord,
  type ValidationStatusLabel,
} from "@/lib/mockReputationData";

type RoleFilterTab = "ALL" | "Client" | "Freelancer" | "Arbiter";
type TagFilterTab = "ALL" | FeedbackTag;

interface ToastMessage {
  id: string;
  title: string;
  description: string;
  tone: "teal" | "copper" | "ice";
}

interface OnChainAgentInfoTuple {
  role: number;
  active: boolean;
  registeredAt: bigint;
}

interface OnChainFeedbackTuple {
  agentId: bigint;
  reviewer: `0x${string}`;
  score: number;
  timestamp: bigint;
  revoked: boolean;
  tag: `0x${string}`;
  referenceId: `0x${string}`;
  commentURI: string;
  commentHash: `0x${string}`;
}

interface OnChainValidationTuple {
  requestId: `0x${string}`;
  validatorAgentId: bigint;
  subjectId: bigint;
  requester: `0x${string}`;
  status: number;
  responseCode: number;
  requestedAt: bigint;
  respondedAt: bigint;
  evidenceHash: `0x${string}`;
  evidenceURI: string;
  reasoningHash: `0x${string}`;
  proofURI: string;
  proof: `0x${string}`;
}

const ROLE_TABS: { id: RoleFilterTab; label: string }[] = [
  { id: "ALL", label: "All Agents" },
  { id: "Client", label: "Clients" },
  { id: "Freelancer", label: "Freelancers" },
  { id: "Arbiter", label: "AI Arbiters" },
];

const TAG_TABS: { id: TagFilterTab; label: string }[] = [
  { id: "ALL", label: "All Tags" },
  { id: "milestone", label: "milestone" },
  { id: "arbiter", label: "arbiter" },
];

const PAGE_SIZE = 5;
const ARBITER_TAG_HASH = keccak256(stringToBytes("arbiter")).toLowerCase();

function decodeFeedbackTag(tagHex: `0x${string}`): FeedbackTag {
  if (tagHex.toLowerCase() === ARBITER_TAG_HASH) return "arbiter";
  try {
    const raw = hexToString(tagHex).replace(/\0/g, "").trim().toLowerCase();
    if (raw === "arbiter") return "arbiter";
  } catch {
    // Non-ASCII bytes32 tag
  }
  return "milestone";
}

function formatRelativeTime(timestampSec: number, nowSec: number): string {
  if (!timestampSec || timestampSec <= 0) return "Just now";
  const diff = Math.max(0, nowSec - timestampSec);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function scoreToneClasses(score: number): string {
  if (score >= 80) {
    return "border-teal-500/30 bg-teal-500/10 text-teal-400";
  }
  if (score >= 50) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-400";
}

function toRulingId(code: number): RulingId {
  if (code === 1) return 1;
  if (code === 2) return 2;
  return 0;
}

function toValidationStatusLabel(code: number): ValidationStatusLabel {
  if (code === 1) return "Approved";
  if (code === 2) return "Rejected";
  return "Pending";
}

function inferProofTypeLabel(proofHex: `0x${string}`): string {
  if (!proofHex || proofHex === "0x") return "Awaiting Proof";
  try {
    const text = hexToString(proofHex);
    if (text.toLowerCase().includes("zkml") || text.toLowerCase().includes("risc0")) {
      return "zkML Proof";
    }
    if (text.toLowerCase().includes("tee") || text.toLowerCase().includes("tdx")) {
      return "TEE Attestation";
    }
  } catch {
    // Opaque binary bytes
  }
  return "Cryptographic Proof";
}

function buildDisputeAdapterForProof(
  target: ValidationLogRecord,
  allLogs: ValidationLogRecord[],
  agents: AgentReputationProfile[]
): DisputeRecord {
  const agentMap = new Map<number, AgentReputationProfile>();
  for (const agent of agents) {
    agentMap.set(agent.agentId, agent);
  }

  const sameSubjectLogs = allLogs.filter(
    (log) => log.subjectId === target.subjectId
  );

  const uniqueByValidator = new Map<number, ValidationLogRecord>();
  uniqueByValidator.set(target.validatorAgentId, target);
  for (const log of sameSubjectLogs) {
    if (!uniqueByValidator.has(log.validatorAgentId) && uniqueByValidator.size < 3) {
      uniqueByValidator.set(log.validatorAgentId, log);
    }
  }

  const seats: ArbiterSeatRecord[] = Array.from(uniqueByValidator.values()).map(
    (log) => {
      const profile = agentMap.get(log.validatorAgentId);
      return {
        arbiterAgentId: log.validatorAgentId,
        name: log.validatorName,
        monogram: profile?.monogram ?? `A${log.validatorAgentId}`,
        reputationScore: profile?.averageScore ?? 95,
        isYou: false,
        ruling: toRulingId(log.responseCode),
        votedAt: log.respondedAt,
        reasoningSummary: log.reasoningSummary,
        reasoningHash: log.reasoningHash,
        proofURI: log.proofURI,
        validationRequestId: log.requestId,
        validationStatus: log.status,
        responseCode: log.responseCode,
        proofHex: log.proofHex,
        blockNumber: log.blockNumber,
      };
    }
  );

  // Pad to 3 distinct tribunal seats required by DisputeRecord tuple
  const fallbackArbiters = agents.filter(
    (a) =>
      a.role === "Arbiter" &&
      !seats.some((s) => s.arbiterAgentId === a.agentId)
  );
  let fallbackCursor = 0;
  let syntheticId = 900;
  while (seats.length < 3) {
    const candidate = fallbackArbiters[fallbackCursor];
    fallbackCursor += 1;
    const seatId = candidate ? candidate.agentId : syntheticId++;
    seats.push({
      arbiterAgentId: seatId,
      name: candidate ? candidate.name : `Tribunal Seat #${seatId}`,
      monogram: candidate ? candidate.monogram : `A${seatId}`,
      reputationScore: candidate ? candidate.averageScore : 95,
      isYou: false,
      ruling: 0,
      votedAt: 0,
      reasoningSummary: "",
      reasoningHash: ZERO_BYTES32,
      proofURI: "",
      validationRequestId: ZERO_BYTES32,
      validationStatus: "Pending",
      responseCode: 0,
      proofHex: "0x",
    });
  }

  const releaseVotes = seats.filter((s) => s.ruling === 1).length;
  const refundVotes = seats.filter((s) => s.ruling === 2).length;
  const codeMatch = target.subjectLabel.match(/#DSP-\d+/i);
  const code = codeMatch
    ? codeMatch[0].toUpperCase()
    : `#DSP-${String(target.subjectId).padStart(2, "0")}`;

  return {
    disputeId: target.subjectId,
    code,
    projectId: target.subjectId === 2 ? 102 : target.subjectId === 1 ? 89 : target.subjectId,
    projectTitle: target.subjectLabel,
    milestoneIndex: 1,
    milestoneTitle: target.subjectLabel,
    amount: 0n,
    status: releaseVotes >= 2 ? 1 : refundVotes >= 2 ? 2 : 0,
    openedBy: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
    clientAgentId: 1,
    clientAddress: "0x71C498301B5c488f59B4d7137D099310E8819A2B",
    freelancerAgentId: 2,
    freelancerAddress: "0x3A9f810C7d5B229aE8431bA10E447908c7544F1E",
    deliverableURI: "",
    deliverableHash: ZERO_BYTES32,
    deliverableSummary: "",
    evidenceURI: "",
    evidenceHash: ZERO_BYTES32,
    evidenceSummary: "",
    evidenceClaimTag: target.proofTypeLabel,
    createdAt: target.respondedAt,
    votingDeadline: target.respondedAt + 3600,
    releaseVotes,
    refundVotes,
    arbiters: [seats[0], seats[1], seats[2]],
  };
}

interface TrustRingProps {
  score: number;
  isArbiter: boolean;
}

function TrustRing({ score, isArbiter }: TrustRingProps) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const targetOffset = circumference * (1 - clamped / 100);
  const strokeColor = isArbiter ? "#38BDF8" : "#EA7A3D";
  const starRating = (clamped / 20).toFixed(2);

  return (
    <div className="relative flex h-[84px] w-[84px] shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 84 84"
        className="h-[84px] w-[84px] -rotate-90"
        aria-label={`Trust score ${clamped} out of 100`}
      >
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke="#1E2536"
          strokeWidth="6"
        />
        <motion.circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-0.5 font-mono leading-none">
          <span className="text-lg font-bold text-slate-50">{clamped}</span>
          <span className="text-[10px] text-slate-500">/100</span>
        </div>
        <div className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[10px] text-amber-400">
          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
          {starRating}
        </div>
      </div>
    </div>
  );
}

export function ReputationClient() {
  // Deterministic SSR anchor; re-anchored to client wall clock on mount
  const [nowSec, setNowSec] = useState<number>(DEFAULT_REPUTATION_NOW_SEC);

  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
  }, []);

  // Interactive filter & pagination state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<RoleFilterTab>("ALL");
  const [tagFilter, setTagFilter] = useState<TagFilterTab>("ALL");
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Proof Inspector modal state
  const [inspectModalState, setInspectModalState] = useState<{
    dispute: DisputeRecord;
    arbiterAgentId: number;
  } | null>(null);

  // Copy feedback & toasts
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(toast: Omit<ToastMessage, "id">) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4800);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleCopy(key: string, value: string, label?: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setCopiedKey(key);
    if (label) {
      pushToast({
        title: `${label} Copied`,
        description: shortenHash(value, 14, 10),
        tone: "ice",
      });
    }
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  }

  // Cursor-tracking Copper & Ice radial spotlight for Header Banner
  const mouseX = useMotionValue(380);
  const mouseY = useMotionValue(110);
  const headerSpotlight = useMotionTemplate`radial-gradient(520px circle at ${mouseX}px ${mouseY}px, rgba(234, 122, 61, 0.13), rgba(56, 189, 248, 0.07) 46%, transparent 72%)`;

  function handleHeaderMouseMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  }

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Reads (when IS_PROTOCOL_DEPLOYED is true)                  */
  /* ------------------------------------------------------------------------ */

  const { data: onChainTotalAgents } = useReadContract({
    address: CONTRACT_ADDRESSES.IdentityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "totalAgents",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const agentIdsToFetch = useMemo<bigint[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !onChainTotalAgents) return [];
    const total = Number(onChainTotalAgents);
    const capped = Math.min(Math.max(total, 0), 20);
    return Array.from({ length: capped }, (_, idx) => BigInt(idx + 1));
  }, [onChainTotalAgents]);

  const { data: onChainOwnersRaw } = useReadContracts({
    contracts: agentIdsToFetch.map((id) => ({
      address: CONTRACT_ADDRESSES.IdentityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "ownerOf" as const,
      args: [id] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && agentIdsToFetch.length > 0,
    },
  });

  const { data: onChainAgentInfosRaw } = useReadContracts({
    contracts: agentIdsToFetch.map((id) => ({
      address: CONTRACT_ADDRESSES.IdentityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getAgentInfo" as const,
      args: [id] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && agentIdsToFetch.length > 0,
    },
  });

  const { data: onChainTokenUrisRaw } = useReadContracts({
    contracts: agentIdsToFetch.map((id) => ({
      address: CONTRACT_ADDRESSES.IdentityRegistry,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "tokenURI" as const,
      args: [id] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && agentIdsToFetch.length > 0,
    },
  });

  const { data: onChainSummariesRaw } = useReadContracts({
    contracts: agentIdsToFetch.map((id) => ({
      address: CONTRACT_ADDRESSES.ReputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary" as const,
      args: [id] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && agentIdsToFetch.length > 0,
    },
  });

  const { data: onChainFeedbacksRaw } = useReadContracts({
    contracts: agentIdsToFetch.map((id) => ({
      address: CONTRACT_ADDRESSES.ReputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getAgentFeedbacks" as const,
      args: [id, 0n, 20n] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && agentIdsToFetch.length > 0,
    },
  });

  // Identify on-chain arbiter agent IDs to query ValidationRegistry.getValidatorRequests
  const onChainArbiterIds = useMemo<bigint[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !onChainAgentInfosRaw) return [];
    const ids: bigint[] = [];
    agentIdsToFetch.forEach((id, idx) => {
      const infoItem = onChainAgentInfosRaw[idx];
      if (infoItem?.status === "success" && infoItem.result) {
        const info = infoItem.result as unknown as OnChainAgentInfoTuple;
        if (Number(info.role) === 2) {
          ids.push(id);
        }
      }
    });
    return ids;
  }, [agentIdsToFetch, onChainAgentInfosRaw]);

  const { data: onChainValidatorReqIdsRaw } = useReadContracts({
    contracts: onChainArbiterIds.map((id) => ({
      address: CONTRACT_ADDRESSES.ValidationRegistry,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getValidatorRequests" as const,
      args: [id] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && onChainArbiterIds.length > 0,
    },
  });

  const flattenedValidationRequestIds = useMemo<`0x${string}`[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !onChainValidatorReqIdsRaw) return [];
    const unique = new Set<`0x${string}`>();
    for (const item of onChainValidatorReqIdsRaw) {
      if (item.status !== "success" || !Array.isArray(item.result)) continue;
      for (const reqId of item.result as readonly `0x${string}`[]) {
        unique.add(reqId);
      }
    }
    return Array.from(unique).slice(0, 24);
  }, [onChainValidatorReqIdsRaw]);

  const { data: onChainValidationsRaw } = useReadContracts({
    contracts: flattenedValidationRequestIds.map((reqId) => ({
      address: CONTRACT_ADDRESSES.ValidationRegistry,
      abi: VALIDATION_REGISTRY_ABI,
      functionName: "getValidation" as const,
      args: [reqId] as const,
      chainId: aevumTestnet.id,
    })),
    query: {
      enabled:
        IS_PROTOCOL_DEPLOYED && flattenedValidationRequestIds.length > 0,
    },
  });

  /* ------------------------------------------------------------------------ */
  /* Unified Data Model (Live On-Chain OR Interactive Preview)                */
  /* ------------------------------------------------------------------------ */

  const agents = useMemo<AgentReputationProfile[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return createMockReputationAgents();
    }
    if (agentIdsToFetch.length === 0) return [];

    const profiles: AgentReputationProfile[] = [];
    agentIdsToFetch.forEach((idBig, idx) => {
      const agentId = Number(idBig);
      const ownerRes = onChainOwnersRaw?.[idx];
      const infoRes = onChainAgentInfosRaw?.[idx];
      const uriRes = onChainTokenUrisRaw?.[idx];
      const sumRes = onChainSummariesRaw?.[idx];

      const wallet: `0x${string}` =
        ownerRes?.status === "success" && typeof ownerRes.result === "string"
          ? (ownerRes.result as `0x${string}`)
          : "0x0000000000000000000000000000000000000000";

      const info =
        infoRes?.status === "success"
          ? (infoRes.result as unknown as OnChainAgentInfoTuple)
          : undefined;
      const roleId = toAgentRoleId(Number(info?.role ?? 0));
      const role: ReputationRole = AGENT_ROLE_LABELS[roleId];

      const rawUri =
        uriRes?.status === "success" && typeof uriRes.result === "string"
          ? uriRes.result
          : "";
      const parsedCard = parseAgentCardUri(rawUri);
      const name = parsedCard?.name ?? `${role} Agent #${agentId}`;

      const summaryTuple =
        sumRes?.status === "success" && Array.isArray(sumRes.result)
          ? (sumRes.result as readonly [bigint, number])
          : undefined;
      const reviewCount = summaryTuple ? Number(summaryTuple[0]) : 0;
      const averageScore = summaryTuple ? Number(summaryTuple[1]) : 0;

      profiles.push({
        agentId,
        name,
        monogram: roleMonogram(roleId, agentId),
        role,
        wallet,
        averageScore,
        reviewCount,
        subtitleMetric: `${reviewCount} on-chain ${reviewCount === 1 ? "attestation" : "attestations"}`,
        footerHighlight:
          role === "Arbiter"
            ? "ERC-8004 Validation Active"
            : "Payment-Gated Reputation",
        active: Boolean(info?.active ?? true),
      });
    });

    return profiles;
  }, [
    agentIdsToFetch,
    onChainOwnersRaw,
    onChainAgentInfosRaw,
    onChainTokenUrisRaw,
    onChainSummariesRaw,
  ]);

  const feedbackEntries = useMemo<FeedbackEntryRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return createMockFeedbackEntries(nowSec);
    }
    if (!onChainFeedbacksRaw) return [];

    const agentMap = new Map<number, AgentReputationProfile>();
    for (const a of agents) agentMap.set(a.agentId, a);

    const rows: FeedbackEntryRecord[] = [];
    onChainFeedbacksRaw.forEach((item, idx) => {
      if (item.status !== "success" || !Array.isArray(item.result)) return;
      const list = item.result as unknown as OnChainFeedbackTuple[];
      list.forEach((fb, fbIdx) => {
        const targetId = Number(fb.agentId);
        const profile = agentMap.get(targetId);
        const tag = decodeFeedbackTag(fb.tag);
        rows.push({
          id: `chain-${idx}-${fbIdx}-${fb.referenceId}`,
          agentId: targetId,
          agentName: profile?.name ?? `Agent #${targetId}`,
          agentRole: profile?.role ?? "Client",
          reviewer: fb.reviewer,
          reviewerLabel: shortenAddress(fb.reviewer),
          score: Number(fb.score),
          tag,
          referenceId: fb.referenceId,
          referenceLabel:
            tag === "arbiter"
              ? "Dispute Consensus Ref"
              : "Milestone Settlement Ref",
          comment: fb.commentURI
            ? `Attestation URI: ${fb.commentURI}`
            : "Immutable payment-gated feedback recorded on ReputationRegistry.",
          commentURI: fb.commentURI,
          timestamp: Number(fb.timestamp),
          revoked: fb.revoked,
        });
      });
    });

    return rows.sort((a, b) => b.timestamp - a.timestamp);
  }, [nowSec, onChainFeedbacksRaw, agents]);

  const validationLogs = useMemo<ValidationLogRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return createMockValidationLogs(nowSec);
    }
    if (!onChainValidationsRaw) return [];

    const agentMap = new Map<number, AgentReputationProfile>();
    for (const a of agents) agentMap.set(a.agentId, a);

    const logs: ValidationLogRecord[] = [];
    for (const item of onChainValidationsRaw) {
      if (item.status !== "success" || !item.result) continue;
      const v = item.result as unknown as OnChainValidationTuple;
      const validatorId = Number(v.validatorAgentId);
      const subjectId = Number(v.subjectId);
      const profile = agentMap.get(validatorId);
      const responseCode = Number(v.responseCode);

      logs.push({
        requestId: v.requestId,
        validatorAgentId: validatorId,
        validatorName: profile?.name ?? `Arbiter #${validatorId}`,
        subjectId,
        subjectLabel: `Dispute #DSP-${String(subjectId).padStart(2, "0")}`,
        status: toValidationStatusLabel(Number(v.status)),
        responseCode,
        reasoningHash: v.reasoningHash,
        reasoningSummary:
          responseCode === 1
            ? "Arbiter attestation verified in favor of Freelancer release."
            : responseCode === 2
              ? "Arbiter attestation verified in favor of Client refund."
              : "Awaiting arbiter proof submission.",
        proofURI: v.proofURI,
        proofHex: v.proof,
        proofTypeLabel: inferProofTypeLabel(v.proof),
        respondedAt: Number(v.respondedAt),
        blockNumber: 0,
      });
    }

    return logs.sort((a, b) => b.respondedAt - a.respondedAt);
  }, [nowSec, onChainValidationsRaw, agents]);

  /* ------------------------------------------------------------------------ */
  /* Filtering, Ranking & Pagination                                          */
  /* ------------------------------------------------------------------------ */

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchingAgents = useMemo(() => {
    return agents
      .filter((agent) => {
        if (roleFilter !== "ALL" && agent.role !== roleFilter) return false;
        if (!normalizedQuery) return true;
        const idTokens = [`#${agent.agentId}`, `${agent.agentId}`];
        return (
          agent.name.toLowerCase().includes(normalizedQuery) ||
          agent.wallet.toLowerCase().includes(normalizedQuery) ||
          agent.role.toLowerCase().includes(normalizedQuery) ||
          idTokens.some((tok) => tok === normalizedQuery || tok.includes(normalizedQuery))
        );
      })
      .sort((a, b) => b.averageScore - a.averageScore || b.reviewCount - a.reviewCount);
  }, [agents, roleFilter, normalizedQuery]);

  const topThreeAgents = useMemo(
    () => matchingAgents.slice(0, 3),
    [matchingAgents]
  );

  const selectedAgentProfile = useMemo(
    () => agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const filteredFeedbacks = useMemo(() => {
    return feedbackEntries.filter((entry) => {
      if (selectedAgentId !== null && entry.agentId !== selectedAgentId) {
        return false;
      }
      if (roleFilter !== "ALL" && entry.agentRole !== roleFilter) {
        return false;
      }
      if (tagFilter !== "ALL" && entry.tag !== tagFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return (
        entry.agentName.toLowerCase().includes(normalizedQuery) ||
        `#${entry.agentId}`.includes(normalizedQuery) ||
        entry.reviewer.toLowerCase().includes(normalizedQuery) ||
        entry.reviewerLabel.toLowerCase().includes(normalizedQuery) ||
        entry.tag.toLowerCase().includes(normalizedQuery) ||
        entry.referenceLabel.toLowerCase().includes(normalizedQuery) ||
        entry.comment.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [feedbackEntries, selectedAgentId, roleFilter, tagFilter, normalizedQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredFeedbacks.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, tagFilter, selectedAgentId]);

  const paginatedFeedbacks = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredFeedbacks.slice(start, start + PAGE_SIZE);
  }, [filteredFeedbacks, safePage]);

  const filteredValidationLogs = useMemo(() => {
    return validationLogs.filter((log) => {
      if (
        selectedAgentId !== null &&
        log.validatorAgentId !== selectedAgentId
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return (
        log.validatorName.toLowerCase().includes(normalizedQuery) ||
        `#${log.validatorAgentId}`.includes(normalizedQuery) ||
        log.subjectLabel.toLowerCase().includes(normalizedQuery) ||
        log.requestId.toLowerCase().includes(normalizedQuery) ||
        log.proofTypeLabel.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [validationLogs, selectedAgentId, normalizedQuery]);

  // Header aggregate stats
  const protocolTrustAvg = useMemo(() => {
    if (agents.length === 0) return 0;
    const sum = agents.reduce((acc, a) => acc + a.averageScore, 0);
    return Math.round(sum / agents.length);
  }, [agents]);

  const latestAnchoredBlock = useMemo(() => {
    return filteredValidationLogs.reduce(
      (max, item) => (item.blockNumber > max ? item.blockNumber : max),
      0
    );
  }, [filteredValidationLogs]);

  const pageStartIndex =
    filteredFeedbacks.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEndIndex = Math.min(
    safePage * PAGE_SIZE,
    filteredFeedbacks.length
  );

  /* ------------------------------------------------------------------------ */
  /* Interactive Handlers                                                     */
  /* ------------------------------------------------------------------------ */

  function handleInspectProof(log: ValidationLogRecord) {
    const adaptedDispute = buildDisputeAdapterForProof(
      log,
      validationLogs,
      agents
    );
    setInspectModalState({
      dispute: adaptedDispute,
      arbiterAgentId: log.validatorAgentId,
    });
  }

  function handleDownloadProofBundle() {
    const bundle = {
      protocol: "Trellis Quantum-Safe Escrow",
      standard: "ERC-8004 ValidationRegistry",
      network: "QDay Aevum Testnet (Chain ID 44005)",
      validationRegistry: CONTRACT_ADDRESSES.ValidationRegistry,
      exportedAt: new Date().toISOString(),
      filterAgentId: selectedAgentId,
      proofCount: filteredValidationLogs.length,
      proofs: filteredValidationLogs,
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = selectedAgentId
      ? `trellis-erc8004-proofs-agent-${selectedAgentId}.json`
      : "trellis-erc8004-validation-proof-bundle.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    pushToast({
      title: "Proof Bundle Downloaded",
      description: `Exported ${filteredValidationLogs.length} ERC-8004 validation ${
        filteredValidationLogs.length === 1 ? "receipt" : "receipts"
      } as JSON.`,
      tone: "teal",
    });
  }

  const reputationContractAddr = CONTRACT_ADDRESSES.ReputationRegistry;
  const validationContractAddr = CONTRACT_ADDRESSES.ValidationRegistry;
  const explorerReputationUrl = IS_PROTOCOL_DEPLOYED
    ? explorerAddressUrl(reputationContractAddr)
    : explorerAddressUrl(CONTRACT_ADDRESSES.tUSD8);
  const explorerValidationUrl = IS_PROTOCOL_DEPLOYED
    ? explorerAddressUrl(validationContractAddr)
    : explorerAddressUrl(CONTRACT_ADDRESSES.tUSD8);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* =================================================================== */}
      {/* 1. COMPACT HEADER BANNER (Lattice + Cursor-Tracking Spotlight)      */}
      {/* =================================================================== */}
      <section
        onMouseMove={handleHeaderMouseMove}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface p-6 sm:p-8"
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: headerSpotlight }}
        />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Left Copy */}
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ice/30 bg-ice/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ice">
                <ShieldCheck className="h-3.5 w-3.5" />
                ERC-8004 REPUTATION &amp; VALIDATION EXPLORER • SYBIL-RESISTANT
              </span>
              {!IS_PROTOCOL_DEPLOYED && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-copper/30 bg-copper/10 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-copper-400">
                  <Sparkles className="h-3 w-3" />
                  Interactive Preview Mode
                </span>
              )}
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
              On-Chain Reputation &amp;{" "}
              <span className="text-copper">Proof Explorer</span>
            </h1>

            <p className="mt-2.5 text-sm leading-relaxed text-slate-400 sm:text-[15px]">
              Inspect payment-gated milestone scores from{" "}
              <code className="font-mono text-xs text-slate-300">
                ReputationRegistry.sol
              </code>{" "}
              alongside immutable zkML &amp; TEE arbitration attestations anchored
              in{" "}
              <code className="font-mono text-xs text-slate-300">
                ValidationRegistry.sol
              </code>
              .
            </p>
          </div>

          {/* Right Cluster: Dual Contract Chips + Live Stat Pills */}
          <div className="flex flex-col gap-3 lg:items-end">
            {/* Dual Contract Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-canvas/75 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-copper" />
                <span className="font-mono text-[11px] font-medium text-slate-300">
                  ReputationRegistry
                </span>
                <code className="font-mono text-[11px] text-slate-500">
                  {IS_PROTOCOL_DEPLOYED
                    ? shortenAddress(reputationContractAddr, 6, 4)
                    : "0xRep...8004"}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      "rep-contract",
                      reputationContractAddr,
                      "ReputationRegistry"
                    )
                  }
                  className="text-slate-400 transition-colors hover:text-copper"
                  title="Copy ReputationRegistry address"
                >
                  {copiedKey === "rep-contract" ? (
                    <Check className="h-3.5 w-3.5 text-teal-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={explorerReputationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 transition-colors hover:text-ice"
                  title="Open on Aevum Explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-canvas/75 px-3 py-1.5 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-ice" />
                <span className="font-mono text-[11px] font-medium text-slate-300">
                  ValidationRegistry
                </span>
                <code className="font-mono text-[11px] text-slate-500">
                  {IS_PROTOCOL_DEPLOYED
                    ? shortenAddress(validationContractAddr, 6, 4)
                    : "0xVal...8004"}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      "val-contract",
                      validationContractAddr,
                      "ValidationRegistry"
                    )
                  }
                  className="text-slate-400 transition-colors hover:text-ice"
                  title="Copy ValidationRegistry address"
                >
                  {copiedKey === "val-contract" ? (
                    <Check className="h-3.5 w-3.5 text-teal-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={explorerValidationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 transition-colors hover:text-ice"
                  title="Open on Aevum Explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Live Stat Pills */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="rounded-xl border border-hairline bg-elevated/80 px-3.5 py-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Total Ratings
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-slate-100">
                  {feedbackEntries.length}
                </div>
              </div>

              <div className="rounded-xl border border-hairline bg-elevated/80 px-3.5 py-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Validation Proofs
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-ice">
                  {validationLogs.length}
                </div>
              </div>

              <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 px-3.5 py-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-teal-300/80">
                  Protocol Trust
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-teal-400">
                  {protocolTrustAvg}/100
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. SEARCH & ROLE FILTER BAR                                         */}
      {/* =================================================================== */}
      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-3.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Agent ID (#1), name, wallet address (0x...), or tag..."
            className="w-full rounded-xl border border-hairline bg-canvas/80 py-2.5 pl-10 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-ice/50 focus:outline-none focus:ring-1 focus:ring-ice/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search query"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-elevated hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Role Filter Sliding Pills */}
        <div
          role="tablist"
          aria-label="Filter agents by ERC-8004 role"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-hairline bg-canvas/70 p-1"
        >
          {ROLE_TABS.map((tab) => {
            const isActive = roleFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setRoleFilter(tab.id)}
                className={`relative rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? "text-slate-50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="rep-role-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className={`absolute inset-0 rounded-lg border ${
                      tab.id === "Arbiter"
                        ? "border-ice/40 bg-ice/15 shadow-ice-glow"
                        : "border-copper/40 bg-copper/15 shadow-copper-glow"
                    }`}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. TOP VERIFIED ERC-8004 AGENTS LEADERBOARD (3-Col Responsive Grid) */}
      {/* =================================================================== */}
      <section className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Award className="h-5 w-5 text-copper" />
            <h2 className="font-display text-lg font-bold text-slate-100">
              Top Verified ERC-8004 Agents
            </h2>
            <span className="rounded-full border border-hairline bg-elevated px-2.5 py-0.5 font-mono text-[11px] text-slate-400">
              Showing Top {topThreeAgents.length} of {matchingAgents.length}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Ranked by on-chain{" "}
            <code className="text-slate-300">ReputationRegistry.getSummary()</code>
          </span>
        </div>

        {topThreeAgents.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-surface p-8 text-center">
            <p className="text-sm text-slate-400">
              No verified ERC-8004 agents match your current filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setRoleFilter("ALL");
              }}
              className="mt-3 rounded-lg border border-copper/40 bg-copper/10 px-3.5 py-1.5 text-xs font-semibold text-copper-400 transition-colors hover:bg-copper/20"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {topThreeAgents.map((agent, idx) => {
              const isArbiter = agent.role === "Arbiter";
              const isSelected = selectedAgentId === agent.agentId;
              const rankLabel = `RANK #${idx + 1}`;

              return (
                <motion.article
                  key={agent.agentId}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: idx * 0.06 }}
                  whileHover={{ y: -3 }}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all ${
                    isSelected
                      ? isArbiter
                        ? "border-ice/60 shadow-ice-glow"
                        : "border-copper/60 shadow-copper-glow"
                      : "border-hairline hover:border-slate-600/80"
                  }`}
                >
                  {/* Role-Specific Top Accent Bar */}
                  <div
                    className={`h-1 w-full ${
                      isArbiter
                        ? "bg-gradient-to-r from-ice via-ice-400 to-teal-400"
                        : "bg-gradient-to-r from-copper via-copper-400 to-amber-400"
                    }`}
                  />

                  <div className="flex flex-1 flex-col p-5">
                    {/* Top Row: Rank Badge + Role Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider ${
                          idx === 0
                            ? "border-copper/40 bg-copper/15 text-copper-400"
                            : "border-hairline bg-elevated text-slate-300"
                        }`}
                      >
                        {rankLabel}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                          isArbiter
                            ? "border-ice/30 bg-ice/10 text-ice"
                            : agent.role === "Freelancer"
                              ? "border-copper/30 bg-copper/10 text-copper-400"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {isArbiter ? (
                          <Bot className="h-3 w-3" />
                        ) : agent.role === "Freelancer" ? (
                          <Briefcase className="h-3 w-3" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        {agent.role === "Arbiter" ? "AI Arbiter" : agent.role}
                      </span>
                    </div>

                    {/* Middle Row: Identity + Animated SVG Trust Ring */}
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold ${
                              isArbiter
                                ? "border-ice/35 bg-ice/10 text-ice"
                                : "border-copper/35 bg-copper/10 text-copper-400"
                            }`}
                          >
                            {agent.monogram}
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate font-display text-base font-bold text-slate-50">
                              {agent.name}
                            </h3>
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                              <span className="text-slate-300">
                                #{agent.agentId}
                              </span>
                              <span>•</span>
                              <span className="truncate">
                                {shortenAddress(agent.wallet, 5, 4)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-xs text-slate-400">
                          {agent.subtitleMetric}
                        </p>
                      </div>

                      <TrustRing
                        score={agent.averageScore}
                        isArbiter={isArbiter}
                      />
                    </div>

                    {/* Sybil-Resistant Payment-Gated Teal Banner */}
                    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-teal-400">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        SYBIL-RESISTANT • PAYMENT-GATED
                      </span>
                      <span className="font-mono text-[10px] text-teal-300/90">
                        {agent.reviewCount} revs
                      </span>
                    </div>

                    {/* Footer: Highlight + View Full History */}
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-hairline/80 pt-3.5">
                      <span className="truncate font-mono text-[11px] text-slate-400">
                        {agent.footerHighlight}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAgentId((prev) =>
                            prev === agent.agentId ? null : agent.agentId
                          )
                        }
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                          isSelected
                            ? "bg-ice/15 text-ice"
                            : "text-copper-400 hover:bg-copper/10 hover:text-copper"
                        }`}
                      >
                        {isSelected ? "Viewing History" : "View Full History"}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* ACTIVE AGENT FILTER CHIP (When a Leaderboard Card is Selected)      */}
      {/* =================================================================== */}
      <AnimatePresence>
        {selectedAgentProfile && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ice/35 bg-ice/10 px-4 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-ice">
                <ShieldCheck className="h-4 w-4" />
                Viewing Agent #{selectedAgentProfile.agentId} (
                {selectedAgentProfile.name})
              </span>
              <span className="text-slate-400">
                • Filtering Immutable Feedback Feed &amp; Validation Proofs Log
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSelectedAgentId(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-ice/40 bg-canvas/70 px-2.5 py-1 font-mono text-[11px] font-semibold text-ice transition-colors hover:bg-ice/20"
            >
              Clear
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =================================================================== */}
      {/* 4. TWO-COLUMN LIVE EXPLORER (7 Cols Feedback / 5 Cols Validations)  */}
      {/* =================================================================== */}
      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ----------------------------------------------------------------- */}
        {/* LEFT (7 COLS): IMMUTABLE FEEDBACK FEED (ReputationRegistry.sol)   */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface lg:col-span-7">
          {/* Feed Header */}
          <div className="flex flex-col gap-3 border-b border-hairline bg-elevated/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="h-4 w-4 text-copper" />
                <h2 className="font-display text-base font-bold text-slate-100">
                  Immutable Feedback Feed
                </h2>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                ReputationRegistry.sol • Non-repudiable escrow &amp; arbitration
                ratings
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Tag Filter Pills */}
              <div className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-canvas/80 p-1">
                {TAG_TABS.map((tab) => {
                  const isActive = tagFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTagFilter(tab.id)}
                      className={`relative rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                        isActive
                          ? "text-slate-50"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="rep-tag-pill"
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 32,
                          }}
                          className={`absolute inset-0 rounded-md border ${
                            tab.id === "arbiter"
                              ? "border-ice/40 bg-ice/15"
                              : "border-copper/40 bg-copper/15"
                          }`}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <span className="font-mono text-[11px] text-slate-400">
                {pageStartIndex}–{pageEndIndex} of {filteredFeedbacks.length}
              </span>
            </div>
          </div>

          {/* Feedback Rows */}
          <div className="flex-1 divide-y divide-hairline/70">
            <AnimatePresence mode="popLayout">
              {paginatedFeedbacks.length === 0 ? (
                <motion.div
                  key="empty-feedback"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-5 py-12 text-center"
                >
                  <p className="text-sm text-slate-400">
                    No feedback records match the current filter criteria.
                  </p>
                </motion.div>
              ) : (
                paginatedFeedbacks.map((entry) => (
                  <motion.div
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="p-5 transition-colors hover:bg-elevated/30"
                  >
                    {/* Row Header: Target Agent, Reviewer, Score & Tag */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAgentId((prev) =>
                              prev === entry.agentId ? null : entry.agentId
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-2.5 py-1 text-xs font-semibold text-slate-100 transition-colors hover:border-ice/40 hover:text-ice"
                          title={`Filter by Agent #${entry.agentId}`}
                        >
                          <span className="font-mono text-[11px] text-slate-400">
                            #{entry.agentId}
                          </span>
                          <span>{entry.agentName}</span>
                        </button>

                        <span className="text-xs text-slate-500">rated by</span>

                        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-300">
                          {entry.reviewerLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold ${scoreToneClasses(
                            entry.score
                          )}`}
                        >
                          {entry.score}/100
                        </span>

                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                            entry.tag === "arbiter"
                              ? "border-ice/30 bg-ice/10 text-ice"
                              : "border-copper/30 bg-copper/10 text-copper-400"
                          }`}
                        >
                          {entry.tag}
                        </span>
                      </div>
                    </div>

                    {/* Quote Comment */}
                    <p className="mt-3 border-l-2 border-hairline pl-3 text-sm leading-relaxed text-slate-300">
                      &ldquo;{entry.comment}&rdquo;
                    </p>

                    {/* Reference Box + Relative Timestamp */}
                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1 font-mono text-[11px]">
                        <span className="text-slate-500">Ref:</span>
                        <span className="truncate text-slate-200">
                          {entry.referenceLabel}
                        </span>
                        <span className="hidden text-slate-600 sm:inline">•</span>
                        <code className="hidden text-slate-400 sm:inline">
                          {shortenHash(entry.referenceId, 8, 6)}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `ref-${entry.id}`,
                              entry.referenceId,
                              "Reference ID"
                            )
                          }
                          className="shrink-0 text-slate-400 transition-colors hover:text-copper"
                          title="Copy referenceId hash"
                        >
                          {copiedKey === `ref-${entry.id}` ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(entry.timestamp, nowSec)}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col gap-3 border-t border-hairline bg-elevated/40 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <code className="truncate font-mono text-[11px] text-slate-500">
              ReputationRegistry.getAgentFeedbacks(
              {selectedAgentId ?? "agentId"}, {(safePage - 1) * PAGE_SIZE},{" "}
              {PAGE_SIZE})
            </code>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-copper/40 hover:text-copper-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>

              <span className="font-mono text-xs text-slate-400">
                Page <span className="font-semibold text-slate-100">{safePage}</span>{" "}
                of {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-copper/40 hover:text-copper-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* RIGHT (5 COLS): VALIDATION PROOFS LOG (ValidationRegistry.sol)    */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface lg:col-span-5">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-hairline bg-elevated/40 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-ice" />
                <h2 className="font-display text-base font-bold text-slate-100">
                  Validation Proofs Log
                </h2>
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                ValidationRegistry.sol • Cryptographic AI verdicts
              </p>
            </div>

            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ice/30 bg-ice/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ice">
              <ShieldCheck className="h-3 w-3" />
              zkML / TEE Ready
            </span>
          </div>

          {/* Proof Cards */}
          <div className="flex-1 space-y-3.5 p-4">
            <AnimatePresence mode="popLayout">
              {filteredValidationLogs.length === 0 ? (
                <motion.div
                  key="empty-validations"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-hairline bg-canvas/50 px-4 py-10 text-center"
                >
                  <p className="text-sm text-slate-400">
                    No validation proof receipts found for this filter.
                  </p>
                </motion.div>
              ) : (
                filteredValidationLogs.map((log) => (
                  <motion.div
                    key={log.requestId}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22 }}
                    className="rounded-xl border border-hairline bg-canvas/60 p-4 transition-colors hover:border-ice/35"
                  >
                    {/* Top Row: Req ID + Status + Response Code */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="text-slate-500">Req</span>
                        <code className="rounded bg-surface px-1.5 py-0.5 text-slate-200">
                          {shortenHash(log.requestId, 8, 6)}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              `req-${log.requestId}`,
                              log.requestId,
                              "Validation Request ID"
                            )
                          }
                          className="text-slate-500 transition-colors hover:text-ice"
                          title="Copy requestId"
                        >
                          {copiedKey === `req-${log.requestId}` ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {log.status === "Approved" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-teal-400">
                            <CheckCircle2 className="h-3 w-3" />
                            APPROVED
                          </span>
                        )}
                        {log.status === "Pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-amber-400">
                            <Clock className="h-3 w-3" />
                            PENDING
                          </span>
                        )}
                        {log.status === "Rejected" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-rose-400">
                            <XCircle className="h-3 w-3" />
                            REJECTED
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            log.responseCode === 1
                              ? "border-ice/30 bg-ice/10 text-ice"
                              : log.responseCode === 2
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {log.responseCode === 1
                            ? "Code: 1 (Release)"
                            : log.responseCode === 2
                              ? "Code: 2 (Refund)"
                              : "Code: 0 (Pending)"}
                        </span>
                      </div>
                    </div>

                    {/* Validator & Subject Row */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-hairline/70 bg-surface/80 px-2.5 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Validator
                        </div>
                        <div className="mt-0.5 truncate font-semibold text-slate-100">
                          #{log.validatorAgentId} {log.validatorName}
                        </div>
                      </div>

                      <div className="rounded-lg border border-hairline/70 bg-surface/80 px-2.5 py-2">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Subject
                        </div>
                        <div className="mt-0.5 truncate font-semibold text-slate-100">
                          {log.subjectLabel}
                        </div>
                      </div>
                    </div>

                    {/* Cryptographic Hashes & Hex Proof Preview */}
                    <div className="mt-3 space-y-1.5 rounded-lg border border-hairline/70 bg-surface/50 px-3 py-2 font-mono text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Hash className="h-3 w-3 text-copper" />
                          reasoningHash
                        </span>
                        <div className="flex items-center gap-1.5">
                          <code className="text-slate-300">
                            {shortenHash(log.reasoningHash, 10, 6)}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                `rh-${log.requestId}`,
                                log.reasoningHash,
                                "reasoningHash"
                              )
                            }
                            className="text-slate-500 transition-colors hover:text-copper"
                            title="Copy reasoningHash"
                          >
                            {copiedKey === `rh-${log.requestId}` ? (
                              <Check className="h-3 w-3 text-teal-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-hairline/60 pt-1.5">
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <FileCode2 className="h-3 w-3 text-ice" />
                          {log.proofTypeLabel}
                        </span>
                        <code className="max-w-[180px] truncate text-slate-400">
                          {shortenHash(log.proofHex, 12, 8)}
                        </code>
                      </div>
                    </div>

                    {/* Actions: Inspect Proof + Aevum Explorer */}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleInspectProof(log)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ice/35 bg-ice/10 px-3 py-1.5 text-xs font-semibold text-ice transition-all hover:border-ice/60 hover:bg-ice/20"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Inspect Proof
                      </button>

                      <a
                        href={explorerValidationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-slate-400 transition-colors hover:text-ice"
                      >
                        Aevum Explorer
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Proof Log Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-elevated/40 px-5 py-3.5">
            <span className="font-mono text-[11px] text-slate-500">
              {latestAnchoredBlock > 0
                ? `Anchored up to Block #${latestAnchoredBlock.toLocaleString()}`
                : "Anchored on QDay Aevum L2"}
            </span>

            <button
              type="button"
              disabled={filteredValidationLogs.length === 0}
              onClick={handleDownloadProofBundle}
              className="inline-flex items-center gap-1.5 rounded-lg border border-copper/40 bg-copper/10 px-3 py-1.5 text-xs font-semibold text-copper-400 transition-colors hover:bg-copper/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              Download Proof Bundle (.json)
            </button>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* REUSED PROOF INSPECTOR MODAL                                        */}
      {/* =================================================================== */}
      <ProofInspectorModal
        dispute={inspectModalState?.dispute ?? null}
        initialArbiterAgentId={inspectModalState?.arbiterAgentId ?? null}
        onClose={() => setInspectModalState(null)}
      />

      {/* =================================================================== */}
      {/* TOAST NOTIFICATIONS                                                 */}
      {/* =================================================================== */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border bg-surface/95 p-3.5 shadow-2xl backdrop-blur-md ${
                toast.tone === "teal"
                  ? "border-teal-500/40"
                  : toast.tone === "copper"
                    ? "border-copper/40"
                    : "border-ice/40"
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-100">
                  {toast.title}
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                  {toast.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 text-slate-500 transition-colors hover:text-slate-200"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
