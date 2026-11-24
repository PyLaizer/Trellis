"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  ExternalLink,
  FileCode2,
  Gavel,
  Hash,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { keccak256, stringToBytes, toHex } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ProofInspectorModal } from "@/components/disputes/ProofInspectorModal";
import { aevumTestnet } from "@/lib/chains";
import {
  DISPUTE_RESOLUTION_ABI,
  IDENTITY_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
} from "@/lib/contracts/abis";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
} from "@/lib/contracts/addresses";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatTUSD8,
  shortenAddress,
  shortenHash,
} from "@/lib/format";
import {
  DEFAULT_PREVIEW_NOW_SEC,
  ZERO_BYTES32,
  createMockDisputes,
  type ArbiterSeatRecord,
  type DisputeRecord,
  type DisputeStatusId,
  type RulingId,
} from "@/lib/mockDisputesData";
import { buildJsonDataUri } from "@/lib/projectMetadata";

type FilterTab = "ALL" | "OPEN" | "ASSIGNED" | "RESOLVED";

interface ToastMessage {
  id: string;
  title: string;
  description: string;
  tone: "teal" | "copper" | "rose" | "ice";
  txHash?: `0x${string}`;
}

interface OnChainDisputeTuple {
  disputeId: bigint;
  projectId: bigint;
  milestoneIndex: bigint;
  openedBy: `0x${string}`;
  status: number;
  releaseVotes: number;
  refundVotes: number;
  createdAt: bigint;
  votingDeadline: bigint;
  evidenceHash: `0x${string}`;
  evidenceURI: string;
  arbiters: readonly [bigint, bigint, bigint];
  validationRequestIds: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
}

interface OnChainArbiterVoteTuple {
  ruling: number;
  votedAt: bigint;
  reasoningHash: `0x${string}`;
  proofURI: string;
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

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "ALL", label: "All Disputes" },
  { id: "OPEN", label: "Open" },
  { id: "ASSIGNED", label: "Assigned to My Arbiters" },
  { id: "RESOLVED", label: "Resolved" },
];

const PROTOCOL_FEE_BPS = 100n; // 1.00%

function formatCountdown(remainingSec: number): string {
  if (remainingSec <= 0) return "00m 00s (Expired)";
  const hrs = Math.floor(remainingSec / 3600);
  const mins = Math.floor((remainingSec % 3600) / 60);
  const secs = remainingSec % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hrs > 0) {
    return `${hrs}h ${mm}m ${ss}s remaining`;
  }
  return `${mm}m ${ss}s remaining`;
}

function toDisputeStatusId(val: number): DisputeStatusId {
  if (val === 1) return 1;
  if (val === 2) return 2;
  return 0;
}

function toRulingId(val: number): RulingId {
  if (val === 1) return 1;
  if (val === 2) return 2;
  return 0;
}

function isValidHexBytes(input: string): input is `0x${string}` {
  return /^0x([0-9a-fA-F]{2})*$/.test(input.trim());
}

