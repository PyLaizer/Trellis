"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Code2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { formatTUSD8 } from "@/lib/format";
import type { PassportRecord } from "@/lib/mockIdentityData";
import type { ProjectRecord } from "@/lib/mockProjectsData";
import { formatShortDate } from "@/lib/projectMetadata";

interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  accent?: "copper" | "rose";
  children: ReactNode;
}

function ModalFrame({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  accent = "copper",
  children,
}: ModalFrameProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-canvas/80 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl"
          >
            {/* Top Accent Line */}
            <div
              className={`h-0.5 w-full ${
                accent === "rose"
                  ? "bg-gradient-to-r from-rose-500/20 via-rose-400 to-rose-500/20"
                  : "bg-gradient-to-r from-copper/20 via-copper to-copper/20"
              }`}
            />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    accent === "rose"
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      : "border-copper/30 bg-copper/10 text-copper-400"
                  }`}
                >
                  {icon}
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-50">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="rounded-lg border border-transparent p-1.5 text-slate-400 transition-colors hover:border-hairline hover:bg-elevated hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Accept Project Modal                                                    */
/* -------------------------------------------------------------------------- */

interface AcceptProjectModalProps {
  project: ProjectRecord | null;
  freelancerPassports: PassportRecord[];
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (projectId: number, freelancerAgentId: number) => void;
}

export function AcceptProjectModal({
  project,
  freelancerPassports,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: AcceptProjectModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [manualAgentId, setManualAgentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      const activeFreelancers = freelancerPassports.filter((p) => p.active);
      if (activeFreelancers.length > 0) {
        setSelectedAgentId(String(activeFreelancers[0].agentId));
        setManualAgentId("");
      } else {
        setSelectedAgentId("manual");
        setManualAgentId(
          project.isDirectHire && project.freelancerAgentId > 0
            ? String(project.freelancerAgentId)
            : ""
        );
      }
      setError(null);
    }
  }, [isOpen, project, freelancerPassports]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;

    const rawId =
      selectedAgentId === "manual" ? manualAgentId.trim() : selectedAgentId;
    const parsedId = Number(rawId);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setError("Please select or enter a valid Freelancer ERC-8004 Agent ID.");
      return;
    }

    if (
      project.isDirectHire &&
      project.freelancerAgentId > 0 &&
      parsedId !== project.freelancerAgentId
    ) {
      setError(
        `This Direct Hire project is reserved for Freelancer Agent #${project.freelancerAgentId}.`
      );
      return;
    }

    setError(null);
    onConfirm(project.projectId, parsedId);
  }

  return (
    <ModalFrame
      isOpen={isOpen && project !== null}
      onClose={onClose}
      title="Accept Escrow Project"
      subtitle={
        project
          ? `ProjectManager.acceptProject(#TRL-${project.projectId}, freelancerAgentId)`
          : undefined
      }
      icon={<Code2 className="h-4 w-4" />}
      accent="copper"
    >
      {project && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Verified Funded Summary */}
          <div className="rounded-xl border border-hairline bg-canvas/80 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  #TRL-{project.projectId} • {project.clientName}
                </span>
                <h4 className="mt-0.5 truncate font-display text-sm font-semibold text-slate-100">
                  {project.title}
                </h4>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-teal-500/35 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-400">
                <ShieldCheck className="h-3 w-3" />
                100% FUNDED
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5">
              <span className="text-xs text-slate-400">
                Verified Locked Escrow
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-copper-400">
                {formatTUSD8(project.totalBudget)}{" "}
                <span className="text-[11px] font-normal text-slate-400">
                  tUSD8
                </span>
              </span>
            </div>
          </div>

          {/* Milestone Breakdown */}
          <div>
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Staged Milestone Breakdown ({project.milestones.length})
            </span>
            <div className="mt-1.5 space-y-1.5">
              {project.milestones.map((m) => (
                <div
                  key={m.index}
                  className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-elevated/55 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="mr-1.5 font-mono text-[10px] text-slate-500">
                      M{m.index + 1}
                    </span>
                    <span className="truncate text-slate-200">{m.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Calendar className="h-3 w-3 text-slate-500" />
                      {formatShortDate(m.dueDate)}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-100">
                      {formatTUSD8(m.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Freelancer Passport Selector */}
          <div>
            <label
              htmlFor="accept-freelancer-select"
              className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              Freelancer ERC-8004 Passport
            </label>

            {freelancerPassports.length > 0 ? (
              <select
                id="accept-freelancer-select"
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
              >
                {freelancerPassports.map((p) => (
                  <option key={p.agentId} value={String(p.agentId)}>
                    #{p.agentId} — {p.displayName} (★ {p.trustScore}/100)
                    {!p.active ? " [PAUSED]" : ""}
                  </option>
                ))}
                <option value="manual">Enter Freelancer Agent ID manually...</option>
              </select>
            ) : (
              <p className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                No active Freelancer ERC-8004 passport found in your wallet. Enter
                an authorized Agent ID or mint one on{" "}
                <span className="font-mono">/identity</span>.
              </p>
            )}

            {(selectedAgentId === "manual" ||
              freelancerPassports.length === 0) && (
              <input
                type="number"
                min={1}
                step={1}
                value={manualAgentId}
                onChange={(e) => {
                  setManualAgentId(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter Freelancer Agent ID (e.g. 2)"
                className="mt-2 w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
              />
            )}

            {error && (
              <p className="mt-1.5 font-mono text-[11px] text-rose-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-hairline bg-elevated px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-elevated/80 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-canvas shadow-[0_0_20px_rgba(234,122,61,0.22)] transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Confirming Acceptance...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Accept &amp; Start Milestones
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Cancel & Refund Project Modal                                           */
/* -------------------------------------------------------------------------- */

interface CancelProjectModalProps {
  project: ProjectRecord | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (projectId: number) => void;
}

export function CancelProjectModal({
  project,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: CancelProjectModalProps) {
  return (
    <ModalFrame
      isOpen={isOpen && project !== null}
      onClose={onClose}
      title="Cancel Project & Refund 100%"
      subtitle={
        project
          ? `ProjectManager.cancelProject(#TRL-${project.projectId})`
          : undefined
      }
      icon={<RotateCcw className="h-4 w-4" />}
      accent="rose"
    >
      {project && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="space-y-1 text-xs leading-relaxed text-slate-200">
              <p className="font-medium text-rose-300">
                Cancel Open Escrow Vault?
              </p>
              <p className="text-slate-300">
                Because no freelancer has accepted{" "}
                <span className="font-semibold text-slate-100">
                  {project.title}
                </span>
                , cancelling immediately unlocks and returns{" "}
                <span className="font-mono font-semibold text-teal-400">
                  100% ({formatTUSD8(project.totalBudget)} tUSD8)
                </span>{" "}
                to your wallet with{" "}
                <span className="font-mono font-semibold text-teal-400">
                  0% protocol fee
                </span>
                .
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-hairline bg-canvas/80 p-3.5 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Locked Milestones Refunded</span>
              <span className="text-slate-100">
                {project.milestones.length} / {project.milestones.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Protocol Refund Fee</span>
              <span className="text-teal-400">0.00 tUSD8 (0%)</span>
            </div>
            <div className="flex items-center justify-between border-t border-hairline pt-2">
              <span className="text-slate-300">Net Refund to Client</span>
              <span className="text-sm font-bold tabular-nums text-teal-400">
                {formatTUSD8(project.totalBudget)} tUSD8
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-hairline bg-elevated px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-elevated/80 hover:text-slate-100"
            >
              Keep Project Open
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onConfirm(project.projectId)}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refunding Vault...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Confirm Cancel &amp; Refund 100%
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}
