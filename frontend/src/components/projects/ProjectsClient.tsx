"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Layers,
  Link2,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { zeroAddress, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import {
  AcceptProjectModal,
  CancelProjectModal,
} from "@/components/projects/ProjectActionModals";
import {
  AGENT_ROLE_LABELS,
  parseAgentCardUri,
  toAgentRoleId,
} from "@/lib/agentCard";
import { aevumTestnet } from "@/lib/chains";
import {
  ERC20_ABI,
  IDENTITY_REGISTRY_ABI,
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
} from "@/lib/format";
import {
  MOCK_USER_ADDRESS,
  MOCK_USER_PASSPORTS,
  type PassportRecord,
} from "@/lib/mockIdentityData";
import {
  MOCK_PROJECTS,
  MOCK_PROTOCOL_FEE_BPS,
  MOCK_USER_TUSD8_BALANCE,
  type MilestoneRecord,
  type ProjectRecord,
} from "@/lib/mockProjectsData";
import {
  buildJsonDataUri,
  dateInputToUnix,
  formatShortDate,
  parseMilestoneSpecUri,
  parseProjectBriefUri,
  parseTUSD8Input,
  toMilestoneStatusId,
  toProjectStatusId,
} from "@/lib/projectMetadata";

type StatusFilter =
  | "ALL"
  | "OPEN"
  | "ACTIVE"
  | "DISPUTED"
  | "COMPLETED"
  | "MINE";

type HiringModeFilter = "ALL" | "OPEN" | "DIRECT";
type BuilderHiringMode = "OPEN" | "DIRECT";
type MetadataStorageMode = "AUTO_JSON" | "CUSTOM_URI";

interface DraftMilestone {
  id: string;
  description: string;
  amount: string;
  dueDate: string;
}

interface ToastState {
  id: number;
  tone: "pending" | "success" | "error";
  title: string;
  description: string;
  txHash?: `0x${string}`;
}

const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "OPEN", label: "Open Marketplace" },
  { id: "ACTIVE", label: "Active" },
  { id: "DISPUTED", label: "Disputed" },
  { id: "COMPLETED", label: "Completed" },
  { id: "MINE", label: "My Projects" },
];

const HIRING_MODE_FILTERS: readonly { id: HiringModeFilter; label: string }[] = [
  { id: "ALL", label: "All Modes" },
  { id: "OPEN", label: "Open" },
  { id: "DIRECT", label: "Direct" },
];

