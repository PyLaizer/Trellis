"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  Hash,
  Loader2,
  Scale,
  ShieldCheck,
  Star,
  Upload,
  X,
} from "lucide-react";
import { keccak256, toHex, type Address } from "viem";
import { formatTUSD8, shortenAddress, shortenHash } from "@/lib/format";
import type { MilestoneRecord } from "@/lib/mockProjectsData";
import { buildJsonDataUri, formatShortDate } from "@/lib/projectMetadata";

const ZERO_BYTES32: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const BYTES32_REGEX = /^0x[a-fA-F0-9]{64}$/;

interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  accent?: "copper" | "ice" | "rose" | "teal";
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

  const topBarClass =
    accent === "rose"
      ? "bg-gradient-to-r from-rose-500/20 via-rose-400 to-rose-500/20"
      : accent === "ice"
        ? "bg-gradient-to-r from-ice/20 via-ice to-ice/20"
        : accent === "teal"
          ? "bg-gradient-to-r from-teal-500/20 via-teal-400 to-teal-500/20"
          : "bg-gradient-to-r from-copper/20 via-copper to-copper/20";

  const iconBoxClass =
    accent === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
      : accent === "ice"
        ? "border-ice/30 bg-ice/10 text-ice-400"
        : accent === "teal"
          ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
          : "border-copper/30 bg-copper/10 text-copper-400";

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
            <div className={`h-0.5 w-full ${topBarClass}`} />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${iconBoxClass}`}
                >
                  {icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-slate-50">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
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

            <div className="max-h-[80vh] overflow-y-auto px-5 py-5 sm:px-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Submit Deliverable Modal                                                */
/* -------------------------------------------------------------------------- */

interface SubmitDeliverableModalProps {
  projectId: number;
  milestone: MilestoneRecord | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (
    milestoneIndex: number,
    deliverableURI: string,
    deliverableHash: `0x${string}`
  ) => void;
}

export function SubmitDeliverableModal({
  projectId,
  milestone,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: SubmitDeliverableModalProps) {
  const [deliverableURI, setDeliverableURI] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [useCustomHash, setUseCustomHash] = useState(false);
  const [customHash, setCustomHash] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDeliverableURI("");
      setReleaseNotes("");
      setUseCustomHash(false);
      setCustomHash("");
      setError(null);
    }
  }, [isOpen, milestone?.index]);

  const computedHash = useMemo<`0x${string}`>(() => {
    const uri = deliverableURI.trim();
    const notes = releaseNotes.trim();
    if (!uri && !notes) return ZERO_BYTES32;
    return keccak256(toHex(`${uri}${notes ? `\n${notes}` : ""}`));
  }, [deliverableURI, releaseNotes]);

  const activeHash = useCustomHash ? customHash.trim() : computedHash;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!milestone) return;

    const trimmedUri = deliverableURI.trim();
    if (!trimmedUri) {
      setError("Deliverable URI is required (e.g. ipfs://... or https://...).");
      return;
    }

    if (
      !trimmedUri.startsWith("ipfs://") &&
      !trimmedUri.startsWith("https://") &&
      !trimmedUri.startsWith("http://") &&
      !trimmedUri.startsWith("data:")
    ) {
      setError("URI must start with ipfs://, https://, or data:.");
      return;
    }

    if (useCustomHash) {
      if (!BYTES32_REGEX.test(customHash.trim())) {
        setError(
          "Custom hash must be a valid 32-byte hex string (0x followed by 64 hex chars)."
        );
        return;
      }
      if (customHash.trim().toLowerCase() === ZERO_BYTES32) {
        setError("Deliverable hash cannot be zero bytes32.");
        return;
      }
    }

    const finalHash = (
      useCustomHash ? customHash.trim() : computedHash
    ) as `0x${string}`;
    setError(null);
    onConfirm(milestone.index, trimmedUri, finalHash);
  }

  return (
    <ModalFrame
      isOpen={isOpen && milestone !== null}
      onClose={onClose}
      title="Submit Milestone Deliverable"
      subtitle={
        milestone
          ? `ProjectManager.submitDeliverable(#TRL-${projectId}, M${milestone.index})`
          : undefined
      }
      icon={<Upload className="h-4 w-4" />}
      accent="ice"
    >
      {milestone && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Milestone Context Strip */}
          <div className="rounded-xl border border-hairline bg-canvas/80 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ice-400">
                  Milestone M{milestone.index} • Locked in Escrow
                </span>
                <h4 className="mt-0.5 truncate font-display text-sm font-semibold text-slate-100">
                  {milestone.title}
                </h4>
              </div>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-copper-400">
                {formatTUSD8(milestone.amount)}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-hairline pt-2 font-mono text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-slate-500" />
                Due {formatShortDate(milestone.dueDate)}
              </span>
              <span className="text-slate-500">tUSD8 Tranche</span>
            </div>
          </div>

          {/* Deliverable URI */}
          <div>
            <label
              htmlFor="submit-deliverable-uri"
              className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              Deliverable URI <span className="text-rose-400">*</span>
            </label>
            <input
              id="submit-deliverable-uri"
              type="text"
              value={deliverableURI}
              onChange={(e) => {
                setDeliverableURI(e.target.value);
                if (error) setError(null);
              }}
              placeholder="ipfs://bafybeig... or https://github.com/org/repo/commit/..."
              className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
            />
          </div>

          {/* Optional Release Notes */}
          <div>
            <label
              htmlFor="submit-release-notes"
              className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              Release Notes{" "}
              <span className="font-normal normal-case text-slate-500">
                (Optional — included in auto keccak256 digest)
              </span>
            </label>
            <textarea
              id="submit-release-notes"
              rows={3}
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              placeholder="Summarize artifacts delivered, test coverage, or commit verification instructions..."
              className="w-full resize-none rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
            />
          </div>

          {/* Hash Mode Toggle & Digest Preview */}
          <div className="rounded-xl border border-hairline bg-canvas/80 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
                <Hash className="h-3.5 w-3.5 text-ice-400" />
                Deliverable Proof Hash (keccak256)
              </span>
              <button
                type="button"
                onClick={() => {
                  setUseCustomHash((prev) => !prev);
                  setError(null);
                }}
                className="font-mono text-[11px] text-ice-400 underline-offset-2 transition-colors hover:text-ice hover:underline"
              >
                {useCustomHash ? "Use Auto-Computed Hash" : "Paste Custom 0x Hash"}
              </button>
            </div>

            {useCustomHash ? (
              <input
                type="text"
                value={customHash}
                onChange={(e) => {
                  setCustomHash(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="0x0000... (64 hex characters)"
                className="mt-2.5 w-full rounded-lg border border-hairline bg-surface px-3 py-2 font-mono text-[11px] text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
              />
            ) : (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface/90 px-3 py-2">
                <code className="truncate font-mono text-[11px] text-teal-400">
                  {activeHash}
                </code>
                <span className="shrink-0 rounded border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-teal-400">
                  AUTO
                </span>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-300">
              {error}
            </p>
          )}

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
              className="inline-flex items-center gap-2 rounded-xl border border-ice/40 bg-ice/15 px-4 py-2 text-xs font-semibold text-ice-400 shadow-[0_0_20px_rgba(56,189,248,0.16)] transition-colors hover:bg-ice/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Submitting Proof...
                </>
              ) : (
                <>
                  <FileCode2 className="h-3.5 w-3.5" />
                  Submit Deliverable On-Chain
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
/* 2. Approve Milestone Modal                                                 */
/* -------------------------------------------------------------------------- */

interface ApproveMilestoneModalProps {
  projectId: number;
  milestone: MilestoneRecord | null;
  freelancerAddress: Address;
  freelancerName: string;
  feeBps: number;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (milestoneIndex: number) => void;
}

export function ApproveMilestoneModal({
  projectId,
  milestone,
  freelancerAddress,
  freelancerName,
  feeBps,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: ApproveMilestoneModalProps) {
  const [copiedAddr, setCopiedAddr] = useState(false);

  const settlement = useMemo(() => {
    if (!milestone) {
      return { gross: 0n, fee: 0n, payout: 0n, payoutPct: "99", feePct: "1" };
    }
    const bps = BigInt(feeBps);
    const fee = (milestone.amount * bps) / 10_000n;
    const payout = milestone.amount - fee;
    const feePct = (feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 2);
    const payoutPct = ((10_000 - feeBps) / 100).toFixed(
      feeBps % 100 === 0 ? 0 : 2
    );
    return { gross: milestone.amount, fee, payout, payoutPct, feePct };
  }, [milestone, feeBps]);

  function handleCopyAddress() {
    if (!freelancerAddress) return;
    void navigator.clipboard.writeText(freelancerAddress);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 1600);
  }

  return (
    <ModalFrame
      isOpen={isOpen && milestone !== null}
      onClose={onClose}
      title="Approve & Release Escrow"
      subtitle={
        milestone
          ? `ProjectManager.approveMilestone(#TRL-${projectId}, M${milestone.index})`
          : undefined
      }
      icon={<ShieldCheck className="h-4 w-4" />}
      accent="copper"
    >
      {milestone && (
        <div className="space-y-4">
          {/* Milestone Context */}
          <div className="rounded-xl border border-hairline bg-canvas/80 p-3.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              Milestone M{milestone.index} • Deliverable Verified
            </span>
            <h4 className="mt-0.5 font-display text-sm font-semibold text-slate-100">
              {milestone.title}
            </h4>
            {milestone.deliverableHash && (
              <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                Hash:{" "}
                <span className="text-teal-400">
                  {shortenHash(milestone.deliverableHash, 10, 8)}
                </span>
              </p>
            )}
          </div>

          {/* Exact On-Chain Settlement Breakdown */}
          <div className="space-y-2.5 rounded-xl border border-hairline bg-canvas/90 p-4 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Gross Milestone Amount</span>
              <span className="font-semibold tabular-nums text-slate-100">
                {formatTUSD8(settlement.gross)} tUSD8
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">
                Protocol Fee ({settlement.feePct}% snapshotted)
              </span>
              <span className="tabular-nums text-slate-400">
                -{formatTUSD8(settlement.fee)} tUSD8
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-hairline pt-2.5">
              <span className="font-medium text-slate-200">
                Freelancer Payout ({settlement.payoutPct}%)
              </span>
              <span className="text-sm font-bold tabular-nums text-teal-400">
                {formatTUSD8(settlement.payout)} tUSD8
              </span>
            </div>
          </div>

          {/* Recipient Wallet */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-elevated/60 px-3.5 py-2.5">
            <div className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                Recipient ({freelancerName})
              </span>
              <span className="font-mono text-xs text-slate-100">
                {shortenAddress(freelancerAddress, 8, 6)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-copper/40 hover:text-slate-100"
            >
              {copiedAddr ? (
                <>
                  <Check className="h-3 w-3 text-teal-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Releasing funds is irreversible on-chain via{" "}
            <span className="font-mono text-slate-300">MilestoneEscrow</span>{" "}
            and unlocks bilateral ERC-8004 reputation ratings for this tranche.
          </p>

          <div className="flex items-center justify-end gap-2.5 border-t border-hairline pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-hairline bg-elevated px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-elevated/80 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => onConfirm(milestone.index)}
              className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-canvas shadow-[0_0_24px_rgba(234,122,61,0.28)] transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Releasing Escrow...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirm Approval &amp; Release tUSD8
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Open Dispute Modal                                                      */
/* -------------------------------------------------------------------------- */

interface OpenDisputeModalProps {
  projectId: number;
  milestone: MilestoneRecord | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (
    milestoneIndex: number,
    evidenceHash: `0x${string}`,
    evidenceURI: string
  ) => void;
}

export function OpenDisputeModal({
  projectId,
  milestone,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: OpenDisputeModalProps) {
  const [reason, setReason] = useState("");
  const [evidenceMode, setEvidenceMode] = useState<"AUTO_JSON" | "CUSTOM_URI">(
    "AUTO_JSON"
  );
  const [customEvidenceURI, setCustomEvidenceURI] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setEvidenceMode("AUTO_JSON");
      setCustomEvidenceURI("");
      setError(null);
    }
  }, [isOpen, milestone?.index]);

  const effectiveEvidenceURI = useMemo(() => {
    if (evidenceMode === "CUSTOM_URI") {
      return customEvidenceURI.trim();
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason || !milestone) return "";
    return buildJsonDataUri({
      projectId,
      milestoneIndex: milestone.index,
      milestoneTitle: milestone.title,
      summary: trimmedReason,
      submittedAt: new Date().toISOString(),
    });
  }, [evidenceMode, customEvidenceURI, reason, milestone, projectId]);

  const evidenceHash = useMemo<`0x${string}`>(() => {
    if (!effectiveEvidenceURI) return ZERO_BYTES32;
    return keccak256(toHex(effectiveEvidenceURI));
  }, [effectiveEvidenceURI]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!milestone) return;

    if (!reason.trim()) {
      setError("Please provide a concise dispute reason or summary.");
      return;
    }

    if (evidenceMode === "CUSTOM_URI") {
      const uri = customEvidenceURI.trim();
      if (!uri) {
        setError("Please enter an Evidence Bundle URI (ipfs:// or https://).");
        return;
      }
      if (
        !uri.startsWith("ipfs://") &&
        !uri.startsWith("https://") &&
        !uri.startsWith("data:")
      ) {
        setError("Evidence URI must start with ipfs://, https://, or data:.");
        return;
      }
    }

    if (!effectiveEvidenceURI || evidenceHash === ZERO_BYTES32) {
      setError("Unable to compute evidence bundle hash.");
      return;
    }

    setError(null);
    onConfirm(milestone.index, evidenceHash, effectiveEvidenceURI);
  }

  return (
    <ModalFrame
      isOpen={isOpen && milestone !== null}
      onClose={onClose}
      title="Open AI Arbiter Dispute"
      subtitle={
        milestone
          ? `DisputeResolution.openDispute(#TRL-${projectId}, M${milestone.index})`
          : undefined
      }
      icon={<Scale className="h-4 w-4" />}
      accent="rose"
    >
      {milestone && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* AI Arbiter Protocol Info Banner */}
          <div className="flex items-start gap-3 rounded-xl border border-ice/25 bg-ice/5 p-3.5">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-ice-400" />
            <p className="text-xs leading-relaxed text-slate-300">
              Assigns{" "}
              <span className="font-semibold text-slate-100">
                3 conflict-free ERC-8004 AI Arbiters
              </span>{" "}
              (2-of-3 quorum, 1-hour voting window, immutable{" "}
              <span className="font-mono text-ice-400">ValidationRegistry</span>{" "}
              proofs).
            </p>
          </div>

          {/* Disputed Milestone Summary */}
          <div className="flex items-center justify-between rounded-xl border border-hairline bg-canvas/80 px-3.5 py-2.5">
            <div className="min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-wider text-rose-400">
                Escrow Freeze Target • M{milestone.index}
              </span>
              <p className="truncate text-xs font-medium text-slate-100">
                {milestone.title}
              </p>
            </div>
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-100">
              {formatTUSD8(milestone.amount)}
            </span>
          </div>

          {/* Dispute Reason */}
          <div>
            <label
              htmlFor="dispute-reason-input"
              className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              Dispute Reason / Summary <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="dispute-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Explain the specification discrepancy, missing tests, or missed deadline..."
              className="w-full resize-none rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
            />
          </div>

          {/* Evidence Bundle URI Mode */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
                Evidence Bundle URI
              </span>
              <div className="inline-flex rounded-lg border border-hairline bg-canvas p-0.5 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceMode("AUTO_JSON");
                    if (error) setError(null);
                  }}
                  className={`rounded-md px-2 py-1 transition-colors ${
                    evidenceMode === "AUTO_JSON"
                      ? "bg-elevated text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Auto-Build JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceMode("CUSTOM_URI");
                    if (error) setError(null);
                  }}
                  className={`rounded-md px-2 py-1 transition-colors ${
                    evidenceMode === "CUSTOM_URI"
                      ? "bg-elevated text-slate-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  IPFS / HTTPS
                </button>
              </div>
            </div>

            {evidenceMode === "CUSTOM_URI" ? (
              <input
                type="text"
                value={customEvidenceURI}
                onChange={(e) => {
                  setCustomEvidenceURI(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="ipfs://bafybeig.../evidence-bundle.json"
                className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-rose-400/60 focus:outline-none focus:ring-1 focus:ring-rose-400/40"
              />
            ) : (
              <div className="rounded-xl border border-hairline bg-canvas/80 px-3.5 py-2.5 font-mono text-[11px] text-slate-400">
                {effectiveEvidenceURI
                  ? `${effectiveEvidenceURI.slice(0, 62)}...`
                  : "Enter a dispute summary above to auto-encode data:application/json;base64,..."}
              </div>
            )}
          </div>

          {/* Evidence Hash Preview */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-hairline bg-canvas/80 px-3.5 py-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              evidenceHash
            </span>
            <code className="truncate font-mono text-[11px] text-rose-300">
              {shortenHash(evidenceHash, 12, 10)}
            </code>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-300">
              {error}
            </p>
          )}

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
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/45 bg-rose-500/15 px-4 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Assigning Arbiters...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Escalate to AI Arbiter Panel
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
/* 4. Rate Counterparty Modal                                                 */
/* -------------------------------------------------------------------------- */

interface RateCounterpartyModalProps {
  projectId: number;
  milestone: MilestoneRecord | null;
  targetAgentId: number;
  targetRole: "Client" | "Freelancer";
  targetName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (
    milestoneIndex: number,
    score: number,
    commentURI: string,
    commentHash: `0x${string}`
  ) => void;
}

export function RateCounterpartyModal({
  projectId,
  milestone,
  targetAgentId,
  targetRole,
  targetName,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: RateCounterpartyModalProps) {
  const [score, setScore] = useState(95);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (isOpen) {
      setScore(95);
      setComment("");
    }
  }, [isOpen, milestone?.index, targetAgentId]);

  const starRating = (score / 20).toFixed(1);

  const scoreToneClass =
    score >= 80
      ? "border-teal-500/35 bg-teal-500/10 text-teal-400"
      : score >= 50
        ? "border-copper/40 bg-copper/10 text-copper-400"
        : "border-rose-500/35 bg-rose-500/10 text-rose-400";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!milestone) return;

    const trimmedComment = comment.trim();
    const commentURI = trimmedComment
      ? buildJsonDataUri({
          projectId,
          milestoneIndex: milestone.index,
          targetAgentId,
          score,
          comment: trimmedComment,
          ratedAt: new Date().toISOString(),
        })
      : "";

    const commentHash: `0x${string}` = commentURI
      ? keccak256(toHex(commentURI))
      : ZERO_BYTES32;

    onConfirm(milestone.index, score, commentURI, commentHash);
  }

  return (
    <ModalFrame
      isOpen={isOpen && milestone !== null}
      onClose={onClose}
      title={`Rate ${targetRole} #${targetAgentId}`}
      subtitle={
        milestone
          ? `ProjectManager.rateCounterparty(#TRL-${projectId}, M${milestone.index}, ${score})`
          : undefined
      }
      icon={<Star className="h-4 w-4" />}
      accent="teal"
    >
      {milestone && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Agent Pill */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas/80 p-3.5">
            <div className="min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                ERC-8004 Counterparty • {targetRole} #{targetAgentId}
              </span>
              <h4 className="mt-0.5 truncate font-display text-sm font-semibold text-slate-100">
                {targetName}
              </h4>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold tabular-nums ${scoreToneClass}`}
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              {score}/100 ({starRating} ★)
            </span>
          </div>

          {/* Interactive 0-100 Slider */}
          <div className="rounded-xl border border-hairline bg-canvas/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <label
                htmlFor="reputation-score-slider"
                className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
              >
                Reputation Score (0–100)
              </label>
              <span className="font-mono text-xs text-slate-400">
                {score >= 90
                  ? "Exceptional"
                  : score >= 75
                    ? "Strong"
                    : score >= 50
                      ? "Acceptable"
                      : "Subpar"}
              </span>
            </div>

            <input
              id="reputation-score-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-elevated accent-copper"
            />

            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
              <span>0 (0.0 ★)</span>
              <span>50 (2.5 ★)</span>
              <span>100 (5.0 ★)</span>
            </div>
          </div>

          {/* Optional Review Comment */}
          <div>
            <label
              htmlFor="reputation-comment"
              className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              Review Note{" "}
              <span className="font-normal normal-case text-slate-500">
                (Optional — auto-encoded to commentURI + keccak256)
              </span>
            </label>
            <textarea
              id="reputation-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Communication speed, deliverable quality, adherence to specification..."
              className="w-full resize-none rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400/60 focus:outline-none focus:ring-1 focus:ring-teal-400/40"
            />
          </div>

          {/* Sybil-Resistant Note */}
          <div className="flex items-start gap-2.5 rounded-xl border border-teal-500/25 bg-teal-500/5 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-300">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
            <span>
              Sybil-resistant &amp; payment-gated: recorded permanently in{" "}
              <span className="font-mono text-teal-400">ReputationRegistry</span>{" "}
              only after verified milestone settlement.
            </span>
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
                  Recording Rating...
                </>
              ) : (
                <>
                  <Star className="h-3.5 w-3.5" />
                  Submit On-Chain Rating
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
