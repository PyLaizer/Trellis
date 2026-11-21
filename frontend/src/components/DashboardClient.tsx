"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Database,
  Fingerprint,
  LayoutGrid,
  Lock,
  Plus,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useReadContract } from "wagmi";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { aevumTestnet } from "@/lib/chains";
import {
  IDENTITY_REGISTRY_ABI,
  MILESTONE_ESCROW_ABI,
  PROJECT_MANAGER_ABI,
} from "@/lib/contracts/abis";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
} from "@/lib/contracts/addresses";
import {
  explorerTxUrl,
  formatTUSD8,
  shortenAddress,
  shortenHash,
} from "@/lib/format";
import {
  MOCK_ARBITRATION_FEED,
  MOCK_KPI_SNAPSHOT,
  MOCK_PASSPORTS,
  MOCK_PROJECTS,
  type DashboardProject,
  type MilestoneSegmentState,
  type ProjectStatus,
} from "@/lib/mockDashboardData";

type FilterTab = "ALL" | "ACTIVE" | "DISPUTED" | "COMPLETED";

const FILTER_TABS: readonly { id: FilterTab; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "DISPUTED", label: "Disputed" },
  { id: "COMPLETED", label: "Completed" },
];

const containerStagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardItem = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

function ProjectIcon({ kind }: { kind: DashboardProject["icon"] }) {
  switch (kind) {
    case "shield":
      return <Shield className="h-4 w-4 text-copper-400" />;
    case "cpu":
      return <Cpu className="h-4 w-4 text-ice-400" />;
    case "layout":
      return <LayoutGrid className="h-4 w-4 text-copper-400" />;
    case "database":
      return <Database className="h-4 w-4 text-ice-400" />;
  }
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    ACTIVE:
      "border-copper/30 bg-copper/15 text-copper-400",
    DISPUTED:
      "border-rose-500/30 bg-rose-500/15 text-rose-400",
    OPEN:
      "border-amber-500/30 bg-amber-500/15 text-amber-400",
    COMPLETED:
      "border-teal-500/30 bg-teal-500/15 text-teal-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function MilestoneSegmentBar({
  segments,
  completedCount,
  totalCount,
  isCompletedProject,
}: {
  segments: MilestoneSegmentState[];
  completedCount: number;
  totalCount: number;
  isCompletedProject: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-slate-400">
        <span>
          {completedCount}/{totalCount} milestones
        </span>
      </div>
      <div className="flex h-1.5 w-32 items-center gap-1 sm:w-36">
        {segments.map((seg, idx) => {
          const barColor =
            seg === "approved"
              ? isCompletedProject
                ? "bg-teal-400"
                : "bg-copper"
              : seg === "disputed"
              ? "bg-rose-500"
              : "bg-slate-700/80";

          return (
            <div
              key={idx}
              className="h-full flex-1 overflow-hidden rounded-full bg-slate-800/90"
            >
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.45,
                  delay: idx * 0.07,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{ transformOrigin: "left" }}
                className={`h-full w-full rounded-full ${barColor}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardClient() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");

  // Cursor-tracking radial spotlight for Hero Card
  const mouseX = useMotionValue(320);
  const mouseY = useMotionValue(120);
  const spotlightBackground = useMotionTemplate`radial-gradient(460px circle at ${mouseX}px ${mouseY}px, rgba(234, 122, 61, 0.14), rgba(56, 189, 248, 0.08) 42%, transparent 72%)`;

  function handleHeroMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(event.clientX - rect.left);
    mouseY.set(event.clientY - rect.top);
  }

  // Live on-chain protocol reads when contracts are deployed
  const { data: liveTotalProjects } = useReadContract({
    address: CONTRACT_ADDRESSES.ProjectManager,
    abi: PROJECT_MANAGER_ABI,
    functionName: "totalProjects",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const { data: liveActiveArbiters } = useReadContract({
    address: CONTRACT_ADDRESSES.IdentityRegistry,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getActiveArbiterCount",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const { data: liveFeeBps } = useReadContract({
    address: CONTRACT_ADDRESSES.MilestoneEscrow,
    abi: MILESTONE_ESCROW_ABI,
    functionName: "feeBps",
    chainId: aevumTestnet.id,
    query: { enabled: IS_PROTOCOL_DEPLOYED },
  });

  const activeProjectsValue =
    IS_PROTOCOL_DEPLOYED && typeof liveTotalProjects === "bigint"
      ? Number(liveTotalProjects)
      : MOCK_KPI_SNAPSHOT.activeProjects;

  const activeArbitersValue =
    IS_PROTOCOL_DEPLOYED && typeof liveActiveArbiters === "bigint"
      ? Number(liveActiveArbiters)
      : MOCK_KPI_SNAPSHOT.activeArbiters;

  const feePercentValue =
    IS_PROTOCOL_DEPLOYED && typeof liveFeeBps === "bigint"
      ? Number(liveFeeBps) / 100
      : MOCK_KPI_SNAPSHOT.feePercent;

  const filteredProjects = MOCK_PROJECTS.filter((project) => {
    if (activeFilter === "ALL") return true;
    return project.status === activeFilter;
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
      {/* 1. Hero Banner Card */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        onMouseMove={handleHeroMouseMove}
        className="lattice-bg relative overflow-hidden rounded-2xl border border-hairline bg-surface/95 p-6 sm:p-8 lg:p-9"
      >
        {/* Interactive 60fps cursor-tracking radial spotlight */}
        <motion.div
          aria-hidden="true"
          style={{ background: spotlightBackground }}
          className="pointer-events-none absolute inset-0 opacity-90 transition-opacity duration-300"
        />

        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ice/25 bg-ice/10 px-3 py-1 font-mono text-[11px] font-medium tracking-wider text-ice-400">
                <Sparkles className="h-3 w-3" />
                ERC-8004 TRUSTLESS AGENTS • QDAY POST-QUANTUM L2
              </span>

              {!IS_PROTOCOL_DEPLOYED && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-medium tracking-wider text-amber-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Preview Mode — Awaiting Aevum Deploy
                </span>
              )}
            </div>

            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
              Quantum-Safe Milestone Escrow with{" "}
              <span className="text-copper">AI Arbitration</span>
            </h1>

            <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
              Lock <span className="font-mono text-slate-200">tUSD8</span>{" "}
              milestone budgets on QDay Aevum, verify counterparties via
              soulbound ERC-8004 identity passports, and settle disputes with
              2-of-3 Dilithium-3 AI arbiter consensus.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-xl bg-copper px-5 py-3 text-sm font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.28)] transition-colors hover:bg-copper-600"
              >
                <Plus className="h-4 w-4" />
                Create Escrow Project
              </Link>
            </motion.div>

            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/identity"
                className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-elevated/80 px-5 py-3 text-sm font-semibold text-slate-100 transition-colors hover:border-ice/50 hover:bg-elevated"
              >
                <Fingerprint className="h-4 w-4 text-ice-400" />
                Mint ERC-8004 Passport
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* 2. 4-Column KPI Metrics Row */}
      <motion.section
        variants={containerStagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {/* KPI 1: Total Value Escrowed */}
        <motion.div
          variants={cardItem}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-hairline bg-surface p-5 transition-shadow duration-200 hover:border-copper/35 hover:shadow-card-glow"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium tracking-wider text-slate-400">
              TOTAL VALUE ESCROWED
            </span>
            <Lock className="h-4 w-4 text-copper-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <AnimatedNumber
              value={MOCK_KPI_SNAPSHOT.totalValueEscrowedUsd}
              decimals={2}
              prefix="$"
              className="text-2xl font-bold text-slate-50"
            />
            <span className="font-mono text-xs text-slate-400">tUSD8</span>
          </div>
          <p className="mt-2 font-mono text-xs text-teal-400">
            {MOCK_KPI_SNAPSHOT.tvlDeltaLabel}
          </p>
        </motion.div>

        {/* KPI 2: Active Projects */}
        <motion.div
          variants={cardItem}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-hairline bg-surface p-5 transition-shadow duration-200 hover:border-copper/35 hover:shadow-card-glow"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium tracking-wider text-slate-400">
              ACTIVE PROJECTS
            </span>
            <LayoutGrid className="h-4 w-4 text-copper-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <AnimatedNumber
              value={activeProjectsValue}
              decimals={0}
              className="text-2xl font-bold text-slate-50"
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-slate-300">
              {MOCK_KPI_SNAPSHOT.lockedMilestonesCount}
            </span>{" "}
            milestones locked in escrow
          </p>
        </motion.div>

        {/* KPI 3: Active AI Arbiters */}
        <motion.div
          variants={cardItem}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-hairline bg-surface p-5 transition-shadow duration-200 hover:border-ice/40 hover:shadow-ice-glow"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium tracking-wider text-slate-400">
              ACTIVE AI ARBITERS
            </span>
            <Scale className="h-4 w-4 text-ice-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <AnimatedNumber
              value={activeArbitersValue}
              decimals={0}
              className="text-2xl font-bold text-slate-50"
            />
            <span className="text-sm font-medium text-slate-300">
              Nodes active
            </span>
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center rounded-md border border-ice/30 bg-ice/10 px-2 py-0.5 font-mono text-[11px] text-ice-400">
              {MOCK_KPI_SNAPSHOT.quorumLabel}
            </span>
          </div>
        </motion.div>

        {/* KPI 4: Protocol Fee */}
        <motion.div
          variants={cardItem}
          whileHover={{ y: -2 }}
          className="rounded-xl border border-hairline bg-surface p-5 transition-shadow duration-200 hover:border-copper/35 hover:shadow-card-glow"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium tracking-wider text-slate-400">
              PROTOCOL FEE
            </span>
            <ShieldCheck className="h-4 w-4 text-copper-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <AnimatedNumber
              value={feePercentValue}
              decimals={1}
              suffix="%"
              className="text-2xl font-bold text-slate-50"
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {MOCK_KPI_SNAPSHOT.feeSublabel}
          </p>
        </motion.div>
      </motion.section>

      {/* 3. Two-Column Main Workspace (8 cols left / 4 cols right) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols): Recent Escrow Projects + Dilithium-3 Status */}
        <div className="space-y-6 lg:col-span-8">
          {/* Recent Escrow Projects Card */}
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex flex-col justify-between gap-4 border-b border-hairline px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-50">
                  Recent Escrow Projects
                </h2>
                <p className="text-xs text-slate-400">
                  Milestone-gated tUSD8 vaults secured on QDay Aevum
                </p>
              </div>

              {/* Filter Tabs with Framer Motion layoutId sliding pill */}
              <div
                role="tablist"
                aria-label="Filter escrow projects"
                className="inline-flex items-center gap-1 self-start rounded-xl border border-hairline bg-canvas/70 p-1 sm:self-auto"
              >
                {FILTER_TABS.map((tab) => {
                  const isActive = activeFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveFilter(tab.id)}
                      className={`relative rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "text-copper-400"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="project-filter-pill"
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

            {/* Table Header (desktop) */}
            <div className="hidden grid-cols-12 items-center gap-4 border-b border-hairline/70 bg-canvas/40 px-6 py-2.5 font-mono text-[10px] font-semibold tracking-wider text-slate-500 sm:grid">
              <div className="col-span-5">PROJECT / CLIENT</div>
              <div className="col-span-3">MILESTONE PROGRESS</div>
              <div className="col-span-2 text-right">ESCROW BUDGET</div>
              <div className="col-span-2 text-right">STATUS</div>
            </div>

            {/* Animated Project Rows */}
            <div className="divide-y divide-hairline/60">
              <AnimatePresence mode="popLayout">
                {filteredProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href="/projects"
                      className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-elevated/60 sm:grid-cols-12 sm:gap-4 sm:px-6"
                    >
                      {/* Project Icon + Title + ID + Client */}
                      <div className="flex items-start gap-3 sm:col-span-5">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-elevated/80 transition-colors group-hover:border-copper/35">
                          <ProjectIcon kind={project.icon} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-display text-sm font-semibold text-slate-100 group-hover:text-copper-400">
                              {project.title}
                            </span>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] tabular-nums text-slate-400">
                            <span className="text-ice-400">{project.id}</span>
                            <span className="text-slate-600">•</span>
                            <span>{shortenAddress(project.clientAddress)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Segmented Milestone Progress */}
                      <div className="sm:col-span-3">
                        <MilestoneSegmentBar
                          segments={project.milestones}
                          completedCount={project.completedCount}
                          totalCount={project.totalCount}
                          isCompletedProject={project.status === "COMPLETED"}
                        />
                      </div>

                      {/* Escrow Budget */}
                      <div className="flex items-center justify-between sm:col-span-2 sm:flex-col sm:items-end">
                        <span className="font-mono text-xs text-slate-500 sm:hidden">
                          Escrow Budget
                        </span>
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-sm font-semibold text-slate-100">
                            {formatTUSD8(project.budgetTUSD8)}
                          </div>
                          <div className="text-[10px] text-slate-400">tUSD8</div>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="flex items-center justify-between sm:col-span-2 sm:justify-end">
                        <span className="font-mono text-xs text-slate-500 sm:hidden">
                          Status
                        </span>
                        <StatusPill status={project.status} />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Post-Quantum Dilithium-3 Consensus Status Card */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-hairline bg-surface p-5 sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ice/30 bg-ice/10">
                <ShieldCheck className="h-5 w-5 text-ice-400" />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  Post-Quantum Dilithium-3 Consensus Status
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  ML-DSA-65 arbiter attestation signatures and ERC-8004
                  validation receipts anchored to QDay Aevum L2 finality.
                </p>
              </div>
            </div>

            <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-teal-500/35 bg-teal-500/10 px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wider text-teal-400 sm:self-auto">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
              </span>
              LATTICE-SYNCED
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): ERC-8004 Passports + Live Arbitration Feed */}
        <div className="space-y-6 lg:col-span-4">
          {/* Your ERC-8004 Passports Card */}
          <div className="rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-50">
                Your ERC-8004 Passports
              </h2>
              <Link
                href="/identity"
                className="font-mono text-xs font-medium text-copper-400 transition-colors hover:text-copper"
              >
                + Mint New Identity
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {MOCK_PASSPORTS.map((passport) => (
                <Link
                  key={passport.tokenId}
                  href="/identity"
                  className={`group block rounded-xl border border-hairline bg-elevated/55 p-4 transition-all duration-200 hover:bg-elevated ${
                    passport.isActiveArbiter
                      ? "hover:border-ice/45 hover:shadow-ice-glow"
                      : "hover:border-copper/45 hover:shadow-card-glow"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                          passport.isActiveArbiter
                            ? "border-ice/30 bg-ice/10"
                            : "border-copper/30 bg-copper/10"
                        }`}
                      >
                        <Fingerprint
                          className={`h-4 w-4 ${
                            passport.isActiveArbiter
                              ? "text-ice-400"
                              : "text-copper-400"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="font-display text-sm font-semibold text-slate-100">
                          {passport.label}
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-slate-400">
                          ERC-8004 Token #{passport.tokenId}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider ${
                        passport.isActiveArbiter
                          ? "border-ice/35 bg-ice/10 text-ice-400"
                          : "border-copper/30 bg-copper/15 text-copper-400"
                      }`}
                    >
                      {passport.badge}
                    </span>
                  </div>

                  <div className="mt-3.5 flex items-center justify-between border-t border-hairline/70 pt-3">
                    <span className="font-mono text-[10px] tracking-wider text-slate-400">
                      TRUST SCORE
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                        <div
                          style={{ width: `${passport.trustScore}%` }}
                          className={`h-full rounded-full ${
                            passport.isActiveArbiter
                              ? "bg-ice-400"
                              : "bg-copper"
                          }`}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-slate-100">
                        {passport.trustScore}/100
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Live Arbitration Feed Card */}
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <h2 className="font-display text-base font-semibold text-slate-50">
                Live Arbitration Feed
              </h2>
              <div className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ice-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ice-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-ice-500" />
                </span>
                Real-Time
              </div>
            </div>

            <motion.div
              variants={containerStagger}
              initial="hidden"
              animate="show"
              className="space-y-3 p-5"
            >
              {MOCK_ARBITRATION_FEED.map((event) => {
                const iconConfig =
                  event.type === "approved"
                    ? {
                        Icon: CheckCircle2,
                        color: "text-copper-400",
                        bg: "bg-copper/10 border-copper/25",
                      }
                    : event.type === "disputed"
                    ? {
                        Icon: AlertTriangle,
                        color: "text-rose-400",
                        bg: "bg-rose-500/10 border-rose-500/25",
                      }
                    : {
                        Icon: ShieldCheck,
                        color: "text-ice-400",
                        bg: "bg-ice/10 border-ice/25",
                      };

                const EventIcon = iconConfig.Icon;

                return (
                  <motion.div
                    key={event.id}
                    variants={cardItem}
                    className="rounded-xl border border-hairline/80 bg-elevated/45 p-3.5 transition-colors hover:border-hairline hover:bg-elevated/75"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconConfig.bg}`}
                      >
                        <EventIcon className={`h-3.5 w-3.5 ${iconConfig.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-100">
                            {event.title}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">
                            {event.timestamp}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                          {event.type === "approved" ? (
                            <>
                              Released{" "}
                              <span className="font-mono font-medium text-copper-400">
                                +990.00 tUSD8
                              </span>{" "}
                              for #TRL-104 DeFi Vault Audit
                            </>
                          ) : (
                            event.detail
                          )}
                        </p>
                        <div className="mt-2">
                          <a
                            href={explorerTxUrl(event.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas/70 px-2 py-0.5 font-mono text-[10px] tabular-nums text-slate-300 transition-colors hover:border-ice/40 hover:text-ice-400"
                          >
                            {shortenHash(event.txHash)}
                            <ArrowUpRight className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Bottom L2 Block / Aevum Testnet Bar */}
            <div className="flex items-center justify-between border-t border-hairline bg-canvas/50 px-5 py-3 font-mono text-[11px] tabular-nums text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">L2 Block</span>
                <span className="text-slate-200">#1,842,910</span>
              </div>
              <span className="text-ice-400">Aevum Testnet (44005)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
