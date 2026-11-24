"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileCode2,
  Hash,
  ShieldCheck,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import { hexToString } from "viem";
import {
  CONTRACT_ADDRESSES,
  IS_PROTOCOL_DEPLOYED,
} from "@/lib/contracts/addresses";
import { explorerAddressUrl, shortenHash } from "@/lib/format";
import {
  ZERO_BYTES32,
  type ArbiterSeatRecord,
  type DisputeRecord,
} from "@/lib/mockDisputesData";

interface ProofInspectorModalProps {
  dispute: DisputeRecord | null;
  initialArbiterAgentId?: number | null;
  onClose: () => void;
}

function tryDecodeProofHex(proofHex: `0x${string}`): {
  decoded: string | null;
  isJson: boolean;
} {
  if (!proofHex || proofHex === "0x" || proofHex.length < 4) {
    return { decoded: null, isJson: false };
  }
  try {
    const text = hexToString(proofHex);
    // Verify mostly printable ASCII/UTF-8
    const printable = /^[\x20-\x7E\r\n\t]+$/.test(text);
    if (!printable) return { decoded: null, isJson: false };

    try {
      const parsed: unknown = JSON.parse(text);
      return {
        decoded: JSON.stringify(parsed, null, 2),
        isJson: true,
      };
    } catch {
      return { decoded: text, isJson: false };
    }
  } catch {
    return { decoded: null, isJson: false };
  }
}

function formatResponseCode(code: number): string {
  if (code === 1) return "1 = ReleaseToFreelancer";
  if (code === 2) return "2 = RefundToClient";
  return "0 = Pending / No Verdict";
}

function formatVoteTime(unixSec: number): string {
  if (!unixSec || unixSec <= 0) return "Awaiting submission";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(unixSec * 1000));
}

