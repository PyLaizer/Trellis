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
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileCode2,
  Hash,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { formatUnits, zeroAddress } from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import {
  ApproveMilestoneModal,
  OpenDisputeModal,
  RateCounterpartyModal,
  SubmitDeliverableModal,
} from "@/components/projects/MilestoneActionModals";
import { aevumTestnet } from "@/lib/chains";
import {
  DISPUTE_RESOLUTION_ABI,
  MILESTONE_ESCROW_ABI,
  PROJECT_MANAGER_ABI,
} from "@/lib/contracts/abis";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
  TUSD8_DECIMALS,
} from "@/lib/contracts/addresses";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatTUSD8,
  shortenAddress,
  shortenHash,
} from "@/lib/format";
import {
  MOCK_PROJECTS,
  MOCK_PROTOCOL_FEE_BPS,
  type MilestoneRecord,
  type ProjectRecord,
} from "@/lib/mockProjectsData";
import {
  MILESTONE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  formatShortDate,
  parseMilestoneSpecUri,
  parseProjectBriefUri,
  toMilestoneStatusId,
  toProjectStatusId,
} from "@/lib/projectMetadata";

type PerspectiveRole = "CLIENT" | "FREELANCER";

interface TimelineEvent {
  id: string;
  label: string;
  detail: string;
  timestamp: number;
  tone: "copper" | "teal" | "ice" | "rose" | "slate";
}

interface MilestoneRatingState {
  clientRatedScore?: number;
  freelancerRatedScore?: number;
}