export function DisputesClient() {
  const { address: connectedAddress } = useAccount();

  // Client-safe clock for live countdown (initialized deterministically for SSR)
  const [nowSec, setNowSec] = useState<number>(DEFAULT_PREVIEW_NOW_SEC);
  const [isClientMounted, setIsClientMounted] = useState(false);

  // Preview docket state (re-anchored to real client time on mount)
  const [mockDisputes, setMockDisputes] = useState<DisputeRecord[]>(() =>
    createMockDisputes(DEFAULT_PREVIEW_NOW_SEC)
  );

  useEffect(() => {
    const liveNow = Math.floor(Date.now() / 1000);
    setNowSec(liveNow);
    setMockDisputes(createMockDisputes(liveNow));
    setIsClientMounted(true);

    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter & selection state
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [selectedDisputeId, setSelectedDisputeId] = useState<number>(2);

  // Verdict form state
  const [selectedRuling, setSelectedRuling] = useState<1 | 2>(1);
  const [reasoningInput, setReasoningInput] = useState<string>(
    "ipfs://bafybeisentinel7dsp02verdict/fips204-benchmark-audit.json"
  );
  const [proofHexInput, setProofHexInput] = useState<string>(() =>
    toHex(
      JSON.stringify({
        scheme: "TEE-TDX-Quote-v4",
        arbiter: "Sentinel-7 (#5)",
        sigAlg: "ML-DSA-65/Dilithium-3",
        katVerified: true,
        confidenceBps: 9650,
      })
    )
  );

  // Proof Inspector modal state
  const [inspectTarget, setInspectTarget] = useState<{
    dispute: DisputeRecord;
    arbiterAgentId: number | null;
  } | null>(null);

  // Copy feedback & toasts
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(toast: Omit<ToastMessage, "id">) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5600);
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleCopy(key: string, text: string) {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  }

  // Cursor-tracking Copper & Ice radial spotlight for Header Banner
  const mouseX = useMotionValue(360);
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

  const { data: onChainTotalDisputes, refetch: refetchTotalDisputes } =
    useReadContract({
      address: CONTRACT_ADDRESSES.DisputeResolution,
      abi: DISPUTE_RESOLUTION_ABI,
      functionName: "totalDisputes",
      chainId: aevumTestnet.id,
      query: { enabled: IS_PROTOCOL_DEPLOYED },
    });

  const disputeIdsToFetch = useMemo<bigint[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !onChainTotalDisputes) return [];
    const total = Number(onChainTotalDisputes);
    const capped = Math.min(Math.max(total, 0), 25);
    return Array.from({ length: capped }, (_, idx) => BigInt(capped - idx));
  }, [onChainTotalDisputes]);

  const { data: onChainDisputesRaw, refetch: refetchDisputes } =
    useReadContracts({
      contracts: disputeIdsToFetch.map((id) => ({
        address: CONTRACT_ADDRESSES.DisputeResolution,
        abi: DISPUTE_RESOLUTION_ABI,
        functionName: "getDispute" as const,
        args: [id] as const,
        chainId: aevumTestnet.id,
      })),
      query: {
        enabled: IS_PROTOCOL_DEPLOYED && disputeIdsToFetch.length > 0,
      },
    });

  // Extract arbiter vote + validation + ownerOf multicalls for on-chain disputes
  const onChainSeatQueries = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || !onChainDisputesRaw) {
      return { voteCalls: [], validationCalls: [], ownerCalls: [] };
    }

    const voteCalls: {
      address: `0x${string}`;
      abi: typeof DISPUTE_RESOLUTION_ABI;
      functionName: "getArbiterVote";
      args: readonly [bigint, bigint];
      chainId: number;
    }[] = [];

    const validationCalls: {
      address: `0x${string}`;
      abi: typeof VALIDATION_REGISTRY_ABI;
      functionName: "getValidation";
      args: readonly [`0x${string}`];
      chainId: number;
    }[] = [];

    const ownerCalls: {
      address: `0x${string}`;
      abi: typeof IDENTITY_REGISTRY_ABI;
      functionName: "ownerOf";
      args: readonly [bigint];
      chainId: number;
    }[] = [];

    for (const item of onChainDisputesRaw) {
      if (item.status !== "success" || !item.result) continue;
      const d = item.result as unknown as OnChainDisputeTuple;
      for (let i = 0; i < 3; i += 1) {
        const arbId = d.arbiters[i];
        const reqId = d.validationRequestIds[i];
        voteCalls.push({
          address: CONTRACT_ADDRESSES.DisputeResolution,
          abi: DISPUTE_RESOLUTION_ABI,
          functionName: "getArbiterVote",
          args: [d.disputeId, arbId],
          chainId: aevumTestnet.id,
        });
        validationCalls.push({
          address: CONTRACT_ADDRESSES.ValidationRegistry,
          abi: VALIDATION_REGISTRY_ABI,
          functionName: "getValidation",
          args: [reqId],
          chainId: aevumTestnet.id,
        });
        ownerCalls.push({
          address: CONTRACT_ADDRESSES.IdentityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "ownerOf",
          args: [arbId],
          chainId: aevumTestnet.id,
        });
      }
    }

    return { voteCalls, validationCalls, ownerCalls };
  }, [onChainDisputesRaw]);

  const { data: onChainVotesRaw, refetch: refetchVotes } = useReadContracts({
    contracts: onChainSeatQueries.voteCalls,
    query: {
      enabled:
        IS_PROTOCOL_DEPLOYED && onChainSeatQueries.voteCalls.length > 0,
    },
  });

  const { data: onChainValidationsRaw, refetch: refetchValidations } =
    useReadContracts({
      contracts: onChainSeatQueries.validationCalls,
      query: {
        enabled:
          IS_PROTOCOL_DEPLOYED &&
          onChainSeatQueries.validationCalls.length > 0,
      },
    });

  const { data: onChainOwnersRaw } = useReadContracts({
    contracts: onChainSeatQueries.ownerCalls,
    query: {
      enabled:
        IS_PROTOCOL_DEPLOYED && onChainSeatQueries.ownerCalls.length > 0,
    },
  });

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Writes (castVote & finalizeExpiredDispute)                 */
  /* ------------------------------------------------------------------------ */

  const {
    writeContract,
    data: pendingTxHash,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirmingTx, isSuccess: isTxConfirmed } =
    useWaitForTransactionReceipt({
      hash: pendingTxHash,
    });

  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (isTxConfirmed && pendingTxHash) {
      pushToast({
        title: pendingActionLabel ?? "Arbitration Transaction Confirmed",
        description:
          "Consensus state & ValidationRegistry proof anchored on QDay Aevum Testnet.",
        tone: "teal",
        txHash: pendingTxHash,
      });
      setPendingActionLabel(null);
      void refetchTotalDisputes();
      void refetchDisputes();
      void refetchVotes();
      void refetchValidations();
      resetWrite();
    }
  }, [
    isTxConfirmed,
    pendingTxHash,
    pendingActionLabel,
    refetchTotalDisputes,
    refetchDisputes,
    refetchVotes,
    refetchValidations,
    resetWrite,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Unified Disputes Model (On-Chain OR Interactive Preview)                 */
  /* ------------------------------------------------------------------------ */

  const disputes = useMemo<DisputeRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return mockDisputes;
    }

    if (!onChainDisputesRaw) return [];

    const records: DisputeRecord[] = [];
    let seatCursor = 0;

    for (const item of onChainDisputesRaw) {
      if (item.status !== "success" || !item.result) continue;
      const d = item.result as unknown as OnChainDisputeTuple;

      const seats: ArbiterSeatRecord[] = [];
      for (let i = 0; i < 3; i += 1) {
        const arbId = Number(d.arbiters[i]);
        const reqId = d.validationRequestIds[i];
        const voteItem = onChainVotesRaw?.[seatCursor];
        const valItem = onChainValidationsRaw?.[seatCursor];
        const ownerItem = onChainOwnersRaw?.[seatCursor];
        seatCursor += 1;

        const voteRes =
          voteItem?.status === "success"
            ? (voteItem.result as unknown as OnChainArbiterVoteTuple)
            : undefined;
        const valRes =
          valItem?.status === "success"
            ? (valItem.result as unknown as OnChainValidationTuple)
            : undefined;
        const ownerAddr =
          ownerItem?.status === "success"
            ? (ownerItem.result as unknown as `0x${string}`)
            : undefined;

        const ruling = toRulingId(Number(voteRes?.ruling ?? 0));
        const valStatusNum = Number(valRes?.status ?? 0);
        const validationStatus: "Pending" | "Approved" | "Rejected" =
          valStatusNum === 1
            ? "Approved"
            : valStatusNum === 2
              ? "Rejected"
              : ruling !== 0
                ? "Approved"
                : "Pending";

        const isYou = Boolean(
          connectedAddress &&
            ownerAddr &&
            connectedAddress.toLowerCase() === ownerAddr.toLowerCase()
        );

        seats.push({
          arbiterAgentId: arbId,
          name: `Arbiter #${arbId}`,
          monogram: `A${arbId}`,
          reputationScore: 95,
          isYou,
          ruling,
          votedAt: Number(voteRes?.votedAt ?? 0),
          reasoningSummary:
            ruling === 1
              ? "Arbiter voted to release escrow tranche to Freelancer."
              : ruling === 2
                ? "Arbiter voted to refund escrow tranche to Client."
                : "",
          reasoningHash: voteRes?.reasoningHash ?? ZERO_BYTES32,
          proofURI: voteRes?.proofURI ?? "",
          validationRequestId: reqId,
          validationStatus,
          responseCode: Number(valRes?.responseCode ?? ruling),
          proofHex: valRes?.proof ?? "0x",
        });
      }

      const idNum = Number(d.disputeId);
      const statusId = toDisputeStatusId(Number(d.status));
      const relVotes = Number(d.releaseVotes);
      const refVotes = Number(d.refundVotes);

      records.push({
        disputeId: idNum,
        code: `#DSP-${String(idNum).padStart(2, "0")}`,
        projectId: Number(d.projectId),
        projectTitle: `Project #${Number(d.projectId)}`,
        milestoneIndex: Number(d.milestoneIndex),
        milestoneTitle: `Milestone #${Number(d.milestoneIndex)}`,
        amount: 0n,
        status: statusId,
        openedBy: d.openedBy,
        clientAgentId: 1,
        clientAddress: d.openedBy,
        freelancerAgentId: 2,
        freelancerAddress: d.openedBy,
        deliverableURI: "On-chain Milestone Deliverable",
        deliverableHash: ZERO_BYTES32,
        deliverableSummary:
          "Milestone deliverable hash recorded in ProjectManager.",
        evidenceURI: d.evidenceURI,
        evidenceHash: d.evidenceHash,
        evidenceSummary:
          "Dispute evidence URI and hash submitted to DisputeResolution.",
        evidenceClaimTag: "On-Chain Dispute Evidence",
        createdAt: Number(d.createdAt),
        votingDeadline: Number(d.votingDeadline),
        releaseVotes: relVotes,
        refundVotes: refVotes,
        expiredTie: statusId === 2 && relVotes === 1 && refVotes === 1,
        arbiters: [seats[0], seats[1], seats[2]],
      });
    }

    return records;
  }, [
    mockDisputes,
    onChainDisputesRaw,
    onChainVotesRaw,
    onChainValidationsRaw,
    onChainOwnersRaw,
    connectedAddress,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Derived Collections & Counts                                             */
  /* ------------------------------------------------------------------------ */

  const openDisputes = useMemo(
    () => disputes.filter((d) => d.status === 0),
    [disputes]
  );

  const resolvedDisputes = useMemo(
    () => disputes.filter((d) => d.status !== 0),
    [disputes]
  );

  const assignedToYouCount = useMemo(
    () =>
      openDisputes.filter((d) =>
        d.arbiters.some((a) => a.isYou && a.ruling === 0)
      ).length,
    [openDisputes]
  );

  // Featured open dispute (falls back to first open dispute if current was resolved)
  const featuredDispute = useMemo<DisputeRecord | null>(() => {
    const matchingOpen = openDisputes.find(
      (d) => d.disputeId === selectedDisputeId
    );
    if (matchingOpen) return matchingOpen;
    return openDisputes[0] ?? null;
  }, [openDisputes, selectedDisputeId]);

  const filteredResolvedDisputes = useMemo(() => {
    if (activeFilter === "OPEN") return [];
    if (activeFilter === "ASSIGNED") {
      return resolvedDisputes.filter((d) => d.arbiters.some((a) => a.isYou));
    }
    return resolvedDisputes;
  }, [resolvedDisputes, activeFilter]);

  const filteredOpenDocket = useMemo(() => {
    if (activeFilter === "RESOLVED") return [];
    if (activeFilter === "ASSIGNED") {
      return openDisputes.filter((d) => d.arbiters.some((a) => a.isYou));
    }
    return openDisputes;
  }, [openDisputes, activeFilter]);

  const activeFeatured: DisputeRecord | null = useMemo(() => {
    if (activeFilter === "RESOLVED") return null;
    if (
      featuredDispute &&
      filteredOpenDocket.some((d) => d.disputeId === featuredDispute.disputeId)
    ) {
      return featuredDispute;
    }
    return filteredOpenDocket[0] ?? null;
  }, [activeFilter, featuredDispute, filteredOpenDocket]);

  // Pending arbiter seat belonging to user on activeFeatured
  const userPendingSeat = useMemo<ArbiterSeatRecord | null>(() => {
    if (!activeFeatured || activeFeatured.status !== 0) return null;
    return (
      activeFeatured.arbiters.find((seat) => seat.isYou && seat.ruling === 0) ??
      null
    );
  }, [activeFeatured]);

  // Live computed reasoningHash (keccak256)
  const computedReasoningHash = useMemo<`0x${string}`>(() => {
    const trimmed = reasoningInput.trim();
    if (!trimmed) return ZERO_BYTES32;
    return keccak256(stringToBytes(trimmed));
  }, [reasoningInput]);

  // Countdown math
  const remainingSec = activeFeatured
    ? Math.max(0, activeFeatured.votingDeadline - nowSec)
    : 0;
  const isExpired = Boolean(activeFeatured && remainingSec <= 0);

  // Payout breakdown for selected ruling
  const payoutBreakdown = useMemo(() => {
    if (!activeFeatured) {
      return { fee: 0n, freelancerNet: 0n, clientRefund: 0n };
    }
    const fee = (activeFeatured.amount * PROTOCOL_FEE_BPS) / 10_000n;
    const freelancerNet = activeFeatured.amount - fee;
    return {
      fee,
      freelancerNet,
      clientRefund: activeFeatured.amount,
    };
  }, [activeFeatured]);

  const isBusy = isWritePending || isConfirmingTx;

  /* ------------------------------------------------------------------------ */
  /* Quick Helpers for Verdict Form                                           */
  /* ------------------------------------------------------------------------ */

  function handleAutoGenerateReasonJson() {
    if (!activeFeatured || !userPendingSeat) return;
    const payload = {
      disputeId: activeFeatured.disputeId,
      projectId: activeFeatured.projectId,
      milestoneIndex: activeFeatured.milestoneIndex,
      arbiterAgentId: userPendingSeat.arbiterAgentId,
      arbiterName: userPendingSeat.name,
      verdict:
        selectedRuling === 1 ? "RELEASE_TO_FREELANCER" : "REFUND_TO_CLIENT",
      summary:
        selectedRuling === 1
          ? "Verified NIST FIPS 204 KAT vectors & reproducible benchmark build. Deliverable satisfies M1 cryptographic acceptance criteria."
          : "Mobile WebKit latency exceeds 10ms p95 SLA specified in M1 brief without SIMD exemption. Recommending full client refund.",
      evaluatedAt: new Date().toISOString(),
    };
    setReasoningInput(buildJsonDataUri(payload));
  }

  function handleGenerateTeeAttestation() {
    if (!activeFeatured || !userPendingSeat) return;
    const attestation = {
      scheme: "TEE-TDX-Quote-v4",
      enclaveMrEnclave:
        "0x7f4a92c1e8b305d6a4c2f9e1b7d3a5c8e0f2b4d6a8c0e2f4b6d8a0c2e4f6a8b0",
      arbiterAgentId: userPendingSeat.arbiterAgentId,
      disputeId: activeFeatured.disputeId,
      responseCode: selectedRuling,
      reasoningHash: computedReasoningHash,
      sigAlg: "ML-DSA-65/Dilithium-3",
      timestamp: Math.floor(Date.now() / 1000),
    };
    setProofHexInput(toHex(JSON.stringify(attestation)));
  }

  /* ------------------------------------------------------------------------ */
  /* Action Handlers: Cast Verdict & Finalize Expired                         */
  /* ------------------------------------------------------------------------ */

  function handleSubmitVerdict() {
    if (!activeFeatured || !userPendingSeat) return;

    const trimmedUri = reasoningInput.trim();
    if (!trimmedUri) {
      pushToast({
        title: "Proof URI Required",
        description:
          "Provide a reasoning report URI or click Auto-Generate Reason JSON.",
        tone: "rose",
      });
      return;
    }

    const trimmedProof = proofHexInput.trim() || "0x";
    if (!isValidHexBytes(trimmedProof)) {
      pushToast({
        title: "Invalid Hex Payload",
        description:
          "Opaque proof must be valid even-length hex starting with 0x.",
        tone: "rose",
      });
      return;
    }

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(
        `Verdict Cast (${selectedRuling === 1 ? "RELEASE" : "REFUND"})`
      );
      writeContract(
        {
          address: CONTRACT_ADDRESSES.DisputeResolution,
          abi: DISPUTE_RESOLUTION_ABI,
          functionName: "castVote",
          args: [
            BigInt(activeFeatured.disputeId),
            BigInt(userPendingSeat.arbiterAgentId),
            selectedRuling,
            computedReasoningHash,
            trimmedUri,
            trimmedProof,
          ],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Vote Transaction Reverted",
              description: err.message.slice(0, 150),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    // Preview Mode: record vote, update quorum, transition to resolved!
    const currentNow = Math.floor(Date.now() / 1000);
    const nextRelease =
      activeFeatured.releaseVotes + (selectedRuling === 1 ? 1 : 0);
    const nextRefund =
      activeFeatured.refundVotes + (selectedRuling === 2 ? 1 : 0);
    const quorumReached = nextRelease >= 2 || nextRefund >= 2;
    const nextStatus: DisputeStatusId =
      nextRelease >= 2 ? 1 : nextRefund >= 2 ? 2 : 0;

    const summaryText =
      selectedRuling === 1
        ? `Tie-breaking verdict in favor of Freelancer. Verified FIPS 204 test suite and deterministic benchmark harness; releasing ${formatTUSD8(payoutBreakdown.freelancerNet)} net tUSD8.`
        : `Tie-breaking verdict in favor of Client. Confirmed SLA gap on mobile WebKit p95 latency; refunding ${formatTUSD8(payoutBreakdown.clientRefund)} tUSD8 with 0% protocol fee.`;

    setMockDisputes((prev) =>
      prev.map((d) => {
        if (d.disputeId !== activeFeatured.disputeId) return d;
        const updatedArbiters = d.arbiters.map((seat) =>
          seat.arbiterAgentId === userPendingSeat.arbiterAgentId
            ? {
                ...seat,
                ruling: selectedRuling as RulingId,
                votedAt: currentNow,
                reasoningSummary: summaryText,
                reasoningHash: computedReasoningHash,
                proofURI: trimmedUri,
                validationStatus: "Approved" as const,
                responseCode: selectedRuling,
                proofHex: trimmedProof,
                blockNumber: 1_843_128,
              }
            : seat
        ) as [ArbiterSeatRecord, ArbiterSeatRecord, ArbiterSeatRecord];

        return {
          ...d,
          releaseVotes: nextRelease,
          refundVotes: nextRefund,
          status: nextStatus,
          arbiters: updatedArbiters,
        };
      })
    );

    if (quorumReached) {
      pushToast({
        title: "2-of-3 Consensus Reached!",
        description: `${activeFeatured.code} settled (${
          nextStatus === 1 ? "RELEASED to Freelancer" : "REFUNDED to Client"
        }). Escrow settled & arbiters auto-scored 100/25 in ReputationRegistry.`,
        tone: "teal",
      });
    } else {
      pushToast({
        title: `Verdict Recorded for ${activeFeatured.code}`,
        description: `Arbiter #${userPendingSeat.arbiterAgentId} vote anchored in ValidationRegistry.`,
        tone: "ice",
      });
    }
  }

  function handleFinalizeExpired() {
    if (!activeFeatured || !isExpired) return;

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(`Finalized Expired ${activeFeatured.code}`);
      writeContract(
        {
          address: CONTRACT_ADDRESSES.DisputeResolution,
          abi: DISPUTE_RESOLUTION_ABI,
          functionName: "finalizeExpiredDispute",
          args: [BigInt(activeFeatured.disputeId)],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Finalization Reverted",
              description: err.message.slice(0, 150),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    // Preview Mode: release wins only if releaseVotes > refundVotes; ties default to Refund
    const releaseWins =
      activeFeatured.releaseVotes > activeFeatured.refundVotes;
    const isTie = activeFeatured.releaseVotes === activeFeatured.refundVotes;
    const finalStatus: DisputeStatusId = releaseWins ? 1 : 2;

    setMockDisputes((prev) =>
      prev.map((d) =>
        d.disputeId === activeFeatured.disputeId
          ? {
              ...d,
              status: finalStatus,
              expiredTie: isTie,
            }
          : d
      )
    );

    pushToast({
      title: `Expired Dispute ${activeFeatured.code} Finalized`,
      description: isTie
        ? "1–1 expired tie defaulted to Client Refund (100% returned, 0% fee)."
        : releaseWins
          ? "Plurality Release executed on expiry."
          : "Plurality Refund executed on expiry.",
      tone: releaseWins ? "teal" : "copper",
    });
  }

  function handleSimulateExpiry() {
    if (!activeFeatured || IS_PROTOCOL_DEPLOYED) return;
    setMockDisputes((prev) =>
      prev.map((d) =>
        d.disputeId === activeFeatured.disputeId
          ? { ...d, votingDeadline: nowSec - 5 }
          : d
      )
    );
    pushToast({
      title: `Simulated Deadline Expiry on ${activeFeatured.code}`,
      description:
        "Voting window elapsed. You can now trigger Finalize Expired to test default tie resolution.",
      tone: "copper",
    });
  }

  const contractAddressDisplay = IS_PROTOCOL_DEPLOYED
    ? CONTRACT_ADDRESSES.DisputeResolution
    : CONTRACT_ADDRESSES.tUSD8;

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {/* ==================================================================== */}
      {/* 1. COMPACT HEADER BANNER (Copper & Ice Lattice + Cursor Spotlight)   */}
      {/* ==================================================================== */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        onMouseMove={handleHeaderMouseMove}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface p-6 sm:p-8"
      >
        <motion.div
          aria-hidden
          style={{ background: headerSpotlight }}
          className="pointer-events-none absolute inset-0"
        />

        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-ice/30 bg-ice/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-ice">
              <Scale className="h-3.5 w-3.5" />
              ERC-8004 VALIDATION REGISTRY • 2-OF-3 AI ARBITER CONSENSUS
            </div>

            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
              AI Arbitration &amp;{" "}
              <span className="text-copper">Dispute Resolution</span>
            </h1>

            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">
              Three conflict-free ERC-8004 AI Arbiters independently verify
              deliverables and dispute evidence, anchor zkML / TEE attestations
              in <span className="font-mono text-slate-300">ValidationRegistry</span>,
              and settle milestone escrow on 2-of-3 quorum with automated{" "}
              <span className="font-mono text-slate-300">100 / 25</span>{" "}
              reputation scoring.
            </p>
          </div>

          {/* Right Cluster: Contract Chip + Live Stat Pills */}
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-canvas/75 px-3 py-1.5 font-mono text-xs text-slate-300">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  DisputeResolution
                </span>
                <span className="text-slate-100">
                  {IS_PROTOCOL_DEPLOYED
                    ? shortenAddress(CONTRACT_ADDRESSES.DisputeResolution, 6, 4)
                    : "Preview Mode"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("contract", contractAddressDisplay)
                  }
                  className="text-slate-400 transition-colors hover:text-copper"
                  title="Copy contract address"
                >
                  {copiedKey === "contract" ? (
                    <Check className="h-3.5 w-3.5 text-teal-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={explorerAddressUrl(contractAddressDisplay)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ice transition-colors hover:text-ice-400"
                  title="View on Aevum Explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 font-mono text-xs">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                <span className="text-slate-400">Open Disputes</span>
                <span className="font-bold text-rose-300 tabular-nums">
                  {openDisputes.length}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-teal-500/25 bg-teal-500/10 px-3 py-1.5 font-mono text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
                <span className="text-slate-400">Resolved</span>
                <span className="font-bold text-teal-300 tabular-nums">
                  {resolvedDisputes.length}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-copper/30 bg-copper/10 px-3 py-1.5 font-mono text-xs">
                <Bot className="h-3.5 w-3.5 text-copper" />
                <span className="text-slate-400">Assigned to You</span>
                <span className="font-bold text-copper-400 tabular-nums">
                  {assignedToYouCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ==================================================================== */}
      {/* 2. FILTER CONTROL BAR + ACTIVE DOCKET SWITCHER                       */}
      {/* ==================================================================== */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-hairline bg-surface/80 p-3 sm:flex-row sm:items-center">
        {/* Sliding Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`relative rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? "text-slate-50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="disputes-filter-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl border border-copper/40 bg-copper/15 shadow-card-glow"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Docket Switcher Pills */}
        {openDisputes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Active Docket:
            </span>
            {openDisputes.map((d) => {
              const isSelected = activeFeatured?.disputeId === d.disputeId;
              const shortTitle =
                d.projectTitle.length > 18
                  ? `${d.projectTitle.slice(0, 18).trim()}…`
                  : d.projectTitle;
              return (
                <button
                  key={d.disputeId}
                  type="button"
                  onClick={() => {
                    if (activeFilter === "RESOLVED") setActiveFilter("ALL");
                    setSelectedDisputeId(d.disputeId);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-[11px] font-medium transition-all ${
                    isSelected
                      ? "border-ice/50 bg-ice/15 text-ice shadow-ice-glow"
                      : "border-hairline bg-elevated/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  <span className="font-bold">{d.code}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-sans">{shortTitle}</span>
                  <span className="text-slate-300">
                    ({formatTUSD8(d.amount).replace(/\.00$/, "")})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 3. FEATURED ACTIVE DISPUTE TRIBUNAL CARD                             */}
      {/* ==================================================================== */}
      {activeFeatured ? (
        <motion.section
          key={activeFeatured.disputeId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl"
        >
          {/* 3A. Top Status Banner */}
          <div className="flex flex-col justify-between gap-4 border-b border-hairline bg-elevated/50 px-6 py-4 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-rose-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                OPEN DISPUTE
              </span>

              <span className="font-mono text-sm font-bold text-slate-100">
                {activeFeatured.code}
              </span>

              <span className="text-slate-600">•</span>

              <Link
                href={`/projects/${activeFeatured.projectId}`}
                className="inline-flex items-center gap-1 font-display text-sm font-semibold text-slate-100 transition-colors hover:text-copper"
              >
                Project #{activeFeatured.projectId}:{" "}
                {activeFeatured.projectTitle}
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>

              <span className="rounded-lg border border-hairline bg-canvas/80 px-2.5 py-1 font-mono text-xs text-slate-300">
                Milestone #{activeFeatured.milestoneIndex}:{" "}
                {activeFeatured.milestoneTitle}
              </span>

              <span className="rounded-lg border border-copper/30 bg-copper/10 px-2.5 py-1 font-mono text-xs font-bold text-copper-400 tabular-nums">
                {formatTUSD8(activeFeatured.amount)} tUSD8
              </span>
            </div>

            {/* Right: Live Countdown + Finalize Expired */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs tabular-nums ${
                  isExpired
                    ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                <Timer className="h-3.5 w-3.5" />
                <span>
                  {isClientMounted
                    ? formatCountdown(remainingSec)
                    : "47m 18s remaining"}
                </span>
              </div>

              {!IS_PROTOCOL_DEPLOYED && !isExpired && (
                <button
                  type="button"
                  onClick={handleSimulateExpiry}
                  className="rounded-xl border border-hairline bg-canvas/70 px-2.5 py-1.5 font-mono text-[11px] text-slate-400 transition-colors hover:border-amber-500/40 hover:text-amber-300"
                  title="Preview helper: expire votingDeadline to test finalizeExpiredDispute"
                >
                  Simulate Deadline Expiry
                </button>
              )}

              <button
                type="button"
                disabled={!isExpired || isBusy}
                onClick={handleFinalizeExpired}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  isExpired
                    ? "border-copper/50 bg-copper text-canvas hover:bg-copper-400"
                    : "cursor-not-allowed border-hairline bg-canvas/50 text-slate-500"
                }`}
              >
                <Gavel className="h-3.5 w-3.5" />
                Finalize Expired
              </button>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {/* 3B. Animated 2-of-3 Quorum Consensus Meter */}
            <div className="rounded-xl border border-hairline bg-canvas/60 p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3 font-mono">
                  <span className="inline-flex items-center gap-1.5 text-teal-400">
                    <span className="h-2 w-2 rounded-full bg-teal-400" />
                    Release: <strong>{activeFeatured.releaseVotes}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-rose-400">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    Refund: <strong>{activeFeatured.refundVotes}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-ice">
                    <span className="h-2 w-2 rounded-full bg-ice" />
                    Awaiting:{" "}
                    <strong>
                      {Math.max(
                        0,
                        3 -
                          activeFeatured.releaseVotes -
                          activeFeatured.refundVotes
                      )}
                    </strong>
                  </span>
                </div>

                <span className="rounded-full border border-ice/30 bg-ice/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ice">
                  2/3 QUORUM REQUIRED
                </span>
              </div>

              <div className="relative flex h-3.5 w-full overflow-hidden rounded-full border border-hairline bg-surface">
                {/* Release segment */}
                <motion.div
                  initial={false}
                  animate={{
                    width: `${(activeFeatured.releaseVotes / 3) * 100}%`,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  className="h-full bg-gradient-to-r from-teal-500 to-teal-400"
                />
                {/* Refund segment */}
                <motion.div
                  initial={false}
                  animate={{
                    width: `${(activeFeatured.refundVotes / 3) * 100}%`,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  className="h-full bg-gradient-to-r from-rose-500 to-rose-400"
                />
                {/* Awaiting segment */}
                <motion.div
                  initial={false}
                  animate={{
                    width: `${
                      (Math.max(
                        0,
                        3 -
                          activeFeatured.releaseVotes -
                          activeFeatured.refundVotes
                      ) /
                        3) *
                      100
                    }%`,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 28 }}
                  className="h-full bg-ice/25"
                />

                {/* Center 2/3 Quorum Threshold Marker */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-2/3 w-0.5 bg-slate-100/80 shadow-[0_0_8px_rgba(248,250,252,0.7)]"
                />
              </div>
            </div>

            {/* 3C. Side-by-Side Comparison Row: Deliverable vs Dispute Evidence */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left: Freelancer Milestone Deliverable */}
              <div className="flex flex-col justify-between rounded-xl border border-hairline bg-elevated/40 p-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-teal-400">
                      <FileCode2 className="h-3.5 w-3.5" />
                      Freelancer Milestone Deliverable
                    </span>
                    <span className="rounded-lg border border-hairline bg-canvas/70 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      Agent #{activeFeatured.freelancerAgentId} •{" "}
                      {shortenAddress(activeFeatured.freelancerAddress)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {activeFeatured.deliverableSummary}
                  </p>

                  <div className="mt-4 space-y-2 rounded-lg border border-hairline bg-canvas/60 p-3 font-mono text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Deliverable URI</span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="max-w-[230px] truncate text-slate-200">
                          {activeFeatured.deliverableURI}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              "delivUri",
                              activeFeatured.deliverableURI
                            )
                          }
                          className="text-slate-400 hover:text-teal-400"
                          title="Copy Deliverable URI"
                        >
                          {copiedKey === "delivUri" ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-hairline/60 pt-2">
                      <span className="text-slate-500">keccak256 Hash</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-200">
                          {shortenHash(activeFeatured.deliverableHash, 10, 8)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(
                              "delivHash",
                              activeFeatured.deliverableHash
                            )
                          }
                          className="text-slate-400 hover:text-teal-400"
                          title="Copy Deliverable Hash"
                        >
                          {copiedKey === "delivHash" ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 border-t border-hairline/70 pt-3 font-mono text-[11px] font-medium text-teal-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Lattice Signature Verified • Anchored in ProjectManager
                </div>
              </div>

              {/* Right: Client Dispute Evidence & Claim */}
              <div className="flex flex-col justify-between rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Client Dispute Evidence &amp; Claim
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-rose-500/35 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300">
                        Opened Dispute
                      </span>
                      <span className="rounded-lg border border-hairline bg-canvas/70 px-2 py-0.5 font-mono text-[11px] text-slate-300">
                        Agent #{activeFeatured.clientAgentId} •{" "}
                        {shortenAddress(activeFeatured.clientAddress)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {activeFeatured.evidenceSummary}
                  </p>

                  <div className="mt-4 space-y-2 rounded-lg border border-hairline bg-canvas/60 p-3 font-mono text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">Evidence URI</span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="max-w-[230px] truncate text-slate-200">
                          {activeFeatured.evidenceURI}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy("evidUri", activeFeatured.evidenceURI)
                          }
                          className="text-slate-400 hover:text-rose-400"
                          title="Copy Evidence URI"
                        >
                          {copiedKey === "evidUri" ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-hairline/60 pt-2">
                      <span className="text-slate-500">evidenceHash</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-200">
                          {shortenHash(activeFeatured.evidenceHash, 10, 8)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy("evidHash", activeFeatured.evidenceHash)
                          }
                          className="text-slate-400 hover:text-rose-400"
                          title="Copy Evidence Hash"
                        >
                          {copiedKey === "evidHash" ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 border-t border-rose-500/20 pt-3 font-mono text-[11px] font-medium text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                  {activeFeatured.evidenceClaimTag}
                </div>
              </div>
            </div>

            {/* 3D. 3-Column AI Arbiter Tribunal Cards */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
                  Assigned 3-Seat AI Arbiter Tribunal
                </h2>
                <span className="font-mono text-[11px] text-slate-500">
                  Conflict-free selection via IdentityRegistry
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {activeFeatured.arbiters.map((seat) => {
                  const isAssignedPending = seat.isYou && seat.ruling === 0;
                  const isTieBreaker =
                    isAssignedPending &&
                    activeFeatured.releaseVotes === 1 &&
                    activeFeatured.refundVotes === 1;

                  return (
                    <div
                      key={seat.arbiterAgentId}
                      className={`relative flex flex-col justify-between rounded-xl border p-5 transition-all ${
                        isAssignedPending
                          ? "border-ice/50 bg-elevated/70 shadow-ice-glow"
                          : "border-hairline bg-elevated/35 hover:border-slate-700"
                      }`}
                    >
                      {/* Floating Copper Ribbon for User's Assigned Pending Seat */}
                      {isAssignedPending && (
                        <div className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full border border-copper/50 bg-copper px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-canvas shadow-lg">
                          <Sparkles className="h-3 w-3" />
                          ASSIGNED TO YOU • ARB #{seat.arbiterAgentId}
                        </div>
                      )}

                      <div>
                        {/* Arbiter Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-xs font-bold ${
                                isAssignedPending
                                  ? "border-ice/50 bg-ice/15 text-ice"
                                  : "border-hairline bg-canvas text-slate-200"
                              }`}
                            >
                              {seat.monogram}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-display text-sm font-bold text-slate-100">
                                  {seat.name}
                                </span>
                                {seat.isYou && (
                                  <span className="rounded bg-ice/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ice">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                Arbiter #{seat.arbiterAgentId} • Rep{" "}
                                <span className="text-slate-200">
                                  {seat.reputationScore}/100
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Verdict Pill */}
                          {seat.ruling === 1 && (
                            <span className="rounded-full border border-teal-500/35 bg-teal-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-teal-300">
                              VOTED: RELEASE
                            </span>
                          )}
                          {seat.ruling === 2 && (
                            <span className="rounded-full border border-rose-500/35 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-300">
                              VOTED: REFUND
                            </span>
                          )}
                          {seat.ruling === 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-300">
                              <Clock className="h-3 w-3" />
                              PENDING VERDICT
                            </span>
                          )}
                        </div>

                        {/* Seat Body */}
                        {seat.ruling !== 0 ? (
                          <div className="mt-4 space-y-3">
                            <p className="rounded-lg border border-hairline bg-canvas/55 p-3 text-xs leading-relaxed text-slate-300">
                              &ldquo;{seat.reasoningSummary}&rdquo;
                            </p>

                            <div className="space-y-1.5 font-mono text-[11px]">
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Reasoning Hash</span>
                                <span className="text-slate-200">
                                  {shortenHash(seat.reasoningHash, 8, 6)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Validation Proof</span>
                                <span className="text-teal-400">
                                  {seat.validationStatus} (code=
                                  {seat.responseCode})
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            <div className="rounded-lg border border-hairline bg-canvas/55 p-3 font-mono text-[11px]">
                              <div className="text-slate-500">
                                Validation Request ID
                              </div>
                              <div className="mt-1 text-slate-200">
                                {shortenHash(seat.validationRequestId, 12, 8)}
                              </div>
                            </div>

                            {isTieBreaker ? (
                              <div className="rounded-lg border border-copper/40 bg-copper/10 p-3 text-xs text-copper-400">
                                <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider">
                                  <Scale className="h-3.5 w-3.5" />
                                  Decisive Tie-Breaker
                                </div>
                                <p className="mt-1 text-slate-300">
                                  Panel is split 1–1. Your vote immediately
                                  reaches 2-of-3 quorum and executes on-chain
                                  escrow settlement.
                                </p>
                              </div>
                            ) : (
                              <p className="text-xs leading-relaxed text-slate-400">
                                Awaiting cryptographic attestation and verdict
                                submission before the voting deadline.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer Action */}
                      <div className="mt-4 border-t border-hairline/70 pt-3">
                        {seat.ruling !== 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setInspectTarget({
                                dispute: activeFeatured,
                                arbiterAgentId: seat.arbiterAgentId,
                              })
                            }
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-ice/30 bg-ice/10 px-3 py-2 font-mono text-xs font-semibold text-ice transition-colors hover:border-ice/60 hover:bg-ice/20"
                          >
                            Inspect zkML / TEE Proof
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                            <span>Status: {seat.validationStatus}</span>
                            <span>
                              {isAssignedPending
                                ? "Cast verdict below ↓"
                                : "Waiting on node…"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3E. Interactive "Cast Verdict as Arbiter #X" Panel */}
            {userPendingSeat && (
              <div className="rounded-2xl border border-copper/35 bg-gradient-to-br from-elevated/80 via-surface to-canvas/90 p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <div className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-copper">
                      <Cpu className="h-3.5 w-3.5" />
                      ERC-8004 Arbiter Action Console
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-slate-50">
                      Cast Verdict as Arbiter #{userPendingSeat.arbiterAgentId}{" "}
                      ({userPendingSeat.name})
                    </h3>
                  </div>

                  <span className="rounded-lg border border-hairline bg-canvas/80 px-3 py-1 font-mono text-[11px] text-slate-400">
                    Calls{" "}
                    <span className="text-slate-200">
                      DisputeResolution.castVote()
                    </span>
                  </span>
                </div>

                {/* Two Large Selectable Ruling Cards */}
                <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedRuling(1)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      selectedRuling === 1
                        ? "border-teal-400/70 bg-teal-500/15 shadow-[0_0_24px_-8px_rgba(45,212,191,0.35)]"
                        : "border-hairline bg-canvas/60 hover:border-teal-500/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-teal-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Release to Freelancer
                      </span>
                      <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-300">
                        Code: 1
                      </span>
                    </div>
                    <div className="mt-2 font-display text-lg font-bold text-slate-100 tabular-nums">
                      Release {formatTUSD8(activeFeatured.amount)} tUSD8 to
                      Freelancer
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] text-slate-400">
                      99% ({formatTUSD8(payoutBreakdown.freelancerNet)}) to
                      Freelancer • 1% ({formatTUSD8(payoutBreakdown.fee)})
                      protocol fee
                    </div>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedRuling(2)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      selectedRuling === 2
                        ? "border-rose-400/70 bg-rose-500/15 shadow-[0_0_24px_-8px_rgba(244,63,94,0.35)]"
                        : "border-hairline bg-canvas/60 hover:border-rose-500/35"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-rose-400">
                        <ShieldAlert className="h-4 w-4" />
                        Refund to Client
                      </span>
                      <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300">
                        Code: 2
                      </span>
                    </div>
                    <div className="mt-2 font-display text-lg font-bold text-slate-100 tabular-nums">
                      Refund {formatTUSD8(activeFeatured.amount)} tUSD8 to
                      Client
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] text-slate-400">
                      100% ({formatTUSD8(payoutBreakdown.clientRefund)}) to
                      Client • 0% ($0.00) protocol fee
                    </div>
                  </motion.button>
                </div>

                {/* Reasoning URI + Opaque Proof Payload Inputs */}
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Reasoning URI + live keccak256 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="reasoning-uri-input"
                        className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                      >
                        Reasoning Report / Proof URI
                      </label>
                      <button
                        type="button"
                        onClick={handleAutoGenerateReasonJson}
                        className="inline-flex items-center gap-1 rounded-md border border-ice/30 bg-ice/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-ice transition-colors hover:bg-ice/20"
                      >
                        <Sparkles className="h-3 w-3" />
                        Auto-Generate Reason JSON
                      </button>
                    </div>
                    <input
                      id="reasoning-uri-input"
                      type="text"
                      value={reasoningInput}
                      onChange={(e) => setReasoningInput(e.target.value)}
                      placeholder="ipfs://... or data:application/json;base64,..."
                      className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/50 focus:outline-none"
                    />
                    <div className="flex items-center justify-between rounded-lg border border-hairline/70 bg-canvas/60 px-3 py-1.5 font-mono text-[11px]">
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Hash className="h-3 w-3 text-copper" />
                        reasoningHash (keccak256)
                      </span>
                      <span className="text-slate-300">
                        {shortenHash(computedReasoningHash, 10, 8)}
                      </span>
                    </div>
                  </div>

                  {/* Opaque Proof Payload Hex */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="proof-hex-input"
                        className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                      >
                        Opaque Proof Payload (zkML / TEE Attestation Hex)
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateTeeAttestation}
                        className="inline-flex items-center gap-1 rounded-md border border-copper/35 bg-copper/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-copper-400 transition-colors hover:bg-copper/20"
                      >
                        <Cpu className="h-3 w-3" />
                        Generate TEE Attestation
                      </button>
                    </div>
                    <input
                      id="proof-hex-input"
                      type="text"
                      value={proofHexInput}
                      onChange={(e) => setProofHexInput(e.target.value)}
                      placeholder="0x..."
                      className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/50 focus:outline-none"
                    />
                    <div className="flex items-center justify-between rounded-lg border border-hairline/70 bg-canvas/60 px-3 py-1.5 font-mono text-[11px]">
                      <span className="text-slate-500">
                        Envelope Integrity
                      </span>
                      <span
                        className={
                          isValidHexBytes(proofHexInput)
                            ? "text-teal-400"
                            : "text-rose-400"
                        }
                      >
                        {isValidHexBytes(proofHexInput)
                          ? `Valid bytes (${Math.max(0, (proofHexInput.trim().length - 2) / 2)} bytes)`
                          : "Invalid hex format"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Full-Width Burnished Copper CTA */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  disabled={isBusy}
                  onClick={handleSubmitVerdict}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-copper px-5 py-3.5 font-display text-sm font-bold text-canvas shadow-card-glow transition-colors hover:bg-copper-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Gavel className="h-4 w-4" />
                  {isBusy
                    ? "Confirming Verdict On-Chain..."
                    : `Submit Verdict (${
                        selectedRuling === 1 ? "RELEASE" : "REFUND"
                      }) & Execute Settlement`}
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
              </div>
            )}
          </div>
        </motion.section>
      ) : (
        activeFilter !== "RESOLVED" && (
          <div className="rounded-2xl border border-teal-500/25 bg-surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 text-teal-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="mt-3 font-display text-lg font-bold text-slate-100">
              No Open Disputes in This View
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              All assigned AI arbitration cases have reached 2-of-3 consensus
              and settled on-chain. Inspect historical ValidationRegistry proofs
              below.
            </p>
          </div>
        )
      )}

      {/* ==================================================================== */}
      {/* 4. PAST RESOLVED DISPUTES TABLE                                      */}
      {/* ==================================================================== */}
      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-elevated/40 px-6 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-slate-100">
              Past Resolved Disputes
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Finalized escrow settlements with immutable ERC-8004
              ValidationRegistry proofs.
            </p>
          </div>
          <span className="rounded-lg border border-hairline bg-canvas/70 px-2.5 py-1 font-mono text-xs text-slate-300">
            {filteredResolvedDisputes.length} settled case
            {filteredResolvedDisputes.length === 1 ? "" : "s"}
          </span>
        </div>

        {filteredResolvedDisputes.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            {activeFilter === "OPEN" ? (
              <div className="flex flex-col items-center gap-2">
                <span>
                  Resolved disputes are hidden while filtering by{" "}
                  <strong className="text-slate-200">Open</strong>.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveFilter("ALL")}
                  className="font-mono text-xs text-copper hover:underline"
                >
                  Show All Disputes →
                </button>
              </div>
            ) : (
              "No resolved disputes match the selected filter."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-canvas/40 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Dispute ID</th>
                  <th className="px-4 py-3">Project &amp; Milestone</th>
                  <th className="px-4 py-3">Escrow Amount</th>
                  <th className="px-4 py-3">Vote Tally</th>
                  <th className="px-4 py-3">Consensus Outcome</th>
                  <th className="px-4 py-3">Validation Proofs</th>
                  <th className="px-6 py-3 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70 text-sm">
                {filteredResolvedDisputes.map((d) => {
                  const verifiedCount = d.arbiters.filter(
                    (a) => a.validationStatus === "Approved"
                  ).length;

                  const voteTallyLabel = d.expiredTie
                    ? `${d.releaseVotes} — ${d.refundVotes} (Expired Tie)`
                    : d.status === 1
                      ? `${d.releaseVotes} Release — ${d.refundVotes} Refund`
                      : `${d.refundVotes} Refund — ${d.releaseVotes} Release`;

                  return (
                    <tr
                      key={d.disputeId}
                      className="transition-colors hover:bg-elevated/35"
                    >
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-100">
                        {d.code}
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-medium text-slate-200">
                          Project #{d.projectId} • Milestone #{d.milestoneIndex}
                          : {d.milestoneTitle}
                        </div>
                      </td>

                      <td className="px-4 py-4 font-mono text-xs font-semibold text-slate-200 tabular-nums">
                        {formatTUSD8(d.amount)} tUSD8
                      </td>

                      <td className="px-4 py-4 font-mono text-xs text-slate-300">
                        {voteTallyLabel}
                      </td>

                      <td className="px-4 py-4">
                        {d.status === 1 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/35 bg-teal-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-teal-300">
                            RELEASED
                          </span>
                        ) : d.expiredTie ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-300">
                            REFUNDED (DEFAULT)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/35 bg-rose-500/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-300">
                            REFUNDED
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ice">
                          <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
                          {verifiedCount}/3 Verified
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setInspectTarget({
                              dispute: d,
                              arbiterAgentId: null,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-elevated/70 px-3 py-1.5 font-mono text-xs font-medium text-slate-200 transition-colors hover:border-ice/50 hover:text-ice"
                        >
                          View Proofs
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* 5. PROOF INSPECTOR MODAL                                             */}
      {/* ==================================================================== */}
      <ProofInspectorModal
        dispute={inspectTarget?.dispute ?? null}
        initialArbiterAgentId={inspectTarget?.arbiterAgentId ?? null}
        onClose={() => setInspectTarget(null)}
      />

      {/* ==================================================================== */}
      {/* 6. BOTTOM-RIGHT TOAST NOTIFICATIONS                                  */}
      {/* ==================================================================== */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className={`pointer-events-auto rounded-xl border bg-surface/95 p-4 shadow-2xl backdrop-blur-md ${
                toast.tone === "teal"
                  ? "border-teal-500/40"
                  : toast.tone === "copper"
                    ? "border-copper/40"
                    : toast.tone === "rose"
                      ? "border-rose-500/40"
                      : "border-ice/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className={`font-display text-sm font-bold ${
                      toast.tone === "teal"
                        ? "text-teal-300"
                        : toast.tone === "copper"
                          ? "text-copper-400"
                          : toast.tone === "rose"
                            ? "text-rose-300"
                            : "text-ice"
                    }`}
                  >
                    {toast.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">
                    {toast.description}
                  </p>
                  {toast.txHash && (
                    <a
                      href={explorerTxUrl(toast.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-ice hover:underline"
                    >
                      View Tx {shortenHash(toast.txHash, 8, 6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="text-slate-500 hover:text-slate-200"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