export function ProofInspectorModal({
  dispute,
  initialArbiterAgentId = null,
  onClose,
}: ProofInspectorModalProps) {
  const [selectedArbiterId, setSelectedArbiterId] = useState<number | null>(
    initialArbiterAgentId
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!dispute) return;
    if (
      initialArbiterAgentId !== null &&
      dispute.arbiters.some((a) => a.arbiterAgentId === initialArbiterAgentId)
    ) {
      setSelectedArbiterId(initialArbiterAgentId);
    } else {
      const firstVoted = dispute.arbiters.find((a) => a.ruling !== 0);
      setSelectedArbiterId(
        firstVoted
          ? firstVoted.arbiterAgentId
          : dispute.arbiters[0].arbiterAgentId
      );
    }
  }, [dispute, initialArbiterAgentId]);

  useEffect(() => {
    if (!dispute) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispute, onClose]);

  const activeSeat: ArbiterSeatRecord | null = useMemo(() => {
    if (!dispute) return null;
    return (
      dispute.arbiters.find((a) => a.arbiterAgentId === selectedArbiterId) ??
      dispute.arbiters[0]
    );
  }, [dispute, selectedArbiterId]);

  const decodedProof = useMemo(
    () =>
      activeSeat
        ? tryDecodeProofHex(activeSeat.proofHex)
        : { decoded: null, isJson: false },
    [activeSeat]
  );

  function copyValue(key: string, value: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  }

  const explorerTarget = IS_PROTOCOL_DEPLOYED
    ? explorerAddressUrl(CONTRACT_ADDRESSES.ValidationRegistry)
    : explorerAddressUrl(CONTRACT_ADDRESSES.tUSD8);

  return (
    <AnimatePresence>
      {dispute && activeSeat && (
        <motion.div
          key="proof-inspector-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-md"
        >
          <motion.div
            key="proof-inspector-dialog"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-hairline bg-elevated/50 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-ice/30 bg-ice/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ice">
                    <ShieldCheck className="h-3 w-3" />
                    ERC-8004 ValidationRegistry Proof
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {dispute.code} • Project #{dispute.projectId} M
                    {dispute.milestoneIndex}
                  </span>
                </div>
                <h2 className="mt-1.5 font-display text-xl font-bold text-slate-50">
                  zkML / TEE Attestation Inspector
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close proof inspector"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface text-slate-400 transition-colors hover:border-copper/40 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Arbiter Panel Switcher (inspect 1 or all 3 proofs) */}
            <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-canvas/40 px-6 py-3">
              <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                Tribunal Seat:
              </span>
              {dispute.arbiters.map((seat) => {
                const isSelected =
                  seat.arbiterAgentId === activeSeat.arbiterAgentId;
                return (
                  <button
                    key={seat.arbiterAgentId}
                    type="button"
                    onClick={() => setSelectedArbiterId(seat.arbiterAgentId)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? "border-ice/50 bg-ice/15 text-ice shadow-ice-glow"
                        : "border-hairline bg-surface text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    <span className="font-mono text-[11px] font-semibold">
                      #{seat.arbiterAgentId}
                    </span>
                    <span>{seat.name}</span>
                    {seat.validationStatus === "Approved" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                    )}
                    {seat.validationStatus === "Pending" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                    {seat.validationStatus === "Rejected" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Top Metadata Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-hairline bg-canvas/60 p-3.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Arbiter Agent
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-ice/30 bg-ice/10 font-mono text-xs font-bold text-ice">
                      {activeSeat.monogram}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {activeSeat.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400">
                        Agent #{activeSeat.arbiterAgentId} • Rep{" "}
                        {activeSeat.reputationScore}/100
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-hairline bg-canvas/60 p-3.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    ValidationStatus
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {activeSeat.validationStatus === "Approved" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-teal-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approved
                      </span>
                    )}
                    {activeSeat.validationStatus === "Pending" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-400">
                        <Clock className="h-3.5 w-3.5" />
                        Pending
                      </span>
                    )}
                    {activeSeat.validationStatus === "Rejected" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-rose-400">
                        <XCircle className="h-3.5 w-3.5" />
                        Rejected / Expired
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-slate-500">
                    {formatVoteTime(activeSeat.votedAt)}
                  </div>
                </div>

                <div className="rounded-xl border border-hairline bg-canvas/60 p-3.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Response Code
                  </div>
                  <div
                    className={`mt-2 font-mono text-xs font-semibold ${
                      activeSeat.responseCode === 1
                        ? "text-teal-400"
                        : activeSeat.responseCode === 2
                          ? "text-rose-400"
                          : "text-amber-400"
                    }`}
                  >
                    {formatResponseCode(activeSeat.responseCode)}
                  </div>
                  {activeSeat.blockNumber !== undefined && (
                    <div className="mt-1.5 font-mono text-[11px] text-slate-500">
                      Block #{activeSeat.blockNumber.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Cryptographic Identifiers */}
              <div className="space-y-2.5 rounded-xl border border-hairline bg-canvas/50 p-4">
                {/* Validation Request ID */}
                <div className="flex flex-col justify-between gap-1.5 sm:flex-row sm:items-center">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <Hash className="h-3.5 w-3.5 text-ice" />
                    Validation Request ID
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-surface px-2 py-0.5 font-mono text-xs text-slate-200">
                      {shortenHash(activeSeat.validationRequestId, 14, 10)}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        copyValue("reqId", activeSeat.validationRequestId)
                      }
                      className="rounded-md border border-hairline bg-surface p-1 text-slate-400 transition-colors hover:border-ice/40 hover:text-ice"
                      title="Copy Validation Request ID"
                    >
                      {copiedKey === "reqId" ? (
                        <Check className="h-3.5 w-3.5 text-teal-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Reasoning Hash */}
                <div className="flex flex-col justify-between gap-1.5 border-t border-hairline/70 pt-2.5 sm:flex-row sm:items-center">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <Hash className="h-3.5 w-3.5 text-copper" />
                    reasoningHash (keccak256)
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-surface px-2 py-0.5 font-mono text-xs text-slate-200">
                      {activeSeat.reasoningHash === ZERO_BYTES32
                        ? "0x0000...0000 (Pending)"
                        : shortenHash(activeSeat.reasoningHash, 14, 10)}
                    </code>
                    {activeSeat.reasoningHash !== ZERO_BYTES32 && (
                      <button
                        type="button"
                        onClick={() =>
                          copyValue("reasonHash", activeSeat.reasoningHash)
                        }
                        className="rounded-md border border-hairline bg-surface p-1 text-slate-400 transition-colors hover:border-copper/40 hover:text-copper"
                        title="Copy reasoningHash"
                      >
                        {copiedKey === "reasonHash" ? (
                          <Check className="h-3.5 w-3.5 text-teal-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Proof URI */}
                <div className="flex flex-col justify-between gap-1.5 border-t border-hairline/70 pt-2.5 sm:flex-row sm:items-center">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <FileCode2 className="h-3.5 w-3.5 text-teal-400" />
                    proofURI
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <code className="max-w-[340px] truncate rounded bg-surface px-2 py-0.5 font-mono text-xs text-slate-200">
                      {activeSeat.proofURI || "Not yet submitted"}
                    </code>
                    {activeSeat.proofURI && (
                      <button
                        type="button"
                        onClick={() =>
                          copyValue("proofUri", activeSeat.proofURI)
                        }
                        className="shrink-0 rounded-md border border-hairline bg-surface p-1 text-slate-400 transition-colors hover:border-teal-400/40 hover:text-teal-400"
                        title="Copy proofURI"
                      >
                        {copiedKey === "proofUri" ? (
                          <Check className="h-3.5 w-3.5 text-teal-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Reasoning Summary */}
              <div className="rounded-xl border border-hairline bg-elevated/40 p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Arbiter Reasoning Summary
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {activeSeat.reasoningSummary ||
                    "No verdict submitted yet. Awaiting AI arbiter cryptographic evaluation and ValidationRegistry attestation."}
                </p>
              </div>

              {/* Opaque Proof Bytes & Decoded Preview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    <Terminal className="h-3.5 w-3.5 text-ice" />
                    Opaque Proof Payload (bytes)
                  </span>
                  {activeSeat.proofHex !== "0x" && (
                    <button
                      type="button"
                      onClick={() => copyValue("proofHex", activeSeat.proofHex)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-elevated px-2.5 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:border-ice/40 hover:text-ice"
                    >
                      {copiedKey === "proofHex" ? (
                        <>
                          <Check className="h-3 w-3 text-teal-400" />
                          Copied Hex
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy Raw Hex
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="max-h-28 overflow-y-auto break-all rounded-xl border border-hairline bg-canvas p-3.5 font-mono text-[11px] leading-relaxed text-slate-400">
                  {activeSeat.proofHex !== "0x"
                    ? activeSeat.proofHex
                    : "0x (empty — awaiting arbiter attestation)"}
                </div>

                {decodedProof.decoded && (
                  <div className="rounded-xl border border-ice/25 bg-ice/5 p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ice">
                        Decoded {decodedProof.isJson ? "JSON" : "UTF-8"}{" "}
                        Attestation Envelope
                      </span>
                      <span className="font-mono text-[10px] text-teal-400">
                        UTF-8 Readable
                      </span>
                    </div>
                    <pre className="max-h-44 overflow-auto font-mono text-xs leading-relaxed text-slate-200">
                      {decodedProof.decoded}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-elevated/40 px-6 py-4">
              <a
                href={explorerTarget}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-ice transition-colors hover:text-ice-400 hover:underline"
              >
                Verify on Aevum Explorer
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hairline bg-surface px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
              >
                Close Inspector
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