const MAX_MULTICALL_PROJECTS = 40;
const MAX_MULTICALL_AGENTS = 50;
const MAX_MILESTONES = 20;

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function defaultDueDateOffset(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasDisputedMilestone(project: ProjectRecord): boolean {
  return project.milestones.some((m) => m.status === 3);
}

function getNextMilestoneDue(project: ProjectRecord): string {
  const upcoming = project.milestones.find(
    (m) => m.status === 0 || m.status === 1 || m.status === 3
  );
  if (upcoming) {
    return formatShortDate(upcoming.dueDate);
  }
  if (project.status === 2) return "All Settled";
  if (project.status === 3) return "Refunded";
  return "TBD";
}

function getSettlementSummary(project: ProjectRecord): string {
  const total = project.milestones.length;
  if (project.status === 3) return "Cancelled • 100% Refunded";
  if (project.status === 2) return `${total}/${total} Approved`;
  const disputed = project.milestones.filter((m) => m.status === 3).length;
  if (disputed > 0) {
    return `${project.settledCount}/${total} Settled • ${disputed} Disputed`;
  }
  const submitted = project.milestones.filter((m) => m.status === 1).length;
  if (submitted > 0) {
    return `${project.settledCount}/${total} Settled • ${submitted} Submitted`;
  }
  return `${project.settledCount}/${total} Settled • ${total - project.settledCount} Pending`;
}

export function ProjectsClient() {
  const { address: connectedAddress, isConnected } = useAccount();

  const builderSectionRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Local Interactive Preview Mode state
  const [mockProjects, setMockProjects] =
    useState<ProjectRecord[]>(MOCK_PROJECTS);
  const [mockBalance, setMockBalance] = useState<bigint>(
    MOCK_USER_TUSD8_BALANCE
  );
  const [mockApprovedAmount, setMockApprovedAmount] = useState<bigint>(0n);

  // Filter & search state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [hiringModeFilter, setHiringModeFilter] =
    useState<HiringModeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Builder form state
  const [selectedClientAgentId, setSelectedClientAgentId] = useState<string>(
    "1"
  );
  const [manualClientAgentId, setManualClientAgentId] = useState<string>("");
  const [builderHiringMode, setBuilderHiringMode] =
    useState<BuilderHiringMode>("OPEN");
  const [targetFreelancerId, setTargetFreelancerId] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [projectSummary, setProjectSummary] = useState<string>("");
  const [metadataMode, setMetadataMode] =
    useState<MetadataStorageMode>("AUTO_JSON");
  const [customMetadataUri, setCustomMetadataUri] = useState<string>("");
  const [draftMilestones, setDraftMilestones] = useState<DraftMilestone[]>([
    {
      id: "m-init-1",
      description: "Architecture Spec & Initial Deliverable",
      amount: "750.00",
      dueDate: defaultDueDateOffset(14),
    },
    {
      id: "m-init-2",
      description: "Final Implementation & Test Verification",
      amount: "750.00",
      dueDate: defaultDueDateOffset(28),
    },
  ]);
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Modals, clipboard & toast
  const [acceptTarget, setAcceptTarget] = useState<ProjectRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ProjectRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(
    null
  );
  const [lastWriteKind, setLastWriteKind] = useState<
    "approve" | "create" | "accept" | "cancel" | null
  >(null);

  function showToast(
    tone: ToastState["tone"],
    title: string,
    description: string,
    txHash?: `0x${string}`
  ) {
    setToast({
      id: Date.now(),
      tone,
      title,
      description,
      txHash,
    });
  }

  useEffect(() => {
    if (!toast || toast.tone === "pending") return;
    const timer = setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4800);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Reads (enabled when IS_PROTOCOL_DEPLOYED === true)         */
  /* ------------------------------------------------------------------------ */

  const { data: liveTotalProjectsRaw, refetch: refetchTotalProjects } =
    useReadContract({
      address: CONTRACT_ADDRESSES.ProjectManager,
      abi: PROJECT_MANAGER_ABI,
      functionName: "totalProjects",
      chainId: aevumTestnet.id,
      query: { enabled: IS_PROTOCOL_DEPLOYED },
    });

  const { data: liveFeeBpsRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.MilestoneEscrow,
    abi: MILESTONE_ESCROW_ABI,
    functionName: "feeBps",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const { data: liveBalanceRaw, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.tUSD8,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED && Boolean(connectedAddress) },
  });

  const { data: liveAllowanceRaw, refetch: refetchAllowance } = useReadContract(
    {
      address: CONTRACT_ADDRESSES.tUSD8,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: connectedAddress
        ? [connectedAddress, CONTRACT_ADDRESSES.MilestoneEscrow]
        : undefined,
      chainId: aevumTestnet.id,
      query: { enabled: IS_PROTOCOL_DEPLOYED && Boolean(connectedAddress) },
    }
  );

  const liveProjectIds = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || typeof liveTotalProjectsRaw !== "bigint") {
      return [] as number[];
    }
    const count = Math.min(Number(liveTotalProjectsRaw), MAX_MULTICALL_PROJECTS);
    return Array.from({ length: count }, (_, idx) => count - idx);
  }, [liveTotalProjectsRaw]);

  const projectMulticallContracts = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || liveProjectIds.length === 0) return [];
    return liveProjectIds.flatMap((id) => {
      const pid = BigInt(id);
      return [
        {
          address: CONTRACT_ADDRESSES.ProjectManager,
          abi: PROJECT_MANAGER_ABI,
          functionName: "getProject" as const,
          args: [pid] as const,
          chainId: aevumTestnet.id,
        },
        {
          address: CONTRACT_ADDRESSES.ProjectManager,
          abi: PROJECT_MANAGER_ABI,
          functionName: "getProjectMilestones" as const,
          args: [pid] as const,
          chainId: aevumTestnet.id,
        },
      ];
    });
  }, [liveProjectIds]);

  const { data: projectResults, refetch: refetchProjectsMulticall } =
    useReadContracts({
      contracts: projectMulticallContracts,
      query: {
        enabled: IS_PROTOCOL_DEPLOYED && projectMulticallContracts.length > 0,
      },
    });

  // Read user's IdentityRegistry passports when deployed
  const { data: liveTotalAgentsRaw } = useReadContract({
    address: CONTRACT_ADDRESSES.IdentityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "totalAgents",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const liveAgentIds = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || typeof liveTotalAgentsRaw !== "bigint") {
      return [] as number[];
    }
    const count = Math.min(Number(liveTotalAgentsRaw), MAX_MULTICALL_AGENTS);
    return Array.from({ length: count }, (_, idx) => idx + 1);
  }, [liveTotalAgentsRaw]);

  const identityMulticallContracts = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || liveAgentIds.length === 0) return [];
    return liveAgentIds.flatMap((id) => {
      const tokenId = BigInt(id);
      return [
        {
          address: CONTRACT_ADDRESSES.IdentityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "ownerOf" as const,
          args: [tokenId] as const,
          chainId: aevumTestnet.id,
        },
        {
          address: CONTRACT_ADDRESSES.IdentityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "getAgentInfo" as const,
          args: [tokenId] as const,
          chainId: aevumTestnet.id,
        },
        {
          address: CONTRACT_ADDRESSES.IdentityRegistry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: "tokenURI" as const,
          args: [tokenId] as const,
          chainId: aevumTestnet.id,
        },
      ];
    });
  }, [liveAgentIds]);

  const { data: identityResults } = useReadContracts({
    contracts: identityMulticallContracts,
    query: {
      enabled: IS_PROTOCOL_DEPLOYED && identityMulticallContracts.length > 0,
    },
  });

  const livePassports = useMemo<PassportRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !identityResults || liveAgentIds.length === 0) {
      return [];
    }
    const parsed: PassportRecord[] = [];
    for (let i = 0; i < liveAgentIds.length; i += 1) {
      const agentId = liveAgentIds[i];
      const base = i * 3;
      const ownerItem = identityResults[base];
      const infoItem = identityResults[base + 1];
      const uriItem = identityResults[base + 2];
      if (ownerItem?.status !== "success" || infoItem?.status !== "success") {
        continue;
      }
      const owner = ownerItem.result as Address;
      const info = infoItem.result as {
        role: number;
        active: boolean;
        registeredAt: bigint;
      };
      const agentURI =
        uriItem?.status === "success" ? String(uriItem.result) : "";
      const role = toAgentRoleId(Number(info.role));
      const decoded = parseAgentCardUri(agentURI);
      const roleLabel = AGENT_ROLE_LABELS[role];
      parsed.push({
        agentId,
        owner,
        role,
        active: Boolean(info.active),
        registeredAt: Number(info.registeredAt),
        agentURI,
        displayName: decoded?.name ?? `${roleLabel} #${agentId}`,
        subtitle: decoded?.description?.slice(0, 48) ?? `${roleLabel} Passport`,
        description: decoded?.description ?? "",
        endpoint: decoded?.services[0]?.endpoint ?? "",
        trustScore: 95,
        reviewCount: 0,
        reviewLabel: "On-chain",
        tags: [roleLabel],
        metadata: {},
      });
    }
    return parsed;
  }, [identityResults, liveAgentIds]);

  const liveProjects = useMemo<ProjectRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !projectResults || liveProjectIds.length === 0) {
      return [];
    }

    const passportById = new Map<number, PassportRecord>();
    for (const p of livePassports) {
      passportById.set(p.agentId, p);
    }

    const parsed: ProjectRecord[] = [];
    for (let i = 0; i < liveProjectIds.length; i += 1) {
      const base = i * 2;
      const projItem = projectResults[base];
      const msItem = projectResults[base + 1];
      if (projItem?.status !== "success") continue;

      const rawProj = projItem.result as {
        projectId: bigint;
        clientAgentId: bigint;
        freelancerAgentId: bigint;
        client: Address;
        status: number;
        milestoneCount: number;
        settledCount: number;
        createdAt: bigint;
        freelancer: Address;
        totalBudget: bigint;
        metadataURI: string;
      };

      const rawMilestones =
        msItem?.status === "success"
          ? (msItem.result as readonly {
              amount: bigint;
              dueDate: bigint;
              submittedAt: bigint;
              status: number;
              deliverableHash: `0x${string}`;
              descriptionURI: string;
              deliverableURI: string;
            }[])
          : [];

      const decodedBrief = parseProjectBriefUri(rawProj.metadataURI);
      const projectId = Number(rawProj.projectId);
      const clientAgentId = Number(rawProj.clientAgentId);
      const freelancerAgentId = Number(rawProj.freelancerAgentId);
      const clientPassport = passportById.get(clientAgentId);
      const freelancerPassport =
        freelancerAgentId > 0 ? passportById.get(freelancerAgentId) : undefined;

      const milestones: MilestoneRecord[] = rawMilestones.map((m, idx) => {
        const decodedSpec = parseMilestoneSpecUri(m.descriptionURI);
        return {
          index: idx,
          title: decodedSpec?.title ?? `Milestone #${idx + 1}`,
          amount: m.amount,
          dueDate: Number(m.dueDate),
          submittedAt: Number(m.submittedAt),
          status: toMilestoneStatusId(Number(m.status)),
          deliverableHash: m.deliverableHash,
          descriptionURI: m.descriptionURI,
          deliverableURI: m.deliverableURI,
        };
      });

      const status = toProjectStatusId(Number(rawProj.status));
      const isDirectHire =
        freelancerAgentId > 0 &&
        (status === 0 || rawProj.freelancer !== zeroAddress);

      parsed.push({
        projectId,
        title: decodedBrief?.title ?? `Escrow Project #TRL-${projectId}`,
        summary:
          decodedBrief?.summary ||
          `On-chain milestone escrow funded with ${formatTUSD8(rawProj.totalBudget)} tUSD8.`,
        category: decodedBrief?.category ?? "Escrow",
        clientAgentId,
        clientName: clientPassport?.displayName ?? `Client #${clientAgentId}`,
        clientTrustScore: clientPassport?.trustScore ?? 95,
        clientAddress: rawProj.client,
        freelancerAgentId,
        freelancerName:
          freelancerAgentId > 0
            ? freelancerPassport?.displayName ?? `Agent #${freelancerAgentId}`
            : undefined,
        freelancerAddress: rawProj.freelancer,
        isDirectHire,
        status,
        totalBudget: rawProj.totalBudget,
        settledCount: Number(rawProj.settledCount),
        createdAt: Number(rawProj.createdAt),
        metadataURI: rawProj.metadataURI,
        milestones,
      });
    }

    return parsed;
  }, [livePassports, liveProjectIds, projectResults]);

  /* ------------------------------------------------------------------------ */
  /* Live On-Chain Writes                                                     */
  /* ------------------------------------------------------------------------ */

  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: aevumTestnet.id,
  });

  useEffect(() => {
    if (txHash && isConfirming) {
      showToast(
        "pending",
        pendingActionLabel ?? "Transaction Submitted",
        "Waiting for QDay Aevum L2 block confirmation...",
        txHash
      );
    }
  }, [txHash, isConfirming, pendingActionLabel]);

  useEffect(() => {
    if (!isConfirmed || !txHash) return;
    showToast(
      "success",
      "Transaction Confirmed",
      `${pendingActionLabel ?? "Escrow action"} finalized on QDay Aevum.`,
      txHash
    );
    if (lastWriteKind === "accept") setAcceptTarget(null);
    if (lastWriteKind === "cancel") setCancelTarget(null);
    if (lastWriteKind === "create") {
      setProjectTitle("");
      setProjectSummary("");
      setCustomMetadataUri("");
      setTargetFreelancerId("");
    }
    void refetchAllowance();
    void refetchBalance();
    void refetchTotalProjects();
    void refetchProjectsMulticall();
    resetWrite();
  }, [
    isConfirmed,
    txHash,
    pendingActionLabel,
    lastWriteKind,
    refetchAllowance,
    refetchBalance,
    refetchTotalProjects,
    refetchProjectsMulticall,
    resetWrite,
  ]);

  useEffect(() => {
    const err = writeError ?? receiptError;
    if (!err) return;
    const message =
      err.message.split("\n")[0]?.slice(0, 140) || "Transaction rejected.";
    showToast("error", "Transaction Failed", message);
  }, [writeError, receiptError]);

  /* ------------------------------------------------------------------------ */
  /* Unified Data View (Live On-Chain vs Interactive Preview Mode)            */
  /* ------------------------------------------------------------------------ */

  const activeUserAddress: Address | undefined = IS_PROTOCOL_DEPLOYED
    ? connectedAddress
    : connectedAddress ?? MOCK_USER_ADDRESS;

  const userPassports = useMemo<PassportRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) return MOCK_USER_PASSPORTS;
    if (!connectedAddress) return [];
    const lower = connectedAddress.toLowerCase();
    return livePassports.filter((p) => p.owner.toLowerCase() === lower);
  }, [connectedAddress, livePassports]);

  const userClientPassports = useMemo(
    () => userPassports.filter((p) => p.role === 0),
    [userPassports]
  );

  const userFreelancerPassports = useMemo(
    () => userPassports.filter((p) => p.role === 1),
    [userPassports]
  );

  useEffect(() => {
    if (userClientPassports.length > 0) {
      const stillValid = userClientPassports.some(
        (p) => String(p.agentId) === selectedClientAgentId
      );
      if (!stillValid && selectedClientAgentId !== "manual") {
        setSelectedClientAgentId(String(userClientPassports[0].agentId));
      }
    } else if (selectedClientAgentId !== "manual") {
      setSelectedClientAgentId("manual");
    }
  }, [userClientPassports, selectedClientAgentId]);

  const projects = IS_PROTOCOL_DEPLOYED ? liveProjects : mockProjects;

  const protocolFeeBps =
    IS_PROTOCOL_DEPLOYED && typeof liveFeeBpsRaw === "number"
      ? liveFeeBpsRaw
      : MOCK_PROTOCOL_FEE_BPS;

  const userBalance: bigint =
    IS_PROTOCOL_DEPLOYED && typeof liveBalanceRaw === "bigint"
      ? liveBalanceRaw
      : IS_PROTOCOL_DEPLOYED
      ? 0n
      : mockBalance;

  const currentAllowance: bigint =
    IS_PROTOCOL_DEPLOYED && typeof liveAllowanceRaw === "bigint"
      ? liveAllowanceRaw
      : IS_PROTOCOL_DEPLOYED
      ? 0n
      : mockApprovedAmount;

  // Escrow TVL across Open + Active projects (unsettled locked milestones)
  const escrowTvlNumber = useMemo(() => {
    let totalMicro = 0n;
    for (const p of projects) {
      if (p.status === 0 || p.status === 1) {
        for (const m of p.milestones) {
          if (m.status === 0 || m.status === 1 || m.status === 3) {
            totalMicro += m.amount;
          }
        }
      }
    }
    return Number(totalMicro) / 10 ** TUSD8_DECIMALS;
  }, [projects]);

  const isClientOfProject = (project: ProjectRecord): boolean => {
    if (!activeUserAddress) return false;
    return (
      project.clientAddress.toLowerCase() === activeUserAddress.toLowerCase()
    );
  };

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const userLower = activeUserAddress?.toLowerCase() ?? "";
    return projects.filter((p) => {
      // Status filter
      if (statusFilter === "OPEN" && p.status !== 0) return false;
      if (
        statusFilter === "ACTIVE" &&
        !(p.status === 1 && !hasDisputedMilestone(p))
      ) {
        return false;
      }
      if (statusFilter === "DISPUTED" && !hasDisputedMilestone(p)) return false;
      if (statusFilter === "COMPLETED" && p.status !== 2) return false;
      if (statusFilter === "MINE") {
        if (
          !userLower ||
          (p.clientAddress.toLowerCase() !== userLower &&
            p.freelancerAddress.toLowerCase() !== userLower)
        ) {
          return false;
        }
      }

      // Hiring mode filter
      if (hiringModeFilter === "OPEN" && p.isDirectHire) return false;
      if (hiringModeFilter === "DIRECT" && !p.isDirectHire) return false;

      // Search query
      if (query) {
        const haystack = [
          p.title,
          p.summary,
          `#trl-${p.projectId}`,
          `trl-${p.projectId}`,
          String(p.projectId),
          p.clientName,
          p.clientAddress,
          p.freelancerName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [projects, statusFilter, hiringModeFilter, searchQuery, activeUserAddress]);

  /* ------------------------------------------------------------------------ */
  /* Builder Computed Financials & Validation                                 */
  /* ------------------------------------------------------------------------ */

  const parsedMilestoneAmounts = useMemo(
    () => draftMilestones.map((m) => parseTUSD8Input(m.amount)),
    [draftMilestones]
  );

  const totalLockAmount = useMemo(
    () => parsedMilestoneAmounts.reduce((acc, amt) => acc + amt, 0n),
    [parsedMilestoneAmounts]
  );

  const maxProtocolFee = useMemo(
    () => (totalLockAmount * BigInt(protocolFeeBps)) / 10_000n,
    [totalLockAmount, protocolFeeBps]
  );

  const feePercentLabel = (protocolFeeBps / 100).toFixed(1);
  const hasSufficientBalance =
    totalLockAmount > 0n && userBalance >= totalLockAmount;
  const isApprovedForTotal =
    totalLockAmount > 0n && currentAllowance >= totalLockAmount;

  const resolvedClientAgentId = useMemo(() => {
    const raw =
      selectedClientAgentId === "manual"
        ? manualClientAgentId.trim()
        : selectedClientAgentId;
    const num = Number(raw);
    return Number.isInteger(num) && num > 0 ? num : 0;
  }, [selectedClientAgentId, manualClientAgentId]);

  const isBuilderFormValid = useMemo(() => {
    if (resolvedClientAgentId <= 0) return false;
    if (metadataMode === "AUTO_JSON" && !projectTitle.trim()) return false;
    if (metadataMode === "CUSTOM_URI" && !customMetadataUri.trim())
      return false;
    if (builderHiringMode === "DIRECT") {
      const target = Number(targetFreelancerId.trim());
      if (!Number.isInteger(target) || target <= 0) return false;
    }
    if (draftMilestones.length === 0 || draftMilestones.length > MAX_MILESTONES) {
      return false;
    }
    for (let i = 0; i < draftMilestones.length; i += 1) {
      const m = draftMilestones[i];
      if (!m.description.trim()) return false;
      if (parsedMilestoneAmounts[i] <= 0n) return false;
      if (dateInputToUnix(m.dueDate) <= 0n) return false;
    }
    return hasSufficientBalance;
  }, [
    resolvedClientAgentId,
    metadataMode,
    projectTitle,
    customMetadataUri,
    builderHiringMode,
    targetFreelancerId,
    draftMilestones,
    parsedMilestoneAmounts,
    hasSufficientBalance,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Action Handlers                                                          */
  /* ------------------------------------------------------------------------ */

  const isTxBusy = isWritePending || isConfirming;

  async function handleCopy(text: string, id: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr));
      }, 1600);
      showToast("success", "Copied to Clipboard", `${label} copied.`);
    } catch {
      showToast("error", "Clipboard Blocked", "Unable to access clipboard.");
    }
  }

  function scrollToBuilder() {
    builderSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 380);
  }

  function handleAddMilestoneRow() {
    if (draftMilestones.length >= MAX_MILESTONES) return;
    setDraftMilestones((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}-${prev.length + 1}`,
        description: "",
        amount: "500.00",
        dueDate: defaultDueDateOffset(14 * (prev.length + 1)),
      },
    ]);
  }

  function handleRemoveMilestoneRow(id: string) {
    if (draftMilestones.length <= 1) return;
    setDraftMilestones((prev) => prev.filter((row) => row.id !== id));
  }

  function handleUpdateMilestoneRow(
    id: string,
    field: keyof Omit<DraftMilestone, "id">,
    value: string
  ) {
    setDraftMilestones((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    if (builderError) setBuilderError(null);
  }

  function handleApproveStep() {
    setBuilderError(null);
    if (totalLockAmount <= 0n) {
      setBuilderError("Enter valid milestone tUSD8 amounts before approving.");
      return;
    }
    if (!hasSufficientBalance) {
      setBuilderError("Insufficient tUSD8 balance for this upfront escrow lock.");
      return;
    }

    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to QDay Aevum Testnet to approve tUSD8."
        );
        return;
      }
      setLastWriteKind("approve");
      setPendingActionLabel(
        `Approve ${formatTUSD8(totalLockAmount)} tUSD8 for MilestoneEscrow`
      );
      writeContract({
        address: CONTRACT_ADDRESSES.tUSD8,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACT_ADDRESSES.MilestoneEscrow, totalLockAmount],
        chainId: aevumTestnet.id,
      });
      return;
    }

    // Interactive Preview Mode approval
    setMockApprovedAmount(totalLockAmount);
    showToast(
      "success",
      "tUSD8 Allowance Approved",
      `Approved ${formatTUSD8(totalLockAmount)} tUSD8 for MilestoneEscrow. Ready for Step 2.`
    );
  }

  function handleCreateProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBuilderError(null);

    if (!isBuilderFormValid) {
      setBuilderError(
        "Please complete Client Identity, title/URI, and all milestone amounts & due dates."
      );
      return;
    }

    if (!isApprovedForTotal) {
      setBuilderError(
        "Complete Step 1 to approve tUSD8 allowance for MilestoneEscrow first."
      );
      return;
    }

    const targetIdNum =
      builderHiringMode === "DIRECT" ? Number(targetFreelancerId.trim()) : 0;

    const finalMetadataUri =
      metadataMode === "AUTO_JSON"
        ? buildJsonDataUri({
            title: projectTitle.trim(),
            summary:
              projectSummary.trim() ||
              "Milestone-gated tUSD8 escrow project on QDay Aevum.",
            category: "Escrow",
            createdAt: new Date().toISOString(),
          })
        : customMetadataUri.trim();

    const milestoneDueDatesBigInt = draftMilestones.map((m) =>
      dateInputToUnix(m.dueDate)
    );
    const milestoneDescriptionURIs = draftMilestones.map((m) =>
      buildJsonDataUri({ title: m.description.trim() })
    );

    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to lock tUSD8 and create this escrow project."
        );
        return;
      }
      setLastWriteKind("create");
      setPendingActionLabel(
        `Lock ${formatTUSD8(totalLockAmount)} tUSD8 & Create Project`
      );
      writeContract({
        address: CONTRACT_ADDRESSES.ProjectManager,
        abi: PROJECT_MANAGER_ABI,
        functionName: "createProject",
        args: [
          BigInt(resolvedClientAgentId),
          BigInt(targetIdNum),
          finalMetadataUri,
          parsedMilestoneAmounts,
          milestoneDueDatesBigInt,
          milestoneDescriptionURIs,
        ],
        chainId: aevumTestnet.id,
      });
      return;
    }

    // Interactive Preview Mode: create live in local state
    const maxId = mockProjects.reduce(
      (max, item) => Math.max(max, item.projectId),
      105
    );
    const nextProjectId = maxId + 1;
    const clientPassport = userClientPassports.find(
      (p) => p.agentId === resolvedClientAgentId
    );

    const newMilestones: MilestoneRecord[] = draftMilestones.map((m, idx) => ({
      index: idx,
      title: m.description.trim(),
      amount: parsedMilestoneAmounts[idx],
      dueDate: Number(milestoneDueDatesBigInt[idx]),
      submittedAt: 0,
      status: 0,
      deliverableHash: ZERO_HASH,
      descriptionURI: milestoneDescriptionURIs[idx],
      deliverableURI: "",
    }));

    const createdTitle =
      metadataMode === "AUTO_JSON"
        ? projectTitle.trim()
        : `Custom Escrow #TRL-${nextProjectId}`;

    const createdProject: ProjectRecord = {
      projectId: nextProjectId,
      title: createdTitle,
      summary:
        projectSummary.trim() ||
        "100% upfront tUSD8 milestone escrow deployed on QDay Aevum.",
      category: "Escrow",
      clientAgentId: resolvedClientAgentId,
      clientName:
        clientPassport?.displayName ?? `Client #${resolvedClientAgentId}`,
      clientTrustScore: clientPassport?.trustScore ?? 94,
      clientAddress: activeUserAddress ?? MOCK_USER_ADDRESS,
      freelancerAgentId: targetIdNum,
      freelancerName:
        targetIdNum > 0 ? `Agent #${targetIdNum}` : undefined,
      freelancerAddress: zeroAddress,
      isDirectHire: builderHiringMode === "DIRECT",
      status: 0,
      totalBudget: totalLockAmount,
      settledCount: 0,
      createdAt: Math.floor(Date.now() / 1000),
      metadataURI: finalMetadataUri,
      milestones: newMilestones,
    };

    setMockProjects((prev) => [createdProject, ...prev]);
    setMockBalance((prev) =>
      prev >= totalLockAmount ? prev - totalLockAmount : 0n
    );
    setMockApprovedAmount(0n);
    setProjectTitle("");
    setProjectSummary("");
    setCustomMetadataUri("");
    setTargetFreelancerId("");

    showToast(
      "success",
      `Created Escrow #TRL-${nextProjectId}`,
      `Locked ${formatTUSD8(totalLockAmount)} tUSD8 across ${newMilestones.length} milestone${newMilestones.length > 1 ? "s" : ""}.`
    );
  }

  function handleConfirmAccept(projectId: number, freelancerAgentId: number) {
    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to accept this escrow project."
        );
        return;
      }
      setLastWriteKind("accept");
      setPendingActionLabel(
        `Accept #TRL-${projectId} as Agent #${freelancerAgentId}`
      );
      writeContract({
        address: CONTRACT_ADDRESSES.ProjectManager,
        abi: PROJECT_MANAGER_ABI,
        functionName: "acceptProject",
        args: [BigInt(projectId), BigInt(freelancerAgentId)],
        chainId: aevumTestnet.id,
      });
      return;
    }

    const freelancerPassport = userFreelancerPassports.find(
      (p) => p.agentId === freelancerAgentId
    );
    setMockProjects((prev) =>
      prev.map((item) =>
        item.projectId === projectId
          ? {
              ...item,
              status: 1,
              freelancerAgentId,
              freelancerName:
                freelancerPassport?.displayName ?? `Agent #${freelancerAgentId}`,
              freelancerAddress: activeUserAddress ?? MOCK_USER_ADDRESS,
            }
          : item
      )
    );
    setAcceptTarget(null);
    showToast(
      "success",
      `Accepted Project #TRL-${projectId}`,
      `Assigned Freelancer Passport #${freelancerAgentId}. Milestone delivery is now active.`
    );
  }

  function handleConfirmCancel(projectId: number) {
    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to cancel and refund this project."
        );
        return;
      }
      setLastWriteKind("cancel");
      setPendingActionLabel(`Cancel & Refund #TRL-${projectId}`);
      writeContract({
        address: CONTRACT_ADDRESSES.ProjectManager,
        abi: PROJECT_MANAGER_ABI,
        functionName: "cancelProject",
        args: [BigInt(projectId)],
        chainId: aevumTestnet.id,
      });
      return;
    }

    const target = mockProjects.find((p) => p.projectId === projectId);
    setMockProjects((prev) =>
      prev.map((item) =>
        item.projectId === projectId ? { ...item, status: 3 } : item
      )
    );
    if (target) {
      setMockBalance((prev) => prev + target.totalBudget);
    }
    setCancelTarget(null);
    showToast(
      "success",
      `Cancelled #TRL-${projectId} • 100% Refunded`,
      target
        ? `Returned ${formatTUSD8(target.totalBudget)} tUSD8 to your wallet with 0% protocol fee.`
        : "Escrow vault refunded with 0% fee."
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Cursor-Tracking Copper & Ice Radial Spotlight                            */
  /* ------------------------------------------------------------------------ */

  const headerMouseX = useMotionValue(340);
  const headerMouseY = useMotionValue(90);
  const headerSpotlight = useMotionTemplate`radial-gradient(460px circle at ${headerMouseX}px ${headerMouseY}px, rgba(234, 122, 61, 0.14), rgba(56, 189, 248, 0.08) 42%, transparent 72%)`;

  function handleHeaderMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    headerMouseX.set(event.clientX - rect.left);
    headerMouseY.set(event.clientY - rect.top);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 pt-6 pb-14 sm:px-6 lg:px-8">
      {/* 1. Compact Header Banner */}
      <motion.section
        onMouseMove={handleHeaderMouseMove}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface/95 p-6 sm:p-7"
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: headerSpotlight }}
        />

        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-ice/30 bg-ice/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ice-400">
              <Lock className="h-3 w-3" />
              MILESTONE ESCROW PROTOCOL • 100% UPFRONT tUSD8 LOCK
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
              Escrow{" "}
              <span className="text-copper">Projects Marketplace</span>
            </h1>
            <p className="text-sm leading-relaxed text-slate-400">
              Browse 100% upfront-funded tUSD8 milestone vaults, accept open or
              direct-hire contracts with your ERC-8004 passport, or deploy a new
              multi-milestone escrow in two deterministic steps.
            </p>
          </div>

          {/* Right Cluster: CTA + Contract Chip + TVL Badge */}
          <div className="flex flex-col items-start gap-2.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={scrollToBuilder}
                className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2.5 text-xs font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.28)] transition-all hover:bg-copper-600"
              >
                <Plus className="h-4 w-4" />
                Create Escrow Project
              </button>

              <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-canvas/85 px-3.5 py-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Escrow TVL
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-teal-400">
                  <AnimatedNumber
                    value={escrowTvlNumber}
                    prefix="$"
                    decimals={2}
                  />
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <button
                type="button"
                onClick={() =>
                  void handleCopy(
                    CONTRACT_ADDRESSES.ProjectManager,
                    "pm-addr",
                    "ProjectManager address"
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated/80 px-2.5 py-1 text-slate-300 transition-colors hover:border-copper/40 hover:text-copper-400"
              >
                <span className="text-slate-500">ProjectManager</span>
                <span>{shortenAddress(CONTRACT_ADDRESSES.ProjectManager)}</span>
                {copiedId === "pm-addr" ? (
                  <Check className="h-3 w-3 text-teal-400" />
                ) : (
                  <Copy className="h-3 w-3 text-slate-500" />
                )}
              </button>

              <a
                href={explorerAddressUrl(CONTRACT_ADDRESSES.ProjectManager)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-elevated/80 px-2.5 py-1 text-slate-300 transition-colors hover:border-ice/40 hover:text-ice-400"
              >
                Explorer
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Filter & Search Control Bar */}
      <section className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface/90 p-3.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1">
          {STATUS_FILTERS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`relative rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "text-slate-50"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="projects-status-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-xl border border-copper/35 bg-copper/15"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search + Hiring Mode Toggle */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, #TRL ID, or client address..."
              className="w-full rounded-xl border border-hairline bg-canvas py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-copper/50 focus:outline-none focus:ring-1 focus:ring-copper/30"
            />
          </div>

          <div className="inline-flex rounded-xl border border-hairline bg-canvas p-1">
            {HIRING_MODE_FILTERS.map((mode) => {
              const active = hiringModeFilter === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setHiringModeFilter(mode.id)}
                  className={`relative rounded-lg px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                    active
                      ? "text-ice-400"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="projects-mode-pill"
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                      className="absolute inset-0 rounded-lg border border-ice/35 bg-ice/15"
                    />
                  )}
                  <span className="relative z-10">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Two-Column Main Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* LEFT (7 cols): Marketplace Project Cards */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-200">
                {filteredProjects.length}
              </span>{" "}
              Escrow Vault{filteredProjects.length === 1 ? "" : "s"}
            </span>
            {!IS_PROTOCOL_DEPLOYED && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] text-amber-300">
                <Sparkles className="h-3 w-3" />
                Interactive Preview Mode
              </span>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {filteredProjects.length === 0 ? (
              <motion.div
                key="empty-state"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-14 text-center"
              >
                <Layers className="h-8 w-8 text-slate-600" />
                <h3 className="mt-3 font-display text-sm font-semibold text-slate-200">
                  No Escrow Projects Match Your Filter
                </h3>
                <p className="mt-1 max-w-sm text-xs text-slate-400">
                  Try switching status tabs, clearing your search query, or
                  deploying a new milestone vault on the right.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setHiringModeFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="mt-4 rounded-xl border border-hairline bg-elevated px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
                >
                  Reset Filters
                </button>
              </motion.div>
            ) : (
              filteredProjects.map((project) => {
                const disputed = hasDisputedMilestone(project);
                const clientOwned = isClientOfProject(project);

                const statusPill =
                  project.status === 3
                    ? {
                        label: "CANCELLED",
                        cls: "border-slate-600/40 bg-slate-800/80 text-slate-400",
                      }
                    : project.status === 2
                    ? {
                        label: "COMPLETED",
                        cls: "border-teal-500/35 bg-teal-500/10 text-teal-400",
                      }
                    : disputed
                    ? {
                        label: "DISPUTED",
                        cls: "border-rose-500/40 bg-rose-500/15 text-rose-400",
                      }
                    : project.status === 1
                    ? {
                        label: "ACTIVE",
                        cls: "border-copper/40 bg-copper/15 text-copper-400",
                      }
                    : {
                        label: "OPEN",
                        cls: "border-amber-500/35 bg-amber-500/10 text-amber-400",
                      };

                const hiringBadge = disputed
                  ? {
                      label: "AI ARBITER PANEL ACTIVE",
                      cls: "border-rose-500/30 bg-rose-500/10 text-rose-300",
                    }
                  : clientOwned && project.status === 0
                  ? {
                      label: "YOUR PROJECT",
                      cls: "border-ice/35 bg-ice/10 text-ice-400",
                    }
                  : project.isDirectHire && project.freelancerAgentId > 0
                  ? {
                      label: `DIRECT HIRE • Agent #${project.freelancerAgentId}`,
                      cls: "border-ice/30 bg-ice/10 text-ice-300",
                    }
                  : {
                      label: "OPEN MARKETPLACE",
                      cls: "border-hairline bg-elevated text-slate-300",
                    };

                return (
                  <motion.article
                    key={project.projectId}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    className={`group rounded-2xl border bg-surface/95 p-5 transition-colors ${
                      disputed
                        ? "border-rose-500/35 hover:border-rose-500/55"
                        : "border-hairline hover:border-copper/35"
                    }`}
                  >
                    {/* Card Top Metadata Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-300">
                          #TRL-{project.projectId}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${statusPill.cls}`}
                        >
                          {statusPill.label}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium ${hiringBadge.cls}`}
                        >
                          {hiringBadge.label}
                        </span>
                      </div>

                      {disputed ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-400">
                          <Scale className="h-3 w-3" />
                          2-OF-3 QUORUM
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-400">
                          <ShieldCheck className="h-3 w-3" />
                          100% FUNDED
                        </span>
                      )}
                    </div>

                    {/* Title & 1-Line Summary */}
                    <div className="mt-3">
                      <Link
                        href={`/projects/${project.projectId}`}
                        className="font-display text-lg font-semibold text-slate-50 transition-colors group-hover:text-copper-400"
                      >
                        {project.title}
                      </Link>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                        {project.summary}
                      </p>
                    </div>

                    {/* Elevated #171D2B Financial Strip */}
                    <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-hairline bg-elevated/90 p-3.5 sm:grid-cols-3">
                      <div>
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Locked Budget
                        </span>
                        <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-50">
                          {formatTUSD8(project.totalBudget)}{" "}
                          <span className="text-[11px] font-normal text-slate-400">
                            tUSD8
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Milestones / Settlement
                        </span>
                        <div className="mt-0.5 font-mono text-xs font-medium text-slate-200">
                          {getSettlementSummary(project)}
                        </div>
                      </div>

                      <div>
                        <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Next Milestone Due
                        </span>
                        <div className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-xs font-medium text-slate-200">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          {getNextMilestoneDue(project)}
                        </div>
                      </div>
                    </div>

                    {/* Animated Segmented Milestone Progress Bar */}
                    <div className="mt-3.5">
                      <div className="flex items-center gap-1.5">
                        {project.milestones.map((m) => {
                          let barColor = "bg-slate-700/80";
                          if (project.status === 2) {
                            barColor = "bg-teal-400";
                          } else if (m.status === 2 || m.status === 4) {
                            barColor = "bg-copper";
                          } else if (m.status === 1) {
                            barColor = "bg-amber-400";
                          } else if (m.status === 3) {
                            barColor = "bg-rose-500";
                          } else if (m.status === 5) {
                            barColor = "bg-slate-500";
                          }

                          return (
                            <motion.div
                              key={m.index}
                              title={`M${m.index + 1}: ${m.title} (${formatTUSD8(m.amount)})`}
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              transition={{
                                duration: 0.45,
                                delay: m.index * 0.05,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className={`h-2 flex-1 origin-left rounded-full ${barColor}`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer: Passport Badges & Contextual Actions */}
                    <div className="mt-4 flex flex-col justify-between gap-3 border-t border-hairline pt-3.5 sm:flex-row sm:items-center">
                      {/* Left: Client / Freelancer Passports */}
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2.5 py-1 text-slate-300">
                          <Briefcase className="h-3 w-3 text-copper-400" />
                          Client #{project.clientAgentId}
                          <span className="text-amber-400">
                            ★ {project.clientTrustScore}/100
                          </span>
                        </span>

                        {project.freelancerAgentId > 0 && (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2.5 py-1 text-slate-300">
                            <Code2 className="h-3 w-3 text-ice-400" />
                            Freelancer #{project.freelancerAgentId}
                          </span>
                        )}
                      </div>

                      {/* Right: Contextual Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {project.status === 0 && !clientOwned && (
                          <>
                            <Link
                              href={`/projects/${project.projectId}`}
                              className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
                            >
                              View Workspace
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setAcceptTarget(project)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-copper px-3.5 py-1.5 text-xs font-semibold text-canvas shadow-[0_0_18px_rgba(234,122,61,0.22)] transition-colors hover:bg-copper-600"
                            >
                              Accept Project
                            </button>
                          </>
                        )}

                        {project.status === 0 && clientOwned && (
                          <>
                            <Link
                              href={`/projects/${project.projectId}`}
                              className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
                            >
                              View Workspace
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setCancelTarget(project)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Cancel &amp; Refund 100% (0% fee)
                            </button>
                          </>
                        )}

                        {project.status === 1 && !disputed && (
                          <Link
                            href={`/projects/${project.projectId}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-copper/35 bg-copper/10 px-3.5 py-1.5 text-xs font-semibold text-copper-400 transition-colors hover:bg-copper/20"
                          >
                            Manage Milestones
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}

                        {disputed && (
                          <>
                            <Link
                              href="/disputes"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
                            >
                              <Bot className="h-3.5 w-3.5" />
                              View Dispute
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                              href={`/projects/${project.projectId}`}
                              className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
                            >
                              Workspace
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </>
                        )}

                        {project.status === 2 && (
                          <Link
                            href={`/projects/${project.projectId}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/35 bg-teal-500/10 px-3.5 py-1.5 text-xs font-semibold text-teal-400 transition-colors hover:bg-teal-500/20"
                          >
                            View Receipts
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}

                        {project.status === 3 && (
                          <Link
                            href={`/projects/${project.projectId}`}
                            className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-elevated px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200"
                          >
                            View Archive
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT (5 cols): Sticky "Create Escrow Project" Builder Card */}
        <div
          ref={builderSectionRef}
          className="lg:sticky lg:top-20 lg:col-span-5"
        >
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface/95 shadow-xl">
            {/* Subtle Copper Top Accent Bar */}
            <div className="h-1 w-full bg-gradient-to-r from-copper/20 via-copper to-copper/20" />

            <div className="p-5 sm:p-6">
              {/* Builder Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-50">
                    Create Escrow Project
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Lock staged milestone payouts upfront in MilestoneEscrow.
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-copper/35 bg-copper/10 px-2 py-1 font-mono text-[10px] font-semibold text-copper-400">
                  <Lock className="h-3 w-3" />
                  Upfront tUSD8 Lock
                </span>
              </div>

              <form
                onSubmit={handleCreateProjectSubmit}
                className="mt-5 space-y-4"
              >
                {/* Client Identity Selector */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="builder-client-select"
                      className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
                    >
                      Client Identity (ERC-8004)
                    </label>
                    <Link
                      href="/identity"
                      className="font-mono text-[10px] text-ice-400 hover:underline"
                    >
                      Mint Passport -&gt;
                    </Link>
                  </div>

                  {userClientPassports.length > 0 ? (
                    <select
                      id="builder-client-select"
                      value={selectedClientAgentId}
                      onChange={(e) => setSelectedClientAgentId(e.target.value)}
                      className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-slate-100 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                    >
                      {userClientPassports.map((p) => (
                        <option key={p.agentId} value={String(p.agentId)}>
                          #{p.agentId} — {p.displayName} (★ {p.trustScore}/100)
                        </option>
                      ))}
                      <option value="manual">
                        Enter Client Agent ID manually...
                      </option>
                    </select>
                  ) : (
                    <input
                      id="builder-client-select"
                      type="number"
                      min={1}
                      step={1}
                      value={manualClientAgentId}
                      onChange={(e) => setManualClientAgentId(e.target.value)}
                      placeholder="Client ERC-8004 Agent ID (e.g. 1)"
                      className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                    />
                  )}

                  {userClientPassports.length > 0 &&
                    selectedClientAgentId === "manual" && (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={manualClientAgentId}
                        onChange={(e) => setManualClientAgentId(e.target.value)}
                        placeholder="Client ERC-8004 Agent ID"
                        className="mt-2 w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                      />
                    )}
                </div>

                {/* Hiring Mode Toggle */}
                <div>
                  <span className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
                    Hiring Mode
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-hairline bg-canvas p-1">
                    {(
                      [
                        { id: "OPEN", label: "Open Marketplace" },
                        { id: "DIRECT", label: "Direct Hire (Agent ID)" },
                      ] as const
                    ).map((option) => {
                      const active = builderHiringMode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setBuilderHiringMode(option.id)}
                          className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "text-slate-50"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="builder-hiring-pill"
                              transition={{
                                type: "spring",
                                stiffness: 420,
                                damping: 32,
                              }}
                              className="absolute inset-0 rounded-lg border border-copper/40 bg-copper/15"
                            />
                          )}
                          <span className="relative z-10">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false}>
                    {builderHiringMode === "DIRECT" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-2.5">
                          <label
                            htmlFor="target-freelancer-id"
                            className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ice-400"
                          >
                            Target Freelancer Agent ID
                          </label>
                          <input
                            id="target-freelancer-id"
                            type="number"
                            min={1}
                            step={1}
                            value={targetFreelancerId}
                            onChange={(e) => {
                              setTargetFreelancerId(e.target.value);
                              if (builderError) setBuilderError(null);
                            }}
                            placeholder="e.g. 2"
                            className="w-full rounded-xl border border-ice/35 bg-canvas px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/35"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Metadata Storage Toggle + Title & Summary */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
                      Project Brief
                    </span>
                    <div className="inline-flex rounded-lg border border-hairline bg-canvas p-0.5 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() => setMetadataMode("AUTO_JSON")}
                        className={`rounded-md px-2 py-0.5 transition-colors ${
                          metadataMode === "AUTO_JSON"
                            ? "bg-elevated text-copper-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Auto-Build JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetadataMode("CUSTOM_URI")}
                        className={`rounded-md px-2 py-0.5 transition-colors ${
                          metadataMode === "CUSTOM_URI"
                            ? "bg-elevated text-ice-400"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Custom IPFS/HTTPS
                      </button>
                    </div>
                  </div>

                  {metadataMode === "AUTO_JSON" ? (
                    <>
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={projectTitle}
                        onChange={(e) => {
                          setProjectTitle(e.target.value);
                          if (builderError) setBuilderError(null);
                        }}
                        placeholder="Project title (e.g. Dilithium-3 Bridge Relayer)"
                        className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                      />
                      <textarea
                        rows={2}
                        value={projectSummary}
                        onChange={(e) => setProjectSummary(e.target.value)}
                        placeholder="Concise scope & acceptance criteria..."
                        className="w-full resize-none rounded-xl border border-hairline bg-canvas px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                      />
                    </>
                  ) : (
                    <div className="relative">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={customMetadataUri}
                        onChange={(e) => {
                          setCustomMetadataUri(e.target.value);
                          if (builderError) setBuilderError(null);
                        }}
                        placeholder="ipfs://bafybeig... or https://..."
                        className="w-full rounded-xl border border-hairline bg-canvas py-2 pl-8 pr-3 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/35"
                      />
                    </div>
                  )}
                </div>

                {/* Staged Milestones Builder */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
                      Staged Milestones ({draftMilestones.length}/
                      {MAX_MILESTONES})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddMilestoneRow}
                      disabled={draftMilestones.length >= MAX_MILESTONES}
                      className="inline-flex items-center gap-1 rounded-lg border border-copper/35 bg-copper/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-copper-400 transition-colors hover:bg-copper/20 disabled:opacity-40"
                    >
                      <Plus className="h-3 w-3" />
                      Add Milestone
                    </button>
                  </div>

                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {draftMilestones.map((row, idx) => (
                        <motion.div
                          key={row.id}
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="rounded-xl border border-hairline bg-elevated/55 p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-canvas font-mono text-[10px] font-semibold text-copper-400">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={row.description}
                              onChange={(e) =>
                                handleUpdateMilestoneRow(
                                  row.id,
                                  "description",
                                  e.target.value
                                )
                              }
                              placeholder="Milestone description"
                              className="min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none"
                            />
                            {draftMilestones.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMilestoneRow(row.id)}
                                aria-label={`Remove milestone ${idx + 1}`}
                                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.amount}
                                onChange={(e) =>
                                  handleUpdateMilestoneRow(
                                    row.id,
                                    "amount",
                                    e.target.value
                                  )
                                }
                                placeholder="0.00"
                                className="w-full rounded-lg border border-hairline bg-canvas py-1.5 pl-2.5 pr-12 font-mono text-xs tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-500">
                                tUSD8
                              </span>
                            </div>

                            <input
                              type="date"
                              value={row.dueDate}
                              onChange={(e) =>
                                handleUpdateMilestoneRow(
                                  row.id,
                                  "dueDate",
                                  e.target.value
                                )
                              }
                              className="w-full rounded-lg border border-hairline bg-canvas px-2.5 py-1.5 font-mono text-xs text-slate-200 focus:border-copper/60 focus:outline-none"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Live Escrow Summary Box (#080A0F border #1E2536) */}
                <div className="space-y-2 rounded-xl border border-hairline bg-canvas p-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Total Upfront Lock:</span>
                    <span className="font-mono text-sm font-bold tabular-nums text-slate-50">
                      {formatTUSD8(totalLockAmount)}{" "}
                      <span className="text-[11px] font-normal text-slate-400">
                        tUSD8
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400">
                      Protocol Fee (snapshotted):
                    </span>
                    <span className="text-right font-mono text-slate-300">
                      {feePercentLabel}% on release (
                      {formatTUSD8(maxProtocolFee, false)} tUSD8 max) • 0% on
                      refunds
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-hairline pt-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-slate-400">
                      <Wallet className="h-3.5 w-3.5 text-slate-500" />
                      Your tUSD8 Balance:
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="tabular-nums text-slate-200">
                        {formatTUSD8(userBalance, false)} tUSD8
                      </span>
                      {totalLockAmount > 0n &&
                        (hasSufficientBalance ? (
                          <span className="rounded border border-teal-500/35 bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-400">
                            Sufficient
                          </span>
                        ) : (
                          <span className="rounded border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
                            Insufficient
                          </span>
                        ))}
                    </div>
                  </div>
                </div>

                {builderError && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{builderError}</span>
                  </div>
                )}

                {/* Two-Step On-Chain Action Stepper */}
                <div className="space-y-2.5 pt-1">
                  {/* Step 1: Approve */}
                  <button
                    type="button"
                    onClick={handleApproveStep}
                    disabled={
                      isTxBusy ||
                      totalLockAmount <= 0n ||
                      !hasSufficientBalance ||
                      isApprovedForTotal
                    }
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
                      isApprovedForTotal
                        ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                        : "border-ice/40 bg-ice/10 text-ice-300 hover:bg-ice/20 disabled:cursor-not-allowed disabled:opacity-50"
                    }`}
                  >
                    {isTxBusy && lastWriteKind === "approve" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Approving tUSD8 Allowance...
                      </>
                    ) : isApprovedForTotal ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-teal-400" />
                        1. Approved {formatTUSD8(totalLockAmount)} tUSD8 for
                        MilestoneEscrow
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        1. Approve {formatTUSD8(totalLockAmount)} tUSD8 for
                        MilestoneEscrow
                      </>
                    )}
                  </button>

                  {/* Step 2: Lock & Create */}
                  <button
                    type="submit"
                    disabled={
                      isTxBusy || !isApprovedForTotal || !isBuilderFormValid
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-copper px-4 py-2.5 text-xs font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.24)] transition-all hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                  >
                    {isTxBusy && lastWriteKind === "create" ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Locking tUSD8 &amp; Creating Vault...
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        2. Lock tUSD8 &amp; Create Project
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Action Modals */}
      <AcceptProjectModal
        project={acceptTarget}
        freelancerPassports={userFreelancerPassports}
        isOpen={acceptTarget !== null}
        isSubmitting={isTxBusy && lastWriteKind === "accept"}
        onClose={() => setAcceptTarget(null)}
        onConfirm={handleConfirmAccept}
      />

      <CancelProjectModal
        project={cancelTarget}
        isOpen={cancelTarget !== null}
        isSubmitting={isTxBusy && lastWriteKind === "cancel"}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />

      {/* Bottom-Right Animated Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm overflow-hidden rounded-2xl border border-hairline bg-surface/95 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                  toast.tone === "success"
                    ? "border-teal-500/35 bg-teal-500/15 text-teal-400"
                    : toast.tone === "error"
                    ? "border-rose-500/35 bg-rose-500/15 text-rose-400"
                    : "border-ice/35 bg-ice/15 text-ice-400"
                }`}
              >
                {toast.tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : toast.tone === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-display text-xs font-semibold text-slate-50">
                  {toast.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                  {toast.description}
                </p>
                {toast.txHash && (
                  <a
                    href={explorerTxUrl(toast.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-ice-400 hover:underline"
                  >
                    View on Aevum Explorer
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                )}
              </div>

              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="Dismiss notification"
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-elevated hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
