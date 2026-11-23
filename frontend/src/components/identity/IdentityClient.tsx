"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue } from "framer-motion";
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  Briefcase,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Eye,
  Fingerprint,
  Link2,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import { stringToHex, type Address } from "viem";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import {
  SetMetadataModal,
  UpdateUriModal,
  ViewAgentCardModal,
} from "@/components/identity/IdentityModals";
import {
  AGENT_ROLE_LABELS,
  ERC8004_REGISTRATION_TYPE,
  buildAgentCardDataUri,
  formatPassportDate,
  getUtf8ByteLength,
  parseAgentCardUri,
  roleMonogram,
  toAgentRoleId,
  type AgentCardPayload,
  type AgentRoleId,
} from "@/lib/agentCard";
import { aevumTestnet } from "@/lib/chains";
import {
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
} from "@/lib/contracts/abis";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
} from "@/lib/contracts/addresses";
import { explorerAddressUrl, explorerTxUrl, shortenAddress } from "@/lib/format";
import {
  MOCK_EXTERNAL_ARBITERS,
  MOCK_USER_ADDRESS,
  MOCK_USER_PASSPORTS,
  type PassportRecord,
} from "@/lib/mockIdentityData";

type RoleFilter = "ALL" | AgentRoleId;
type UriStorageMode = "AUTO_JSON" | "CUSTOM_URI";

interface ToastState {
  id: number;
  tone: "pending" | "success" | "error";
  title: string;
  description: string;
  txHash?: `0x${string}`;
}

const ROLE_OPTIONS: readonly {
  id: AgentRoleId;
  label: string;
  shortDesc: string;
  accent: "copper" | "amber" | "ice";
}[] = [
  {
    id: 0,
    label: "Client",
    shortDesc: "Fund tUSD8 milestones",
    accent: "copper",
  },
  {
    id: 1,
    label: "Freelancer",
    shortDesc: "Claim & deliver work",
    accent: "amber",
  },
  {
    id: 2,
    label: "AI Arbiter",
    shortDesc: "2-of-3 dispute voting",
    accent: "ice",
  },
];

const FILTER_OPTIONS: readonly { id: RoleFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: 0, label: "Client" },
  { id: 1, label: "Freelancer" },
  { id: 2, label: "Arbiter" },
];

const MAX_MULTICALL_AGENTS = 50;

function RoleIcon({
  role,
  className = "h-4 w-4",
}: {
  role: AgentRoleId;
  className?: string;
}) {
  if (role === 0) return <Briefcase className={className} />;
  if (role === 1) return <Code2 className={className} />;
  return <Bot className={className} />;
}