interface ToastMessage {
  id: string;
  title: string;
  description: string;
  tone: "teal" | "copper" | "rose" | "ice";
  txHash?: `0x${string}`;
}

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} secs`;
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return `${mins} min${mins === 1 ? "" : "s"}`;
  }
  const hrs = Math.round(seconds / 3600);
  return `${hrs} hour${hrs === 1 ? "" : "s"}`;
}

function formatTimestampShort(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return "Just now";
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildInitialTimeline(project: ProjectRecord): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `created-${project.projectId}`,
      label: "Escrow Vault Funded",
      detail: `Client #${project.clientAgentId} locked ${formatTUSD8(project.totalBudget)} tUSD8 across ${project.milestones.length} tranches`,
      timestamp: project.createdAt,
      tone: "copper",
    },
  ];

  if (project.freelancerAgentId > 0) {
    events.push({
      id: `accepted-${project.projectId}`,
      label: project.isDirectHire
        ? "Direct Hire Assigned"
        : "Freelancer Accepted Project",
      detail: `${project.freelancerName ?? `Freelancer #${project.freelancerAgentId}`} joined milestone schedule`,
      timestamp: project.createdAt + 3600,
      tone: "ice",
    });
  }

  for (const m of project.milestones) {
    if (m.submittedAt > 0) {
      events.push({
        id: `submitted-${project.projectId}-${m.index}`,
        label: `M${m.index} Deliverable Submitted`,
        detail: `${m.title} • keccak256 ${shortenHash(m.deliverableHash, 6, 4)}`,
        timestamp: m.submittedAt,
        tone: "ice",
      });
    }
    if (m.status === 2 || m.status === 4) {
      events.push({
        id: `approved-${project.projectId}-${m.index}`,
        label:
          m.status === 4
            ? `M${m.index} AI Arbitration Released`
            : `M${m.index} Approved & Settled`,
        detail: `Released ${formatTUSD8(m.amount)} gross tranche via MilestoneEscrow`,
        timestamp: (m.submittedAt || project.createdAt) + 7200,
        tone: "teal",
      });
    } else if (m.status === 3) {
      events.push({
        id: `disputed-${project.projectId}-${m.index}`,
        label: `M${m.index} Escalated to AI Arbiters`,
        detail: "3 conflict-free ERC-8004 arbiters assigned (2-of-3 quorum)",
        timestamp: (m.submittedAt || project.createdAt) + 5400,
        tone: "rose",
      });
    } else if (m.status === 5) {
      events.push({
        id: `refunded-${project.projectId}-${m.index}`,
        label: `M${m.index} Refunded to Client`,
        detail: `100% (${formatTUSD8(m.amount)}) returned with 0% protocol fee`,
        timestamp: (m.submittedAt || project.createdAt) + 7200,
        tone: "rose",
      });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function splitTitleForHighlight(title: string): {
  lead: string;
  accent: string | null;
} {
  if (title.includes("—")) {
    const [lead, ...rest] = title.split("—");
    return { lead: lead.trim(), accent: rest.join("—").trim() };
  }
  return { lead: title, accent: null };
}

interface ProjectWorkspaceClientProps {
  projectIdParam: string;
}

export function ProjectWorkspaceClient({
  projectIdParam,
}: ProjectWorkspaceClientProps) {
  const parsedProjectId = useMemo(() => {
    const trimmed = projectIdParam.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  }, [projectIdParam]);

  const { address: connectedAddress } = useAccount();

  // Demo perspective switcher (for preview mode or testing both roles)
  const [perspective, setPerspective] = useState<PerspectiveRole>("CLIENT");

  // Local preview state
  const initialMockProject = useMemo<ProjectRecord | null>(() => {
    if (parsedProjectId === null) return null;
    const match = MOCK_PROJECTS.find((p) => p.projectId === parsedProjectId);
    return match ? structuredClone(match) : null;
  }, [parsedProjectId]);

  const [mockProject, setMockProject] = useState<ProjectRecord | null>(
    initialMockProject
  );

  // Sync mock project when route param changes
  useEffect(() => {
    setMockProject(initialMockProject);
  }, [initialMockProject]);

  // Bilateral rating state per milestone index
  const [ratingsByMilestone, setRatingsByMilestone] = useState<
    Record<number, MilestoneRatingState>
  >((): Record<number, MilestoneRatingState> => {
    // Seed realistic recorded rating on M0 of #104 in preview mode
    if (parsedProjectId === 104) {
      return {
        0: { clientRatedScore: 98 },
      };
    }
    return {};
  });

  // Dynamic timeline events in preview mode
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(() =>
    initialMockProject ? buildInitialTimeline(initialMockProject) : []
  );

  useEffect(() => {
    if (initialMockProject) {
      setTimelineEvents(buildInitialTimeline(initialMockProject));
    } else {
      setTimelineEvents([]);
    }
  }, [initialMockProject]);

  // Copy feedback states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Active modals
  const [submitModalMilestone, setSubmitModalMilestone] =
    useState<MilestoneRecord | null>(null);
  const [approveModalMilestone, setApproveModalMilestone] =
    useState<MilestoneRecord | null>(null);
  const [disputeModalMilestone, setDisputeModalMilestone] =
    useState<MilestoneRecord | null>(null);
  const [rateModalMilestone, setRateModalMilestone] =
    useState<MilestoneRecord | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(toast: Omit<ToastMessage, "id">) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
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
    }, 1600);
  }

  // Cursor-tracking Copper & Ice radial spotlight for Hero Card
  const mouseX = useMotionValue(360);
  const mouseY = useMotionValue(120);
  const heroSpotlight = useMotionTemplate`radial-gradient(520px circle at ${mouseX}px ${mouseY}px, rgba(234, 122, 61, 0.13), rgba(56, 189, 248, 0.06) 45%, transparent 72%)`;

  function handleHeroMouseMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  }

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Reads (when IS_PROTOCOL_DEPLOYED is true)                  */
  /* ------------------------------------------------------------------------ */

  const projectIdBigInt =
    parsedProjectId !== null ? BigInt(parsedProjectId) : 0n;
  const shouldReadOnChain = IS_PROTOCOL_DEPLOYED && parsedProjectId !== null;

  const {
    data: onChainProjectData,
    refetch: refetchProject,
    isLoading: isLoadingOnChainProject,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.ProjectManager,
    abi: PROJECT_MANAGER_ABI,
    functionName: "getProject",
    args: [projectIdBigInt],
    query: { enabled: shouldReadOnChain },
  });

  const {
    data: onChainMilestonesData,
    refetch: refetchMilestones,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.ProjectManager,
    abi: PROJECT_MANAGER_ABI,
    functionName: "getProjectMilestones",
    args: [projectIdBigInt],
    query: { enabled: shouldReadOnChain },
  });

  const { data: onChainFeeBps } = useReadContract({
    address: CONTRACT_ADDRESSES.MilestoneEscrow,
    abi: MILESTONE_ESCROW_ABI,
    functionName: "feeBps",
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const { data: onChainReviewPeriod } = useReadContract({
    address: CONTRACT_ADDRESSES.DisputeResolution,
    abi: DISPUTE_RESOLUTION_ABI,
    functionName: "clientReviewPeriod",
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const { data: onChainVotingPeriod } = useReadContract({
    address: CONTRACT_ADDRESSES.DisputeResolution,
    abi: DISPUTE_RESOLUTION_ABI,
    functionName: "votingPeriod",
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Writes                                                     */
  /* ------------------------------------------------------------------------ */

  const {
    writeContract,
    data: pendingTxHash,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirmingTx,
    isSuccess: isTxConfirmed,
  } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
  });

  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (isTxConfirmed && pendingTxHash) {
      pushToast({
        title: pendingActionLabel ?? "Transaction Confirmed",
        description: "On-chain state updated on QDay Aevum Testnet.",
        tone: "teal",
        txHash: pendingTxHash,
      });
      setSubmitModalMilestone(null);
      setApproveModalMilestone(null);
      setDisputeModalMilestone(null);
      setRateModalMilestone(null);
      setPendingActionLabel(null);
      void refetchProject();
      void refetchMilestones();
      resetWrite();
    }
  }, [
    isTxConfirmed,
    pendingTxHash,
    pendingActionLabel,
    refetchProject,
    refetchMilestones,
    resetWrite,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Unified Project Model (On-Chain OR Interactive Preview)                  */
  /* ------------------------------------------------------------------------ */

  const activeProject = useMemo<ProjectRecord | null>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return mockProject;
    }

    if (!onChainProjectData || onChainProjectData.projectId === 0n) {
      return null;
    }

    const parsedBrief = parseProjectBriefUri(onChainProjectData.metadataURI);
    const milestones: MilestoneRecord[] = (onChainMilestonesData ?? []).map(
      (m, index) => {
        const spec = parseMilestoneSpecUri(m.descriptionURI);
        return {
          index,
          title: spec?.title ?? `Milestone M${index}`,
          amount: m.amount,
          dueDate: Number(m.dueDate),
          submittedAt: Number(m.submittedAt),
          status: toMilestoneStatusId(Number(m.status)),
          deliverableHash: m.deliverableHash,
          descriptionURI: m.descriptionURI,
          deliverableURI: m.deliverableURI,
        };
      }
    );

    const clientAgentId = Number(onChainProjectData.clientAgentId);
    const freelancerAgentId = Number(onChainProjectData.freelancerAgentId);

    return {
      projectId: Number(onChainProjectData.projectId),
      title: parsedBrief?.title ?? `Project #TRL-${onChainProjectData.projectId}`,
      summary:
        parsedBrief?.summary ??
        "Quantum-safe milestone escrow contract settled on QDay Aevum L2.",
      category: parsedBrief?.category ?? "Escrow",
      clientAgentId,
      clientName: `Client Agent #${clientAgentId}`,
      clientTrustScore: 94,
      clientAddress: onChainProjectData.client,
      freelancerAgentId,
      freelancerName:
        freelancerAgentId > 0 ? `Freelancer Agent #${freelancerAgentId}` : undefined,
      freelancerAddress: onChainProjectData.freelancer,
      isDirectHire:
        freelancerAgentId > 0 && onChainProjectData.freelancer === zeroAddress,
      status: toProjectStatusId(Number(onChainProjectData.status)),
      totalBudget: onChainProjectData.totalBudget,
      settledCount: Number(onChainProjectData.settledCount),
      createdAt: Number(onChainProjectData.createdAt),
      metadataURI: onChainProjectData.metadataURI,
      milestones,
    };
  }, [mockProject, onChainProjectData, onChainMilestonesData]);

  const effectiveFeeBps =
    IS_PROTOCOL_DEPLOYED && onChainFeeBps !== undefined
      ? Number(onChainFeeBps)
      : MOCK_PROTOCOL_FEE_BPS;

  const reviewPeriodSec =
    IS_PROTOCOL_DEPLOYED && onChainReviewPeriod !== undefined
      ? Number(onChainReviewPeriod)
      : 300; // 5 mins default

  const votingPeriodSec =
    IS_PROTOCOL_DEPLOYED && onChainVotingPeriod !== undefined
      ? Number(onChainVotingPeriod)
      : 3600; // 1 hour default

  // Financial telemetry derived from milestones
  const financials = useMemo(() => {
    if (!activeProject) {
      return {
        totalBudget: 0n,
        released: 0n,
        refunded: 0n,
        locked: 0n,
        hasDisputedMilestone: false,
      };
    }

    let released = 0n;
    let refunded = 0n;
    let locked = 0n;
    let hasDisputedMilestone = false;

    for (const m of activeProject.milestones) {
      if (m.status === 2 || m.status === 4) {
        released += m.amount;
      } else if (m.status === 5) {
        refunded += m.amount;
      } else {
        locked += m.amount;
      }
      if (m.status === 3) {
        hasDisputedMilestone = true;
      }
    }

    if (activeProject.status === 3) {
      locked = 0n;
    }

    return {
      totalBudget: activeProject.totalBudget,
      released,
      refunded,
      locked,
      hasDisputedMilestone,
    };
  }, [activeProject]);

  // Effective role check (on-chain checks connected wallet, preview uses perspective toggle)
  const effectiveRole = useMemo<PerspectiveRole>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return perspective;
    }
    if (connectedAddress && activeProject) {
      if (
        connectedAddress.toLowerCase() ===
        activeProject.freelancerAddress.toLowerCase()
      ) {
        return "FREELANCER";
      }
      if (
        connectedAddress.toLowerCase() ===
        activeProject.clientAddress.toLowerCase()
      ) {
        return "CLIENT";
      }
    }
    return perspective;
  }, [perspective, connectedAddress, activeProject]);

  const isBusy = isWritePending || isConfirmingTx;

  /* ------------------------------------------------------------------------ */
  /* Action Handlers (Live Contract OR Interactive Preview Mode)              */
  /* ------------------------------------------------------------------------ */

  function handleSubmitDeliverable(
    milestoneIndex: number,
    deliverableURI: string,
    deliverableHash: `0x${string}`
  ) {
    if (!activeProject) return;

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(`M${milestoneIndex} Deliverable Submitted`);
      writeContract(
        {
          address: CONTRACT_ADDRESSES.ProjectManager,
          abi: PROJECT_MANAGER_ABI,
          functionName: "submitDeliverable",
          args: [
            BigInt(activeProject.projectId),
            BigInt(milestoneIndex),
            deliverableURI,
            deliverableHash,
          ],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Submission Reverted",
              description: err.message.slice(0, 140),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    // Preview Mode immediate state transition
    const nowSec = Math.floor(Date.now() / 1000);
    setMockProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.index === milestoneIndex
            ? {
                ...m,
                status: 1, // Submitted
                submittedAt: nowSec,
                deliverableURI,
                deliverableHash,
              }
            : m
        ),
      };
    });

    const target = activeProject.milestones.find(
      (m) => m.index === milestoneIndex
    );
    setTimelineEvents((prev) => [
      {
        id: `preview-submit-${milestoneIndex}-${nowSec}`,
        label: `M${milestoneIndex} Deliverable Submitted`,
        detail: `${target?.title ?? `Milestone M${milestoneIndex}`} • hash ${shortenHash(deliverableHash, 6, 4)}`,
        timestamp: nowSec,
        tone: "ice",
      },
      ...prev,
    ]);
    setSubmitModalMilestone(null);
    pushToast({
      title: `M${milestoneIndex} Deliverable Submitted`,
      description: `Proof hash ${shortenHash(deliverableHash, 8, 6)} anchored. Switch to Client view to approve or dispute.`,
      tone: "ice",
    });
  }

  function handleApproveMilestone(milestoneIndex: number) {
    if (!activeProject) return;

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(`M${milestoneIndex} Approved & Released`);
      writeContract(
        {
          address: CONTRACT_ADDRESSES.ProjectManager,
          abi: PROJECT_MANAGER_ABI,
          functionName: "approveMilestone",
          args: [BigInt(activeProject.projectId), BigInt(milestoneIndex)],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Approval Reverted",
              description: err.message.slice(0, 140),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const target = activeProject.milestones.find(
      (m) => m.index === milestoneIndex
    );

    setMockProject((prev) => {
      if (!prev) return prev;
      const updatedMilestones = prev.milestones.map((m) =>
        m.index === milestoneIndex ? { ...m, status: 2 as const } : m
      );
      const settledCount = updatedMilestones.filter(
        (m) => m.status === 2 || m.status === 4 || m.status === 5
      ).length;
      const allSettled = settledCount === updatedMilestones.length;
      return {
        ...prev,
        settledCount,
        status: allSettled ? 2 : prev.status,
        milestones: updatedMilestones,
      };
    });

    if (target) {
      const fee = (target.amount * BigInt(effectiveFeeBps)) / 10_000n;
      const payout = target.amount - fee;
      setTimelineEvents((prev) => [
        {
          id: `preview-approve-${milestoneIndex}-${nowSec}`,
          label: `M${milestoneIndex} Approved & Released`,
          detail: `Sent ${formatTUSD8(payout)} tUSD8 to Freelancer (${formatTUSD8(fee)} protocol fee)`,
          timestamp: nowSec,
          tone: "teal",
        },
        ...prev,
      ]);
      pushToast({
        title: `M${milestoneIndex} Settled On-Chain`,
        description: `Released ${formatTUSD8(payout)} tUSD8 to ${activeProject.freelancerName ?? `Freelancer #${activeProject.freelancerAgentId}`}. Bilateral rating unlocked.`,
        tone: "teal",
      });
    }

    setApproveModalMilestone(null);
  }

  function handleOpenDispute(
    milestoneIndex: number,
    evidenceHash: `0x${string}`,
    evidenceURI: string
  ) {
    if (!activeProject) return;

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(`M${milestoneIndex} Escalated to AI Arbiters`);
      writeContract(
        {
          address: CONTRACT_ADDRESSES.DisputeResolution,
          abi: DISPUTE_RESOLUTION_ABI,
          functionName: "openDispute",
          args: [
            BigInt(activeProject.projectId),
            BigInt(milestoneIndex),
            evidenceHash,
            evidenceURI,
          ],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Dispute Escalation Failed",
              description: err.message.slice(0, 140),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    setMockProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.index === milestoneIndex ? { ...m, status: 3 as const } : m
        ),
      };
    });

    setTimelineEvents((prev) => [
      {
        id: `preview-dispute-${milestoneIndex}-${nowSec}`,
        label: `M${milestoneIndex} Escalated to AI Arbiters`,
        detail: `Evidence ${shortenHash(evidenceHash, 6, 4)} • 3 ERC-8004 arbiters assigned`,
        timestamp: nowSec,
        tone: "rose",
      },
      ...prev,
    ]);
    setDisputeModalMilestone(null);
    pushToast({
      title: `AI Arbitration Opened for M${milestoneIndex}`,
      description:
        "3 conflict-free ERC-8004 AI Arbiters assigned with a 1-hour voting window.",
      tone: "rose",
    });
  }

  function handleRateCounterparty(
    milestoneIndex: number,
    score: number,
    commentURI: string,
    commentHash: `0x${string}`
  ) {
    if (!activeProject) return;

    if (IS_PROTOCOL_DEPLOYED) {
      setPendingActionLabel(`ERC-8004 Rating Recorded (${score}/100)`);
      writeContract(
        {
          address: CONTRACT_ADDRESSES.ProjectManager,
          abi: PROJECT_MANAGER_ABI,
          functionName: "rateCounterparty",
          args: [
            BigInt(activeProject.projectId),
            BigInt(milestoneIndex),
            score,
            commentURI,
            commentHash,
          ],
          chain: aevumTestnet,
        },
        {
          onError: (err) => {
            setPendingActionLabel(null);
            pushToast({
              title: "Rating Transaction Failed",
              description: err.message.slice(0, 140),
              tone: "rose",
            });
          },
        }
      );
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    setRatingsByMilestone((prev) => ({
      ...prev,
      [milestoneIndex]: {
        ...prev[milestoneIndex],
        ...(effectiveRole === "CLIENT"
          ? { clientRatedScore: score }
          : { freelancerRatedScore: score }),
      },
    }));

    const targetLabel =
      effectiveRole === "CLIENT"
        ? `Freelancer #${activeProject.freelancerAgentId}`
        : `Client #${activeProject.clientAgentId}`;

    setTimelineEvents((prev) => [
      {
        id: `preview-rate-${milestoneIndex}-${effectiveRole}-${nowSec}`,
        label: `ERC-8004 Rating Recorded (${score}/100)`,
        detail: `${effectiveRole === "CLIENT" ? "Client" : "Freelancer"} rated ${targetLabel} on M${milestoneIndex}`,
        timestamp: nowSec,
        tone: "copper",
      },
      ...prev,
    ]);
    setRateModalMilestone(null);
    pushToast({
      title: "Reputation Recorded On-Chain",
      description: `Awarded ${score}/100 (${(score / 20).toFixed(1)} ★) to ${targetLabel} in ReputationRegistry.`,
      tone: "copper",
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Loading / Not Found States                                               */
  /* ------------------------------------------------------------------------ */

  if (IS_PROTOCOL_DEPLOYED && isLoadingOnChainProject) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-surface" />
          <div className="h-64 animate-pulse rounded-2xl border border-hairline bg-surface" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="h-96 animate-pulse rounded-2xl border border-hairline bg-surface lg:col-span-8" />
            <div className="h-96 animate-pulse rounded-2xl border border-hairline bg-surface lg:col-span-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-hairline bg-surface p-8 text-center shadow-2xl"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-copper/30 bg-copper/10 text-copper-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-slate-50">
            Project Not Found
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            We couldn&apos;t locate escrow vault{" "}
            <span className="font-mono text-slate-200">
              #TRL-{projectIdParam}
            </span>{" "}
            on QDay Aevum Testnet.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2.5 text-xs font-semibold text-canvas shadow-[0_0_20px_rgba(234,122,61,0.22)] transition-colors hover:bg-copper-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Projects
            </Link>
            {!IS_PROTOCOL_DEPLOYED && (
              <Link
                href="/projects/104"
                className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-elevated px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-ice/40 hover:text-ice-400"
              >
                Open Sample Workspace (#TRL-104)
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Derived Display Helpers                                                  */
  /* ------------------------------------------------------------------------ */

  const { lead: titleLead, accent: titleAccent } = splitTitleForHighlight(
    activeProject.title
  );

  const projectDisplayStatus = financials.hasDisputedMilestone
    ? "DISPUTED"
    : PROJECT_STATUS_LABELS[activeProject.status].toUpperCase();

  const projectStatusPillClass =
    projectDisplayStatus === "DISPUTED"
      ? "border-rose-500/35 bg-rose-500/10 text-rose-400"
      : projectDisplayStatus === "COMPLETED"
        ? "border-teal-500/35 bg-teal-500/10 text-teal-400"
        : projectDisplayStatus === "ACTIVE"
          ? "border-copper/40 bg-copper/10 text-copper-400"
          : projectDisplayStatus === "OPEN"
            ? "border-ice/35 bg-ice/10 text-ice-400"
            : "border-slate-600/40 bg-slate-700/20 text-slate-400";

  const totalBudgetNum = Number(
    formatUnits(financials.totalBudget, TUSD8_DECIMALS)
  );
  const releasedNum = Number(formatUnits(financials.released, TUSD8_DECIMALS));
  const lockedNum = Number(formatUnits(financials.locked, TUSD8_DECIMALS));

  const feePercentLabel = (effectiveFeeBps / 100).toFixed(
    effectiveFeeBps % 100 === 0 ? 1 : 2
  );
  const payoutPercentLabel = ((10_000 - effectiveFeeBps) / 100).toFixed(
    effectiveFeeBps % 100 === 0 ? 0 : 2
  );

  const effectiveFreelancerId =
    activeProject.freelancerAgentId > 0 ? activeProject.freelancerAgentId : 2;
  const effectiveFreelancerName =
    activeProject.freelancerName ?? `Freelancer #${effectiveFreelancerId}`;

  const nowUnix = Math.floor(Date.now() / 1000);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      {/* ================================================================== */}
      {/* Top Breadcrumb + Demo Perspective Switcher Row                     */}
      {/* ================================================================== */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 font-mono text-xs text-slate-400"
        >
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-slate-300 transition-colors hover:border-hairline hover:bg-surface hover:text-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Projects
          </Link>
          <span className="text-slate-600">/</span>
          <span className="text-copper-400">#TRL-{activeProject.projectId}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-300">Workspace</span>
        </nav>

        {/* Perspective Switcher (Preview Mode or interactive role testing) */}
        <div className="flex items-center gap-2.5">
          {!IS_PROTOCOL_DEPLOYED && (
            <span className="hidden items-center gap-1.5 rounded-full border border-ice/25 bg-ice/10 px-2.5 py-1 font-mono text-[10px] font-medium text-ice-400 sm:inline-flex">
              <Sparkles className="h-3 w-3" />
              Interactive Preview
            </span>
          )}
          <div className="inline-flex items-center rounded-xl border border-hairline bg-surface p-1">
            {(
              [
                {
                  id: "CLIENT" as const,
                  label: `Viewing as: Client (#${activeProject.clientAgentId})`,
                },
                {
                  id: "FREELANCER" as const,
                  label: `Freelancer (#${effectiveFreelancerId})`,
                },
              ] as const
            ).map((tab) => {
              const active = effectiveRole === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPerspective(tab.id)}
                  className={`relative rounded-lg px-3 py-1.5 font-mono text-[11px] font-medium transition-colors ${
                    active
                      ? "text-slate-50"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-perspective-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                      className="absolute inset-0 rounded-lg border border-copper/40 bg-elevated shadow-[0_0_16px_rgba(234,122,61,0.16)]"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Project Hero Header Card (lattice-bg + cursor spotlight)           */}
      {/* ================================================================== */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={handleHeroMouseMove}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface p-5 shadow-2xl sm:p-7"
      >
        {/* Cursor-tracking Copper & Ice spotlight */}
        <motion.div
          aria-hidden="true"
          style={{ background: heroSpotlight }}
          className="pointer-events-none absolute inset-0"
        />

        <div className="relative z-10">
          {/* Top Grid: Left Project Identity + Right Financial Telemetry */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Info Column */}
            <div className="space-y-4 lg:col-span-8">
              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-hairline bg-elevated px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-200">
                  #TRL-{activeProject.projectId}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold ${projectStatusPillClass}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {projectDisplayStatus}
                </span>

                <span className="inline-flex items-center gap-1 rounded-md border border-teal-500/35 bg-teal-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-teal-400">
                  <ShieldCheck className="h-3 w-3" />
                  100% ESCROWED ON-CHAIN
                </span>

                <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas/70 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-slate-300">
                  {activeProject.isDirectHire
                    ? `DIRECT HIRE • Agent #${effectiveFreelancerId}`
                    : "OPEN MARKETPLACE"}
                </span>
              </div>

              {/* Title + Summary */}
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
                  {titleLead}
                  {titleAccent && (
                    <>
                      {" — "}
                      <span className="text-copper-400">{titleAccent}</span>
                    </>
                  )}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                  {activeProject.summary}
                </p>

                {/* Copyable Brief URI Chip */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy("brief-uri", activeProject.metadataURI)
                    }
                    className="inline-flex max-w-full items-center gap-2 rounded-lg border border-hairline bg-canvas/80 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:border-copper/40 hover:text-slate-200"
                  >
                    <FileCode2 className="h-3 w-3 shrink-0 text-ice-400" />
                    <span className="truncate max-w-[260px] sm:max-w-[360px]">
                      Brief URI: {activeProject.metadataURI}
                    </span>
                    {copiedKey === "brief-uri" ? (
                      <Check className="h-3 w-3 shrink-0 text-teal-400" />
                    ) : (
                      <Copy className="h-3 w-3 shrink-0" />
                    )}
                  </button>
                  <span className="font-mono text-[11px] text-slate-500">
                    Created {formatShortDate(activeProject.createdAt)}
                  </span>
                </div>
              </div>

              {/* Participant Identity Bar */}
              <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-hairline bg-elevated/85 p-3.5 sm:grid-cols-[1fr_auto_1fr]">
                {/* Client */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-copper/35 bg-copper/10 font-mono text-xs font-bold text-copper-400">
                    C{activeProject.clientAgentId}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                        Client #{activeProject.clientAgentId}
                      </span>
                      <span className="rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-teal-400">
                        ★ {activeProject.clientTrustScore}/100
                      </span>
                    </div>
                    <p className="truncate text-xs font-semibold text-slate-100">
                      {activeProject.clientName}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {shortenAddress(activeProject.clientAddress, 6, 4)}
                    </p>
                  </div>
                </div>

                {/* Divider / Link indicator */}
                <div className="hidden h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface font-mono text-xs text-slate-500 sm:flex">
                  ↔
                </div>

                {/* Freelancer */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold ${
                      activeProject.freelancerAgentId > 0
                        ? "border-ice/35 bg-ice/10 text-ice-400"
                        : "border-hairline bg-surface text-slate-500"
                    }`}
                  >
                    {activeProject.freelancerAgentId > 0
                      ? `F${activeProject.freelancerAgentId}`
                      : "F?"}
                  </div>
                  <div className="min-w-0">
                    {activeProject.freelancerAgentId > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                            Freelancer #{activeProject.freelancerAgentId}
                          </span>
                          <span className="rounded border border-ice/30 bg-ice/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-ice-400">
                            ★ 97/100
                          </span>
                        </div>
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {effectiveFreelancerName}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {shortenAddress(
                            activeProject.freelancerAddress,
                            6,
                            4
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Open Marketplace
                        </span>
                        <p className="text-xs font-semibold text-slate-300">
                          Awaiting Freelancer
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          Escrow funded &amp; ready
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Financial Telemetry Stack (3 Mono Boxes) */}
            <div className="flex flex-col justify-between gap-3 lg:col-span-4">
              <div className="rounded-xl border border-hairline bg-canvas/85 p-3.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Total Budget
                </span>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <AnimatedNumber
                    value={totalBudgetNum}
                    decimals={2}
                    prefix="$"
                    className="text-xl font-bold text-slate-50"
                  />
                  <span className="font-mono text-[11px] text-slate-500">
                    tUSD8
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-teal-500/25 bg-canvas/85 p-3.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-teal-400/90">
                  Released
                </span>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <AnimatedNumber
                    value={releasedNum}
                    decimals={2}
                    prefix="$"
                    className="text-xl font-bold text-teal-400"
                  />
                  <span className="font-mono text-[11px] text-slate-500">
                    tUSD8
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-copper/30 bg-canvas/85 p-3.5">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-copper-400">
                  Locked in Escrow
                </span>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <AnimatedNumber
                    value={lockedNum}
                    decimals={2}
                    prefix="$"
                    className="text-xl font-bold text-copper-400"
                  />
                  <span className="font-mono text-[11px] text-slate-500">
                    tUSD8
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Proportional Escrow Tranche Progress Bar */}
          <div className="mt-6 border-t border-hairline pt-5">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
              <span className="uppercase tracking-wider text-slate-400">
                Proportional Escrow Tranche Schedule
              </span>
              <span className="text-slate-300">
                {activeProject.settledCount} / {activeProject.milestones.length}{" "}
                Settled
              </span>
            </div>

            <div className="flex h-3 w-full gap-1.5 overflow-hidden rounded-full bg-canvas p-0.5 border border-hairline">
              {activeProject.milestones.map((m) => {
                const pct =
                  financials.totalBudget > 0n
                    ? Number((m.amount * 10_000n) / financials.totalBudget) /
                      100
                    : 100 / Math.max(activeProject.milestones.length, 1);

                const barColor =
                  m.status === 2 || m.status === 4
                    ? "bg-teal-400"
                    : m.status === 1
                      ? "bg-copper"
                      : m.status === 3 || m.status === 5
                        ? "bg-rose-400"
                        : "bg-slate-700";

                return (
                  <motion.div
                    key={m.index}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      duration: 0.65,
                      delay: m.index * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    title={`M${m.index}: ${MILESTONE_STATUS_LABELS[m.status]} • ${formatTUSD8(m.amount)}`}
                    className={`h-full rounded-full ${barColor}`}
                  />
                );
              })}
            </div>

            {/* Tranche Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px]">
              {activeProject.milestones.map((m) => {
                const dotColor =
                  m.status === 2 || m.status === 4
                    ? "bg-teal-400"
                    : m.status === 1
                      ? "bg-copper"
                      : m.status === 3 || m.status === 5
                        ? "bg-rose-400"
                        : "bg-slate-600";

                return (
                  <span
                    key={m.index}
                    className="inline-flex items-center gap-1.5 text-slate-300"
                  >
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    <span className="text-slate-400">M{m.index}:</span>
                    <span>{MILESTONE_STATUS_LABELS[m.status]}</span>
                    <span className="text-slate-500">•</span>
                    <span className="font-semibold tabular-nums text-slate-100">
                      {formatTUSD8(m.amount)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ================================================================== */}
      {/* Two-Column Workspace (8 cols Left Schedule / 4 cols Right Sidebar) */}
      {/* ================================================================== */}
      <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN (8 cols): Milestone Schedule Stack */}
        <div className="space-y-4 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-slate-50">
                Milestone Schedule
              </h2>
              <span className="rounded-md border border-hairline bg-elevated px-2 py-0.5 font-mono text-[11px] text-slate-300">
                {activeProject.milestones.length} Tranches
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ice-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              ERC-8004 Dilithium Settlement
            </span>
          </div>

          <div className="space-y-4">
            {activeProject.milestones.map((m, idx) => {
              const spec = parseMilestoneSpecUri(m.descriptionURI);
              const feeAmount = (m.amount * BigInt(effectiveFeeBps)) / 10_000n;
              const payoutAmount = m.amount - feeAmount;
              const hasDeliverableHash =
                Boolean(m.deliverableHash) && m.deliverableHash !== ZERO_BYTES32;
              const isOverdue = m.dueDate > 0 && nowUnix > m.dueDate;
              const ratingRecord = ratingsByMilestone[m.index];
              const currentUserAlreadyRated =
                effectiveRole === "CLIENT"
                  ? ratingRecord?.clientRatedScore !== undefined
                  : ratingRecord?.freelancerRatedScore !== undefined;

              const leftBorderAccent =
                m.status === 2 || m.status === 4
                  ? "border-l-teal-400"
                  : m.status === 1
                    ? "border-l-copper"
                    : m.status === 3 || m.status === 5
                      ? "border-l-rose-400"
                      : "border-l-slate-600";

              const statusBadgeClass =
                m.status === 2 || m.status === 4
                  ? "border-teal-500/35 bg-teal-500/10 text-teal-400"
                  : m.status === 1
                    ? "border-copper/40 bg-copper/10 text-copper-400"
                    : m.status === 3 || m.status === 5
                      ? "border-rose-500/35 bg-rose-500/10 text-rose-400"
                      : "border-hairline bg-elevated text-slate-400";

              return (
                <motion.article
                  key={m.index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: idx * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`overflow-hidden rounded-2xl border border-hairline border-l-4 bg-surface p-5 transition-colors hover:border-hairline/90 ${leftBorderAccent}`}
                >
                  {/* Milestone Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-hairline bg-elevated px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-300">
                          M{m.index}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${statusBadgeClass}`}
                        >
                          {MILESTONE_STATUS_LABELS[m.status]}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                          <Calendar className="h-3 w-3 text-slate-500" />
                          Due {formatShortDate(m.dueDate)}
                        </span>
                      </div>

                      <h3 className="mt-2 font-display text-base font-semibold text-slate-50">
                        {m.title}
                      </h3>
                      {spec?.deliverables && (
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                          {spec.deliverables}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-lg font-bold tabular-nums text-slate-50">
                        {formatTUSD8(m.amount)}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                        tUSD8 Escrow
                      </p>
                    </div>
                  </div>

                  {/* ==================================================== */}
                  {/* STATE 1: Approved (2), ResolvedRelease (4), Refund (5) */}
                  {/* ==================================================== */}
                  {(m.status === 2 || m.status === 4 || m.status === 5) && (
                    <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                      {/* Deliverable URI + Hash when present */}
                      {(m.deliverableURI || hasDeliverableHash) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-elevated/50 px-3.5 py-2.5 text-xs">
                          <div className="min-w-0 flex-1 space-y-1">
                            {m.deliverableURI && (
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
                                <FileCode2 className="h-3.5 w-3.5 shrink-0 text-ice-400" />
                                <span className="truncate">
                                  {m.deliverableURI}
                                </span>
                              </div>
                            )}
                            {hasDeliverableHash && (
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                                <Hash className="h-3 w-3 shrink-0 text-teal-400" />
                                <span>
                                  {shortenHash(m.deliverableHash, 12, 10)}
                                </span>
                              </div>
                            )}
                          </div>
                          {hasDeliverableHash && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(`hash-${m.index}`, m.deliverableHash)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-teal-500/40 hover:text-teal-400"
                            >
                              {copiedKey === `hash-${m.index}` ? (
                                <>
                                  <Check className="h-3 w-3 text-teal-400" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy Hash
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* On-Chain Settlement Receipt Box */}
                      <div className="rounded-xl border border-hairline bg-canvas p-3.5 font-mono text-xs">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            On-Chain Settlement Receipt
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              m.status === 5 ? "text-rose-400" : "text-teal-400"
                            }`}
                          >
                            {m.status === 5
                              ? "REFUNDED TO CLIENT"
                              : "SETTLED VIA MILESTONEESCROW"}
                          </span>
                        </div>

                        {m.status === 5 ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface/70 px-3 py-2">
                              <span className="text-slate-400">
                                Client Refund (100%)
                              </span>
                              <span className="font-semibold tabular-nums text-teal-400">
                                {formatTUSD8(m.amount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface/70 px-3 py-2">
                              <span className="text-slate-400">
                                Protocol Fee
                              </span>
                              <span className="tabular-nums text-slate-400">
                                $0.00 (0%)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface/70 px-3 py-2">
                              <span className="text-slate-400">
                                Freelancer ({payoutPercentLabel}%)
                              </span>
                              <span className="font-semibold tabular-nums text-teal-400">
                                {formatTUSD8(payoutAmount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface/70 px-3 py-2">
                              <span className="text-slate-400">
                                Protocol Fee ({feePercentLabel}%)
                              </span>
                              <span className="tabular-nums text-slate-400">
                                {formatTUSD8(feeAmount)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bilateral ERC-8004 Rating Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-elevated/45 px-3.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                          <span className="inline-flex items-center gap-1.5 text-slate-400">
                            <UserCheck className="h-3.5 w-3.5 text-copper-400" />
                            ERC-8004 Ratings:
                          </span>
                          {ratingRecord?.clientRatedScore !== undefined ? (
                            <span className="rounded border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-teal-400">
                              Client → Freelancer: ★{" "}
                              {ratingRecord.clientRatedScore}/100
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Client rating pending
                            </span>
                          )}
                          {ratingRecord?.freelancerRatedScore !== undefined ? (
                            <span className="rounded border border-ice/30 bg-ice/10 px-2 py-0.5 text-ice-400">
                              Freelancer → Client: ★{" "}
                              {ratingRecord.freelancerRatedScore}/100
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              Freelancer rating pending
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={currentUserAlreadyRated || isBusy}
                          onClick={() => setRateModalMilestone(m)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                            currentUserAlreadyRated
                              ? "cursor-default border-teal-500/30 bg-teal-500/10 text-teal-400"
                              : "border-copper/40 bg-copper/10 text-copper-400 hover:bg-copper/20"
                          }`}
                        >
                          {currentUserAlreadyRated ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Rated
                            </>
                          ) : (
                            <>
                              <Star className="h-3.5 w-3.5" />
                              {effectiveRole === "CLIENT"
                                ? "Rate Freelancer"
                                : "Rate Client"}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ==================================================== */}
                  {/* STATE 2: Submitted (1)                               */}
                  {/* ==================================================== */}
                  {m.status === 1 && (
                    <div className="mt-4 space-y-3.5 border-t border-hairline pt-4">
                      {/* Deliverable Proof Panel */}
                      <div className="rounded-xl border border-copper/25 bg-canvas/90 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-copper-400">
                            Deliverable Proof Payload
                          </span>
                          <span className="inline-flex items-center gap-1 rounded border border-teal-500/35 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-400">
                            <CheckCircle2 className="h-3 w-3" />
                            VERIFIED MATCH
                          </span>
                        </div>

                        <div className="mt-2.5 space-y-2 font-mono text-xs">
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface/80 px-3 py-2">
                            <span className="truncate text-slate-200">
                              {m.deliverableURI || "ipfs://deliverable-uri"}
                            </span>
                            {m.deliverableURI.startsWith("http") && (
                              <a
                                href={m.deliverableURI}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-ice-400 hover:text-ice"
                                aria-label="Open deliverable link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Hash className="h-3 w-3 text-teal-400" />
                              <span className="text-slate-300">
                                {shortenHash(m.deliverableHash, 14, 10)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  `sub-hash-${m.index}`,
                                  m.deliverableHash
                                )
                              }
                              className="inline-flex items-center gap-1 text-slate-400 transition-colors hover:text-slate-100"
                            >
                              {copiedKey === `sub-hash-${m.index}` ? (
                                <>
                                  <Check className="h-3 w-3 text-teal-400" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                  Copy keccak256
                                </>
                              )}
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Submitted {formatTimestampShort(m.submittedAt)}
                            </span>
                            <span>Due {formatShortDate(m.dueDate)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Role-Specific Actions */}
                      {effectiveRole === "CLIENT" ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setApproveModalMilestone(m)}
                              className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2.5 text-xs font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.26)] transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Approve &amp; Release {formatTUSD8(m.amount)} tUSD8
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDisputeModalMilestone(m)}
                              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Scale className="h-3.5 w-3.5" />
                              Open AI Dispute
                            </button>
                          </div>
                          <p className="font-mono text-[11px] text-slate-400">
                            Settlement split: {formatTUSD8(payoutAmount)}{" "}
                            Freelancer ({payoutPercentLabel}%) •{" "}
                            {formatTUSD8(feeAmount)} Protocol Fee (
                            {feePercentLabel}%)
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-elevated/50 px-3.5 py-2.5">
                          <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                            <Clock className="h-3.5 w-3.5 text-copper-400" />
                            Awaiting Client review (
                            {formatDurationSeconds(reviewPeriodSec)} review
                            window)
                          </span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setDisputeModalMilestone(m)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
                          >
                            <Scale className="h-3 w-3" />
                            Open AI Dispute (After Review Window)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ==================================================== */}
                  {/* STATE 3: Disputed (3)                                */}
                  {/* ==================================================== */}
                  {m.status === 3 && (
                    <div className="mt-4 border-t border-hairline pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5">
                        <div className="flex items-start gap-2.5">
                          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                          <div>
                            <p className="text-xs font-semibold text-rose-300">
                              AI Arbitration Active — Escrow Frozen
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-slate-300">
                              3 Conflict-Free ERC-8004 Arbiters Assigned • 2-of-3
                              Quorum
                            </p>
                          </div>
                        </div>

                        <Link
                          href="/disputes"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-canvas/80 px-3 py-1.5 font-mono text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
                        >
                          Go to Arbitration Panel
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* ==================================================== */}
                  {/* STATE 4: Pending (0)                                 */}
                  {/* ==================================================== */}
                  {m.status === 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                        <Lock className="h-3.5 w-3.5 text-slate-500" />
                        <span>
                          Escrow Status: Locked in MilestoneEscrow Contract
                        </span>
                      </div>

                      {effectiveRole === "FREELANCER" &&
                      activeProject.status === 1 ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setSubmitModalMilestone(m)}
                          className="inline-flex items-center gap-2 rounded-xl border border-ice/40 bg-ice/10 px-3.5 py-2 font-mono text-xs font-semibold text-ice-400 transition-colors hover:bg-ice/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Submit Deliverable (URI + keccak256)
                        </button>
                      ) : effectiveRole === "CLIENT" &&
                        activeProject.status === 1 ? (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[11px] text-slate-500">
                            Overdue milestones can be disputed by Client after
                            due date
                          </span>
                          {isOverdue && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDisputeModalMilestone(m)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
                            >
                              <Scale className="h-3 w-3" />
                              Open Overdue Dispute
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </motion.article>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN (4 cols): 3 Sticky Sidebar Cards */}
        <aside className="space-y-4 lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-24">
            {/* Card 1: Vault Proof */}
            <section className="rounded-2xl border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Vault Proof
                </h3>
                <span className="inline-flex items-center gap-1 rounded border border-teal-500/35 bg-teal-500/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-teal-400">
                  <ShieldCheck className="h-3 w-3" />
                  VERIFIED ON-CHAIN
                </span>
              </div>

              <div className="mt-4 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">MilestoneEscrow</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-200">
                      {shortenAddress(CONTRACT_ADDRESSES.MilestoneEscrow, 6, 4)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          "escrow-addr",
                          CONTRACT_ADDRESSES.MilestoneEscrow
                        )
                      }
                      aria-label="Copy MilestoneEscrow address"
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-elevated hover:text-slate-100"
                    >
                      {copiedKey === "escrow-addr" ? (
                        <Check className="h-3 w-3 text-teal-400" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Settlement Token</span>
                  <span className="text-slate-200">tUSD8 (6 decimals)</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Snapshotted Fee</span>
                  <span className="text-slate-200">
                    {effectiveFeeBps} bps ({feePercentLabel}%)
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Refund Policy</span>
                  <span className="text-teal-400">0% Fee (100% Client)</span>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
                  <span className="text-slate-300">Current Locked Balance</span>
                  <span className="font-bold tabular-nums text-copper-400">
                    {formatTUSD8(financials.locked)}
                  </span>
                </div>
              </div>

              <a
                href={explorerAddressUrl(CONTRACT_ADDRESSES.MilestoneEscrow)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-hairline bg-elevated px-3.5 py-2 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
              >
                Verify Contract on Aevum Explorer
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </section>

            {/* Card 2: AI Arbitration Protocol */}
            <section className="rounded-2xl border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  AI Arbitration Protocol
                </h3>
                <span className="rounded border border-ice/35 bg-ice/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-ice-400">
                  ERC-8004
                </span>
              </div>

              <div className="mt-4 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Panel Size</span>
                  <span className="text-slate-200">
                    3 Arbiters • 2-of-3 Quorum
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Review Window</span>
                  <span className="text-slate-200">
                    {formatDurationSeconds(reviewPeriodSec)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Voting Deadline</span>
                  <span className="text-slate-200">
                    {formatDurationSeconds(votingPeriodSec)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Proof Standard</span>
                  <span className="text-ice-400">
                    ValidationRegistry • zkML / TEE
                  </span>
                </div>
              </div>
            </section>

            {/* Card 3: On-Chain Timeline */}
            <section className="rounded-2xl border border-hairline bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  On-Chain Timeline
                </h3>
                <span className="font-mono text-[10px] text-slate-500">
                  {timelineEvents.length} events
                </span>
              </div>

              <div className="mt-4 space-y-3.5">
                {timelineEvents.map((ev, index) => {
                  const dotClass =
                    ev.tone === "teal"
                      ? "bg-teal-400 ring-teal-400/20"
                      : ev.tone === "copper"
                        ? "bg-copper ring-copper/20"
                        : ev.tone === "ice"
                          ? "bg-ice ring-ice/20"
                          : ev.tone === "rose"
                            ? "bg-rose-400 ring-rose-400/20"
                            : "bg-slate-500 ring-slate-500/20";

                  return (
                    <div key={ev.id} className="relative flex gap-3">
                      {index < timelineEvents.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[5px] top-4 h-[calc(100%+6px)] w-px bg-hairline"
                        />
                      )}
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${dotClass}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-100">
                            {ev.label}
                          </p>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            {formatTimestampShort(ev.timestamp)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                          {ev.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>
      </div>

      {/* ================================================================== */}
      {/* Milestone Action Modals                                            */}
      {/* ================================================================== */}
      <SubmitDeliverableModal
        projectId={activeProject.projectId}
        milestone={submitModalMilestone}
        isOpen={submitModalMilestone !== null}
        isSubmitting={isBusy}
        onClose={() => setSubmitModalMilestone(null)}
        onConfirm={handleSubmitDeliverable}
      />

      <ApproveMilestoneModal
        projectId={activeProject.projectId}
        milestone={approveModalMilestone}
        freelancerAddress={activeProject.freelancerAddress}
        freelancerName={effectiveFreelancerName}
        feeBps={effectiveFeeBps}
        isOpen={approveModalMilestone !== null}
        isSubmitting={isBusy}
        onClose={() => setApproveModalMilestone(null)}
        onConfirm={handleApproveMilestone}
      />

      <OpenDisputeModal
        projectId={activeProject.projectId}
        milestone={disputeModalMilestone}
        isOpen={disputeModalMilestone !== null}
        isSubmitting={isBusy}
        onClose={() => setDisputeModalMilestone(null)}
        onConfirm={handleOpenDispute}
      />

      <RateCounterpartyModal
        projectId={activeProject.projectId}
        milestone={rateModalMilestone}
        targetAgentId={
          effectiveRole === "CLIENT"
            ? effectiveFreelancerId
            : activeProject.clientAgentId
        }
        targetRole={effectiveRole === "CLIENT" ? "Freelancer" : "Client"}
        targetName={
          effectiveRole === "CLIENT"
            ? effectiveFreelancerName
            : activeProject.clientName
        }
        isOpen={rateModalMilestone !== null}
        isSubmitting={isBusy}
        onClose={() => setRateModalMilestone(null)}
        onConfirm={handleRateCounterparty}
      />

      {/* ================================================================== */}
      {/* Animated Bottom-Right Toast Notifications                          */}
      {/* ================================================================== */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((toast) => {
            const borderTone =
              toast.tone === "teal"
                ? "border-teal-500/40"
                : toast.tone === "rose"
                  ? "border-rose-500/40"
                  : toast.tone === "ice"
                    ? "border-ice/40"
                    : "border-copper/40";

            const titleTone =
              toast.tone === "teal"
                ? "text-teal-400"
                : toast.tone === "rose"
                  ? "text-rose-400"
                  : toast.tone === "ice"
                    ? "text-ice-400"
                    : "text-copper-400";

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`pointer-events-auto rounded-xl border bg-surface/95 p-3.5 shadow-2xl backdrop-blur-md ${borderTone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-display text-xs font-semibold ${titleTone}`}>
                      {toast.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {toast.description}
                    </p>
                    {toast.txHash && (
                      <a
                        href={explorerTxUrl(toast.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-ice-400 hover:underline"
                      >
                        View tx {shortenHash(toast.txHash, 8, 6)}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss notification"
                    className="rounded p-1 text-slate-400 hover:bg-elevated hover:text-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