export function IdentityClient() {
  const { address: connectedAddress, isConnected } = useAccount();

  // Local interactive Preview Mode state
  const [mockUserPassports, setMockUserPassports] = useState<PassportRecord[]>(
    MOCK_USER_PASSPORTS
  );
  const [mockExternalArbiters] = useState<PassportRecord[]>(
    MOCK_EXTERNAL_ARBITERS
  );

  // Minting Studio form state
  const [selectedRole, setSelectedRole] = useState<AgentRoleId>(2);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [serviceEndpoint, setServiceEndpoint] = useState("");
  const [uriMode, setUriMode] = useState<UriStorageMode>("AUTO_JSON");
  const [customUri, setCustomUri] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Vault filter + clipboard + modals + toast
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [updateUriTarget, setUpdateUriTarget] = useState<PassportRecord | null>(
    null
  );
  const [metadataTarget, setMetadataTarget] = useState<PassportRecord | null>(
    null
  );
  const [inspectTarget, setInspectTarget] = useState<PassportRecord | null>(
    null
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(
    null
  );

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

  const {
    data: liveTotalAgentsRaw,
    refetch: refetchTotalAgents,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.IdentityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "totalAgents",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const {
    data: liveActiveArbiterIdsRaw,
    refetch: refetchActiveArbiters,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.IdentityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getActiveArbiters",
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

  const identityContracts = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || liveAgentIds.length === 0) {
      return [];
    }
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

  const reputationContracts = useMemo(() => {
    if (!IS_PROTOCOL_DEPLOYED || liveAgentIds.length === 0) {
      return [];
    }
    return liveAgentIds.map((id) => ({
      address: CONTRACT_ADDRESSES.ReputationRegistry,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: "getSummary" as const,
      args: [BigInt(id)] as const,
      chainId: aevumTestnet.id,
    }));
  }, [liveAgentIds]);

  const { data: identityResults, refetch: refetchIdentityMulticall } =
    useReadContracts({
      contracts: identityContracts,
      query: {
        enabled: IS_PROTOCOL_DEPLOYED && identityContracts.length > 0,
      },
    });

  const { data: reputationResults, refetch: refetchReputationMulticall } =
    useReadContracts({
      contracts: reputationContracts,
      query: {
        enabled: IS_PROTOCOL_DEPLOYED && reputationContracts.length > 0,
      },
    });

  const livePassports = useMemo<PassportRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED || !identityResults || liveAgentIds.length === 0) {
      return [];
    }

    const parsed: PassportRecord[] = [];
    for (let i = 0; i < liveAgentIds.length; i += 1) {
      const agentId = liveAgentIds[i];
      const baseIndex = i * 3;
      const ownerItem = identityResults[baseIndex];
      const infoItem = identityResults[baseIndex + 1];
      const uriItem = identityResults[baseIndex + 2];
      const repItem = reputationResults?.[i];

      if (
        ownerItem?.status !== "success" ||
        infoItem?.status !== "success"
      ) {
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

      let reviewCount = 0;
      let trustScore = 0;
      if (repItem?.status === "success" && Array.isArray(repItem.result)) {
        const [countRaw, avgRaw] = repItem.result as readonly [bigint, number];
        reviewCount = Number(countRaw);
        trustScore = Number(avgRaw);
      }

      const role = toAgentRoleId(Number(info.role));
      const decoded = parseAgentCardUri(agentURI);
      const endpoint = decoded?.services[0]?.endpoint ?? "";
      const roleLabel = AGENT_ROLE_LABELS[role];
      const reviewLabel =
        role === 2
          ? `${reviewCount} disputes resolved`
          : role === 1
          ? `${reviewCount} milestones`
          : `${reviewCount} reviews`;

      parsed.push({
        agentId,
        owner,
        role,
        active: Boolean(info.active),
        registeredAt: Number(info.registeredAt),
        agentURI,
        displayName: decoded?.name ?? `${roleLabel} Passport #${agentId}`,
        subtitle: decoded?.description
          ? decoded.description.slice(0, 56)
          : `${roleLabel} ERC-8004 Identity`,
        description:
          decoded?.description ??
          `On-chain ERC-8004 ${roleLabel} identity registered on QDay Aevum.`,
        endpoint,
        trustScore,
        reviewCount,
        reviewLabel,
        tags: decoded?.services.map((s) => s.name) ?? [roleLabel],
        metadata: {},
      });
    }

    return parsed;
  }, [liveAgentIds, identityResults, reputationResults]);

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
      `${pendingActionLabel ?? "ERC-8004 update"} finalized on QDay Aevum.`,
      txHash
    );
    setUpdateUriTarget(null);
    setMetadataTarget(null);
    void refetchTotalAgents();
    void refetchActiveArbiters();
    void refetchIdentityMulticall();
    void refetchReputationMulticall();
    resetWrite();
  }, [
    isConfirmed,
    txHash,
    pendingActionLabel,
    refetchTotalAgents,
    refetchActiveArbiters,
    refetchIdentityMulticall,
    refetchReputationMulticall,
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

  const activeOwnerAddress: Address | undefined = IS_PROTOCOL_DEPLOYED
    ? connectedAddress
    : connectedAddress ?? MOCK_USER_ADDRESS;

  const userPassports = useMemo<PassportRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      return mockUserPassports;
    }
    if (!connectedAddress) return [];
    const lower = connectedAddress.toLowerCase();
    return livePassports.filter((p) => p.owner.toLowerCase() === lower);
  }, [connectedAddress, livePassports, mockUserPassports]);

  const activeArbiterPool = useMemo<PassportRecord[]>(() => {
    if (!IS_PROTOCOL_DEPLOYED) {
      const ownActiveArbiters = mockUserPassports.filter(
        (p) => p.role === 2 && p.active
      );
      return [...mockExternalArbiters, ...ownActiveArbiters].sort(
        (a, b) => a.agentId - b.agentId
      );
    }

    const activeIdSet = new Set<number>(
      Array.isArray(liveActiveArbiterIdsRaw)
        ? (liveActiveArbiterIdsRaw as readonly bigint[]).map((id) => Number(id))
        : []
    );
    return livePassports.filter(
      (p) => p.role === 2 && (activeIdSet.size > 0 ? activeIdSet.has(p.agentId) : p.active)
    );
  }, [liveActiveArbiterIdsRaw, livePassports, mockExternalArbiters, mockUserPassports]);

  const totalIdentitiesCount = IS_PROTOCOL_DEPLOYED
    ? typeof liveTotalAgentsRaw === "bigint"
      ? Number(liveTotalAgentsRaw)
      : livePassports.length
    : mockUserPassports.length + mockExternalArbiters.length;

  const filteredUserPassports = useMemo(() => {
    if (roleFilter === "ALL") return userPassports;
    return userPassports.filter((p) => p.role === roleFilter);
  }, [roleFilter, userPassports]);

  /* ------------------------------------------------------------------------ */
  /* Live ERC-8004 JSON Preview for Minting Studio                            */
  /* ------------------------------------------------------------------------ */

  const previewPayload = useMemo<AgentCardPayload>(() => {
    const roleLabel = AGENT_ROLE_LABELS[selectedRole];
    const defaultName =
      selectedRole === 0
        ? "Acme Protocol Treasury"
        : selectedRole === 1
        ? "0xLaizer Security Audits"
        : "Sentinel-8 Arbiter Node";
    const defaultDesc =
      selectedRole === 0
        ? "Protocol treasury funding quantum-safe milestone escrows in tUSD8."
        : selectedRole === 1
        ? "Solidity & post-quantum smart contract engineer delivering audited milestones."
        : "Autonomous Solidity & DeFi dispute reviewer with Dilithium-3 attestations.";
    const defaultEndpoint =
      selectedRole === 2
        ? "https://arbiter.trellis.ai/mcp"
        : "https://agent.trellis.ai/a2a";

    const endpointClean = serviceEndpoint.trim() || defaultEndpoint;

    return {
      type: ERC8004_REGISTRATION_TYPE,
      name: displayName.trim() || defaultName,
      description: bio.trim() || defaultDesc,
      role: roleLabel,
      services: [
        {
          name: selectedRole === 2 ? "MCP" : "A2A",
          endpoint: endpointClean,
        },
      ],
      wallet: activeOwnerAddress,
    };
  }, [selectedRole, displayName, bio, serviceEndpoint, activeOwnerAddress]);

  const previewJsonString = useMemo(
    () => JSON.stringify(previewPayload, null, 2),
    [previewPayload]
  );

  const previewByteSize = useMemo(
    () => getUtf8ByteLength(previewJsonString),
    [previewJsonString]
  );

  /* ------------------------------------------------------------------------ */
  /* Handlers (Contract Calls + Interactive Preview Mode)                     */
  /* ------------------------------------------------------------------------ */

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

  function handleMintSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (uriMode === "AUTO_JSON" && !displayName.trim()) {
      setFormError("Please enter an Agent / Display Name before minting.");
      return;
    }

    if (uriMode === "CUSTOM_URI" && !customUri.trim()) {
      setFormError("Please provide a valid IPFS or HTTPS Agent Card URI.");
      return;
    }

    const finalUri =
      uriMode === "AUTO_JSON"
        ? buildAgentCardDataUri(previewPayload)
        : customUri.trim();

    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to QDay Aevum Testnet to mint an ERC-8004 passport."
        );
        return;
      }
      setPendingActionLabel(
        `Mint ${AGENT_ROLE_LABELS[selectedRole]} Identity NFT`
      );
      writeContract({
        address: CONTRACT_ADDRESSES.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "register",
        args: [finalUri, selectedRole],
        chainId: aevumTestnet.id,
      });
      return;
    }

    // Preview Mode: mint directly into local state
    const existingIds = [
      ...mockUserPassports.map((p) => p.agentId),
      ...mockExternalArbiters.map((p) => p.agentId),
    ];
    const nextId = (existingIds.length > 0 ? Math.max(...existingIds) : 0) + 1;
    const roleLabel = AGENT_ROLE_LABELS[selectedRole];
    const nameClean =
      displayName.trim() || `${roleLabel} Passport #${nextId}`;
    const descClean =
      bio.trim() || previewPayload.description;
    const endpointClean =
      serviceEndpoint.trim() || previewPayload.services[0]?.endpoint || "";

    const newPassport: PassportRecord = {
      agentId: nextId,
      owner: activeOwnerAddress ?? MOCK_USER_ADDRESS,
      role: selectedRole,
      active: true,
      registeredAt: Math.floor(Date.now() / 1000),
      agentURI: finalUri,
      displayName: nameClean,
      subtitle:
        descClean.length > 48 ? `${descClean.slice(0, 48)}...` : descClean,
      description: descClean,
      endpoint: endpointClean,
      trustScore: 100,
      reviewCount: 0,
      reviewLabel:
        selectedRole === 2
          ? "0 disputes resolved"
          : selectedRole === 1
          ? "0 milestones"
          : "0 reviews",
      tags:
        selectedRole === 2
          ? ["Dilithium-3", "MCP"]
          : selectedRole === 1
          ? ["Solidity", "ERC-8004"]
          : ["Treasury", "tUSD8"],
      metadata:
        selectedRole === 2 ? { model: "dilithium-verifier-v1" } : {},
    };

    setMockUserPassports((prev) => [newPassport, ...prev]);
    setDisplayName("");
    setBio("");
    setServiceEndpoint("");
    setCustomUri("");

    showToast(
      "success",
      `Minted ERC-8004 Passport #${nextId}`,
      selectedRole === 2
        ? `${nameClean} is now live in the Active AI Arbiter Pool.`
        : `${nameClean} (${roleLabel}) added to your Passport Vault.`
    );
  }

  function handleToggleActive(passport: PassportRecord) {
    const nextActive = !passport.active;

    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to update passport status."
        );
        return;
      }
      setPendingActionLabel(
        `${nextActive ? "Activate" : "Pause"} Passport #${passport.agentId}`
      );
      writeContract({
        address: CONTRACT_ADDRESSES.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setActive",
        args: [BigInt(passport.agentId), nextActive],
        chainId: aevumTestnet.id,
      });
      return;
    }

    setMockUserPassports((prev) =>
      prev.map((item) =>
        item.agentId === passport.agentId
          ? { ...item, active: nextActive }
          : item
      )
    );
    showToast(
      "success",
      `Passport #${passport.agentId} ${nextActive ? "Activated" : "Paused"}`,
      passport.role === 2
        ? nextActive
          ? `${passport.displayName} re-entered the Active AI Arbiter Pool.`
          : `${passport.displayName} removed from active dispute assignment.`
        : `Updated active flag for ${passport.displayName}.`
    );
  }

  function handleUpdateUriSubmit(agentId: number, newURI: string) {
    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to update Agent Card URI."
        );
        return;
      }
      setPendingActionLabel(`Update URI for Passport #${agentId}`);
      writeContract({
        address: CONTRACT_ADDRESSES.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setAgentURI",
        args: [BigInt(agentId), newURI],
        chainId: aevumTestnet.id,
      });
      return;
    }

    const decoded = parseAgentCardUri(newURI);
    setMockUserPassports((prev) =>
      prev.map((item) =>
        item.agentId === agentId
          ? {
              ...item,
              agentURI: newURI,
              displayName: decoded?.name ?? item.displayName,
              description: decoded?.description ?? item.description,
              endpoint: decoded?.services[0]?.endpoint ?? item.endpoint,
            }
          : item
      )
    );
    setUpdateUriTarget(null);
    showToast(
      "success",
      `Updated URI for Passport #${agentId}`,
      "Agent registration card URI saved."
    );
  }

  function handleSetMetadataSubmit(
    agentId: number,
    key: string,
    value: string
  ) {
    if (IS_PROTOCOL_DEPLOYED) {
      if (!isConnected) {
        showToast(
          "error",
          "Wallet Not Connected",
          "Connect your wallet to write on-chain metadata."
        );
        return;
      }
      setPendingActionLabel(`Set Metadata "${key}" on #${agentId}`);
      writeContract({
        address: CONTRACT_ADDRESSES.IdentityRegistry,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "setMetadata",
        args: [BigInt(agentId), key, stringToHex(value)],
        chainId: aevumTestnet.id,
      });
      return;
    }

    setMockUserPassports((prev) =>
      prev.map((item) =>
        item.agentId === agentId
          ? {
              ...item,
              metadata: {
                ...item.metadata,
                [key]: value,
              },
            }
          : item
      )
    );
    setMetadataTarget(null);
    showToast(
      "success",
      `Stored Metadata on #${agentId}`,
      `Saved ${key}=${value} (${stringToHex(value).slice(0, 14)}...).`
    );
  }

  const isTxBusy = isWritePending || isConfirming;

  // Cursor-tracking Copper & Ice radial spotlight matching the Dashboard hero
  const headerMouseX = useMotionValue(320);
  const headerMouseY = useMotionValue(90);
  const headerSpotlight = useMotionTemplate`radial-gradient(460px circle at ${headerMouseX}px ${headerMouseY}px, rgba(234, 122, 61, 0.14), rgba(56, 189, 248, 0.08) 42%, transparent 72%)`;

  function handleHeaderMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    headerMouseX.set(event.clientX - rect.left);
    headerMouseY.set(event.clientY - rect.top);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
      {/* 1. Compact Page Header Strip */}
      <motion.section
        onMouseMove={handleHeaderMouseMove}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface/95 p-6 sm:p-7"
      >
        {/* Cursor-tracking Copper & Ice radial lattice spotlight */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: headerSpotlight }}
        />

        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ice/25 bg-ice/10 px-3 py-1 font-mono text-[10px] font-semibold tracking-wider text-ice-400">
                <Fingerprint className="h-3 w-3" />
                ERC-8004 IDENTITY REGISTRY • ERC-721 AGENT PASSPORTS
              </span>

              {!IS_PROTOCOL_DEPLOYED && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Preview Mode — Interactive Simulation
                </span>
              )}
            </div>

            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
              ERC-8004 Identity &amp;{" "}
              <span className="text-copper">Agent Passports</span>
            </h1>

            <p className="text-sm leading-relaxed text-slate-400">
              Mint verifiable ERC-721 passports for{" "}
              <span className="text-slate-200">Clients</span>,{" "}
              <span className="text-slate-200">Freelancers</span>, and{" "}
              <span className="text-ice-400">Autonomous AI Arbiters</span>. A
              single wallet can hold multiple role passports with on-chain
              reputation and MCP/A2A agent cards.
            </p>
          </div>

          {/* Right Contract Chip + Live Stat Pills */}
          <div className="flex flex-col gap-3 sm:items-end lg:shrink-0">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-canvas/85 px-3.5 py-2 font-mono text-xs">
              <span className="text-slate-400">IdentityRegistry:</span>
              <span className="text-slate-100">
                {shortenAddress(CONTRACT_ADDRESSES.IdentityRegistry, 6, 4)}
              </span>
              <button
                type="button"
                onClick={() =>
                  void handleCopy(
                    CONTRACT_ADDRESSES.IdentityRegistry,
                    "registry-addr",
                    "IdentityRegistry address"
                  )
                }
                aria-label="Copy IdentityRegistry address"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-elevated hover:text-ice-400"
              >
                {copiedId === "registry-addr" ? (
                  <Check className="h-3.5 w-3.5 text-teal-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <a
                href={explorerAddressUrl(CONTRACT_ADDRESSES.IdentityRegistry)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View IdentityRegistry on Aevum Explorer"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-elevated hover:text-copper-400"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-elevated/70 px-3 py-1.5 font-mono text-xs">
                <UserCheck className="h-3.5 w-3.5 text-copper-400" />
                <span className="text-slate-400">Total Identities</span>
                <AnimatedNumber
                  value={totalIdentitiesCount}
                  decimals={0}
                  className="font-semibold text-slate-100"
                />
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl border border-ice/30 bg-ice/10 px-3 py-1.5 font-mono text-xs">
                <Scale className="h-3.5 w-3.5 text-ice-400" />
                <span className="text-ice-400/90">Active AI Arbiters</span>
                <AnimatedNumber
                  value={activeArbiterPool.length}
                  decimals={0}
                  className="font-semibold text-ice-400"
                />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Two-Column Main Workspace (5 cols Studio / 7 cols Vault) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT (5 cols): Mint ERC-8004 Passport Studio */}
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-4 sm:px-6">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-50">
                  Mint ERC-8004 Passport
                </h2>
                <p className="text-xs text-slate-400">
                  Register a new agent identity NFT on QDay Aevum
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md border border-ice/30 bg-ice/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-ice-400">
                <Sparkles className="h-3 w-3" />
                MULTI-IDENTITY ENABLED
              </span>
            </div>

            <form onSubmit={handleMintSubmit} className="space-y-5 p-5 sm:p-6">
              {/* Step 1: Role Selector */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    1. Select Agent Role
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    enum AgentRole ({selectedRole})
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {ROLE_OPTIONS.map((option) => {
                    const isSelected = selectedRole === option.id;
                    const activeClasses =
                      option.accent === "ice"
                        ? "border-ice/60 bg-ice/10 shadow-ice-glow"
                        : option.accent === "amber"
                        ? "border-amber-400/60 bg-amber-500/10"
                        : "border-copper/60 bg-copper/10 shadow-card-glow";
                    const iconColor =
                      option.accent === "ice"
                        ? "text-ice-400"
                        : option.accent === "amber"
                        ? "text-amber-400"
                        : "text-copper-400";

                    return (
                      <motion.button
                        key={option.id}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedRole(option.id)}
                        aria-pressed={isSelected}
                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? activeClasses
                            : "border-hairline bg-canvas/60 hover:border-slate-600/70 hover:bg-elevated/60"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                              isSelected
                                ? "border-white/15 bg-canvas/70"
                                : "border-hairline bg-elevated/70"
                            }`}
                          >
                            <RoleIcon
                              role={option.id}
                              className={`h-3.5 w-3.5 ${iconColor}`}
                            />
                          </span>
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isSelected
                                ? option.accent === "ice"
                                  ? "bg-ice-400"
                                  : option.accent === "amber"
                                  ? "bg-amber-400"
                                  : "bg-copper"
                                : "bg-slate-700"
                            }`}
                          />
                        </div>
                        <span className="mt-2.5 font-display text-xs font-semibold text-slate-100">
                          {option.label}
                        </span>
                        <span className="mt-0.5 text-[10px] leading-snug text-slate-400">
                          {option.shortDesc}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Agent Card Metadata */}
              <div className="space-y-3.5">
                <span className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  2. Agent Card Metadata
                </span>

                <div>
                  <label
                    htmlFor="agent-name-input"
                    className="mb-1 block text-xs font-medium text-slate-300"
                  >
                    Agent / Display Name
                  </label>
                  <input
                    id="agent-name-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder={
                      selectedRole === 2
                        ? "e.g. Sentinel-8 Arbiter Node"
                        : selectedRole === 1
                        ? "e.g. 0xLaizer Security Audits"
                        : "e.g. Acme Protocol Treasury"
                    }
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="agent-bio-input"
                    className="mb-1 block text-xs font-medium text-slate-300"
                  >
                    Bio / Capabilities
                  </label>
                  <textarea
                    id="agent-bio-input"
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Autonomous Solidity & DeFi security reviewer with Dilithium-3 attestations..."
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
                  />
                </div>

                <div>
                  <label
                    htmlFor="agent-endpoint-input"
                    className="mb-1 block text-xs font-medium text-slate-300"
                  >
                    Service Endpoint (MCP / A2A URL)
                  </label>
                  <input
                    id="agent-endpoint-input"
                    type="url"
                    value={serviceEndpoint}
                    onChange={(e) => setServiceEndpoint(e.target.value)}
                    placeholder={
                      selectedRole === 2
                        ? "https://sentinel8.trellis.ai/mcp"
                        : "https://agent.trellis.ai/a2a"
                    }
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
                  />
                </div>

                {/* Segmented Metadata Storage Toggle */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      Metadata Storage
                    </span>
                    <div
                      role="tablist"
                      aria-label="Metadata storage mode"
                      className="inline-flex rounded-xl border border-hairline bg-canvas/80 p-1"
                    >
                      {(
                        [
                          { id: "AUTO_JSON", label: "Auto-Build JSON" },
                          { id: "CUSTOM_URI", label: "Custom IPFS/HTTPS" },
                        ] as const
                      ).map((mode) => {
                        const active = uriMode === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setUriMode(mode.id)}
                            className={`relative rounded-lg px-2.5 py-1 font-mono text-[10px] font-medium transition-colors ${
                              active
                                ? "text-ice-400"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId="uri-mode-pill"
                                transition={{
                                  type: "spring",
                                  stiffness: 440,
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

                  {uriMode === "AUTO_JSON" ? (
                    <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
                      <div className="flex items-center justify-between border-b border-hairline/80 bg-elevated/45 px-3 py-2 font-mono text-[10px]">
                        <span className="text-slate-400">
                          ERC-8004 JSON Spec (Base64 On-Chain URI)
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">
                            {previewByteSize} B
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-teal-400">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Valid ERC-8004
                          </span>
                        </div>
                      </div>
                      <pre className="max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                        <code>
                          {"{\n"}
                          {"  "}
                          <span className="text-ice-400">&quot;type&quot;</span>
                          {": "}
                          <span className="text-copper-400">
                            &quot;{previewPayload.type}&quot;
                          </span>
                          {",\n"}
                          {"  "}
                          <span className="text-ice-400">&quot;name&quot;</span>
                          {": "}
                          <span className="text-teal-400">
                            &quot;{previewPayload.name}&quot;
                          </span>
                          {",\n"}
                          {"  "}
                          <span className="text-ice-400">&quot;role&quot;</span>
                          {": "}
                          <span className="text-amber-400">
                            &quot;{previewPayload.role}&quot;
                          </span>
                          {",\n"}
                          {"  "}
                          <span className="text-ice-400">
                            &quot;description&quot;
                          </span>
                          {": "}
                          <span className="text-slate-200">
                            &quot;{previewPayload.description}&quot;
                          </span>
                          {",\n"}
                          {"  "}
                          <span className="text-ice-400">
                            &quot;services&quot;
                          </span>
                          {": [\n    { "}
                          <span className="text-ice-400">&quot;name&quot;</span>
                          {": "}
                          <span className="text-teal-400">
                            &quot;{previewPayload.services[0]?.name}&quot;
                          </span>
                          {", "}
                          <span className="text-ice-400">
                            &quot;endpoint&quot;
                          </span>
                          {": "}
                          <span className="text-copper-400">
                            &quot;{previewPayload.services[0]?.endpoint}&quot;
                          </span>
                          {" }\n  ]\n}"}
                        </code>
                      </pre>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={customUri}
                        onChange={(e) => {
                          setCustomUri(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        placeholder="ipfs://bafybeig... or https://example.com/agent-card.json"
                        className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
                      />
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Point directly to an IPFS CID or HTTPS JSON conforming to{" "}
                        <span className="font-mono text-slate-300">
                          eip-8004#registration-v1
                        </span>
                        .
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Primary Burnished Copper CTA */}
              <motion.button
                type="submit"
                disabled={isTxBusy}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-copper px-5 py-3 text-sm font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.28)] transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isTxBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming on QDay Aevum...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    Mint ERC-8004 Identity NFT
                  </>
                )}
              </motion.button>
            </form>
          </div>
        </div>

        {/* RIGHT (7 cols): Your Minted Passports Vault */}
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex flex-col justify-between gap-3 border-b border-hairline px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-50">
                  Your Minted Passports ({userPassports.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Manage active status, Agent Card URIs, and on-chain metadata
                </p>
              </div>

              {/* Role Filter Pills */}
              <div
                role="tablist"
                aria-label="Filter passports by role"
                className="inline-flex items-center gap-1 self-start rounded-xl border border-hairline bg-canvas/70 p-1 sm:self-auto"
              >
                {FILTER_OPTIONS.map((tab) => {
                  const isActive = roleFilter === tab.id;
                  return (
                    <button
                      key={String(tab.id)}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setRoleFilter(tab.id)}
                      className={`relative rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "text-copper-400"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="passport-filter-pill"
                          transition={{
                            type: "spring",
                            stiffness: 440,
                            damping: 32,
                          }}
                          className="absolute inset-0 rounded-lg border border-copper/35 bg-copper/15"
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Passports Stack */}
            <div className="space-y-4 p-5 sm:p-6">
              <AnimatePresence mode="popLayout">
                {filteredUserPassports.length === 0 ? (
                  <motion.div
                    key="empty-vault"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-canvas/50 px-6 py-12 text-center"
                  >
                    <Fingerprint className="h-8 w-8 text-slate-600" />
                    <p className="mt-3 font-display text-sm font-semibold text-slate-200">
                      No passports match this role filter
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-slate-400">
                      Use the Mint ERC-8004 Passport Studio on the left to
                      register a Client, Freelancer, or AI Arbiter identity NFT.
                    </p>
                  </motion.div>
                ) : (
                  filteredUserPassports.map((passport) => {
                    const isArbiter = passport.role === 2;
                    const isFreelancer = passport.role === 1;
                    const topBorderClass = isArbiter
                      ? "border-t-2 border-t-ice shadow-ice-glow"
                      : isFreelancer
                      ? "border-t-2 border-t-amber-400"
                      : "border-t-2 border-t-copper";
                    const monogramClass = isArbiter
                      ? "border-ice/35 bg-ice/10 text-ice-400"
                      : isFreelancer
                      ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                      : "border-copper/35 bg-copper/10 text-copper-400";
                    const roleBadgeClass = isArbiter
                      ? "border-ice/30 bg-ice/10 text-ice-400"
                      : isFreelancer
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-copper/30 bg-copper/15 text-copper-400";
                    const metadataEntries = Object.entries(passport.metadata);

                    return (
                      <motion.article
                        key={passport.agentId}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{
                          duration: 0.25,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        className={`rounded-xl border border-hairline bg-elevated/45 p-4 transition-colors hover:bg-elevated/70 sm:p-5 ${topBorderClass}`}
                      >
                        {/* Card Top Row: Monogram + Identity Info + Active Toggle */}
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold ${monogramClass}`}
                            >
                              {roleMonogram(passport.role, passport.agentId)}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-display text-sm font-semibold text-slate-50 sm:text-base">
                                  {passport.displayName}
                                </h3>
                                <span className="font-mono text-xs font-semibold tabular-nums text-slate-400">
                                  #{passport.agentId}
                                </span>
                                <span
                                  className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${roleBadgeClass}`}
                                >
                                  {AGENT_ROLE_LABELS[passport.role]}
                                </span>

                                {isArbiter && passport.active && (
                                  <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-500/35 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-teal-400">
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal-500" />
                                    </span>
                                    IN ACTIVE POOL
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {passport.subtitle}
                              </p>
                            </div>
                          </div>

                          {/* Interactive Active / Paused Switch */}
                          <div className="flex shrink-0 items-center gap-2.5 self-end sm:self-start">
                            <span
                              className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${
                                passport.active
                                  ? "text-teal-400"
                                  : "text-slate-500"
                              }`}
                            >
                              {passport.active ? "Active" : "Paused"}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={passport.active}
                              aria-label={`Toggle active status for ${passport.displayName}`}
                              disabled={isTxBusy}
                              onClick={() => handleToggleActive(passport)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-ice/40 disabled:opacity-50 ${
                                passport.active
                                  ? isArbiter
                                    ? "border-ice/50 bg-ice/30"
                                    : "border-copper/50 bg-copper/30"
                                  : "border-hairline bg-canvas"
                              }`}
                            >
                              <motion.span
                                layout
                                transition={{
                                  type: "spring",
                                  stiffness: 500,
                                  damping: 32,
                                }}
                                className={`inline-block h-4 w-4 rounded-full shadow-sm ${
                                  passport.active
                                    ? isArbiter
                                      ? "translate-x-5 bg-ice-400"
                                      : "translate-x-5 bg-copper"
                                    : "translate-x-1 bg-slate-500"
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Animated Trust / Consensus Score Bar */}
                        <div className="mt-4 rounded-lg border border-hairline/70 bg-canvas/65 px-3.5 py-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
                              {isArbiter
                                ? "Consensus Score"
                                : "Reputation Trust Score"}
                            </span>
                            <div className="flex items-center gap-2 font-mono tabular-nums">
                              <span className="text-xs font-semibold text-slate-100">
                                {passport.trustScore}/100
                              </span>
                              <span className="text-[11px] text-slate-500">
                                • {passport.reviewLabel}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/90">
                            <motion.div
                              initial={{ scaleX: 0 }}
                              animate={{
                                scaleX: Math.min(
                                  1,
                                  Math.max(0, passport.trustScore / 100)
                                ),
                              }}
                              transition={{
                                duration: 0.55,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              style={{ transformOrigin: "left" }}
                              className={`h-full w-full rounded-full ${
                                isArbiter
                                  ? "bg-ice-400"
                                  : isFreelancer
                                  ? "bg-amber-400"
                                  : "bg-copper"
                              }`}
                            />
                          </div>
                        </div>

                        {/* Agent Card URI Strip + Tags / Metadata */}
                        <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-hairline/80 bg-canvas/80 px-2.5 py-1.5 font-mono text-[11px]">
                            <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                            <span className="truncate text-slate-300">
                              {passport.agentURI}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(
                                  passport.agentURI,
                                  `uri-${passport.agentId}`,
                                  `Passport #${passport.agentId} URI`
                                )
                              }
                              aria-label={`Copy URI for passport ${passport.agentId}`}
                              className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-ice-400"
                            >
                              {copiedId === `uri-${passport.agentId}` ? (
                                <Check className="h-3.5 w-3.5 text-teal-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>

                          <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            Minted {formatPassportDate(passport.registeredAt)}
                          </span>
                        </div>

                        {/* Capability Tags & Metadata Chips */}
                        {(passport.tags.length > 0 ||
                          metadataEntries.length > 0) && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {passport.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md border border-hairline bg-canvas/70 px-2 py-0.5 font-mono text-[10px] text-slate-300"
                              >
                                {tag}
                              </span>
                            ))}
                            {metadataEntries.map(([key, val]) => (
                              <span
                                key={key}
                                className="rounded-md border border-ice/25 bg-ice/10 px-2 py-0.5 font-mono text-[10px] text-ice-400"
                              >
                                {key}={val}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline/70 pt-3.5">
                          <button
                            type="button"
                            onClick={() => setUpdateUriTarget(passport)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas/80 px-2.5 py-1.5 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-copper/45 hover:text-copper-400"
                          >
                            <Link2 className="h-3 w-3" />
                            Update URI
                          </button>

                          <button
                            type="button"
                            onClick={() => setMetadataTarget(passport)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas/80 px-2.5 py-1.5 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-ice/45 hover:text-ice-400"
                          >
                            <Database className="h-3 w-3" />
                            Set Metadata
                          </button>

                          <button
                            type="button"
                            onClick={() => setInspectTarget(passport)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas/80 px-2.5 py-1.5 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-slate-500 hover:text-slate-50"
                          >
                            <Eye className="h-3 w-3" />
                            View Card
                          </button>

                          <a
                            href={explorerAddressUrl(
                              CONTRACT_ADDRESSES.IdentityRegistry
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 transition-colors hover:text-copper-400"
                          >
                            Explorer
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </motion.article>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Bottom Full-Width Section — Active AI Arbiter Pool */}
      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <div className="flex flex-col justify-between gap-3 border-b border-hairline px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-base font-semibold text-slate-50">
              Active AI Arbiter Pool
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ice/30 bg-ice/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-ice-400">
              <ShieldCheck className="h-3 w-3" />
              {activeArbiterPool.length} Arbiters Ready • 2-of-3 Conflict-Free
              Selection
            </span>
          </div>

          <span className="font-mono text-[11px] text-slate-400">
            Eligible for random assignment by DisputeResolution
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          {activeArbiterPool.map((arbiter) => {
            const isOwnedByUser =
              activeOwnerAddress !== undefined &&
              arbiter.owner.toLowerCase() === activeOwnerAddress.toLowerCase();

            return (
              <motion.div
                key={arbiter.agentId}
                whileHover={{ y: -2 }}
                className={`flex flex-col justify-between rounded-xl border bg-elevated/45 p-4 transition-shadow ${
                  isOwnedByUser
                    ? "border-ice/45 shadow-ice-glow"
                    : "border-hairline hover:border-ice/35 hover:shadow-ice-glow"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ice/30 bg-ice/10 font-mono text-xs font-bold text-ice-400">
                        A{arbiter.agentId}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-display text-sm font-semibold text-slate-100">
                            {arbiter.displayName}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                          Token #{arbiter.agentId} •{" "}
                          {shortenAddress(arbiter.owner, 4, 4)}
                        </span>
                      </div>
                    </div>

                    {isOwnedByUser && (
                      <span className="shrink-0 rounded-md border border-copper/40 bg-copper/15 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-copper-400">
                        YOU
                      </span>
                    )}
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {arbiter.subtitle}
                  </p>

                  {arbiter.metadata.model && (
                    <div className="mt-2.5">
                      <span className="inline-flex rounded-md border border-hairline bg-canvas/80 px-2 py-0.5 font-mono text-[10px] text-ice-400">
                        model={arbiter.metadata.model}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3 border-t border-hairline/70 pt-3">
                  <div>
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-slate-400">CONSENSUS</span>
                      <span className="font-semibold tabular-nums text-slate-100">
                        {arbiter.trustScore}/100
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div
                        style={{ width: `${arbiter.trustScore}%` }}
                        className="h-full rounded-full bg-ice-400"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectTarget(arbiter)}
                    className="inline-flex w-full items-center justify-between rounded-lg border border-hairline bg-canvas/75 px-3 py-1.5 font-mono text-[11px] font-medium text-slate-200 transition-colors hover:border-ice/40 hover:text-ice-400"
                  >
                    <span>View Agent Card</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Modals */}
      <UpdateUriModal
        passport={updateUriTarget}
        isOpen={updateUriTarget !== null}
        isSubmitting={isTxBusy}
        onClose={() => setUpdateUriTarget(null)}
        onSubmit={handleUpdateUriSubmit}
      />

      <SetMetadataModal
        passport={metadataTarget}
        isOpen={metadataTarget !== null}
        isSubmitting={isTxBusy}
        onClose={() => setMetadataTarget(null)}
        onSubmit={handleSetMetadataSubmit}
      />

      <ViewAgentCardModal
        passport={inspectTarget}
        isOpen={inspectTarget !== null}
        onClose={() => setInspectTarget(null)}
      />

      {/* Bottom-Right Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-hairline bg-elevated/95 p-4 shadow-2xl backdrop-blur-md"
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
                {toast.tone === "pending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : toast.tone === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-display text-xs font-semibold text-slate-100">
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
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] text-ice-400 hover:underline"
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
                className="rounded p-1 text-slate-500 transition-colors hover:text-slate-200"
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
