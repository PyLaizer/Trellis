"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileJson,
  Link2,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { stringToHex } from "viem";
import {
  AGENT_ROLE_LABELS,
  ERC8004_REGISTRATION_TYPE,
  buildAgentCardDataUri,
  formatPassportDate,
  parseAgentCardUri,
  roleMonogram,
  type AgentCardPayload,
} from "@/lib/agentCard";
import { CONTRACT_ADDRESSES } from "@/lib/contracts/addresses";
import { explorerAddressUrl, shortenAddress } from "@/lib/format";
import type { PassportRecord } from "@/lib/mockIdentityData";

interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  accent?: "copper" | "ice";
  maxWidthClass?: string;
  children: ReactNode;
}

function ModalFrame({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  accent = "copper",
  maxWidthClass = "max-w-lg",
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
            className={`relative z-10 w-full ${maxWidthClass} overflow-hidden rounded-2xl border border-hairline bg-surface shadow-2xl`}
          >
            {/* Top Accent Line */}
            <div
              className={`h-0.5 w-full ${
                accent === "ice"
                  ? "bg-gradient-to-r from-ice/20 via-ice-400 to-ice/20"
                  : "bg-gradient-to-r from-copper/20 via-copper to-copper/20"
              }`}
            />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                    accent === "ice"
                      ? "border-ice/30 bg-ice/10 text-ice-400"
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
/* 1. Update Agent Card URI Modal                                             */
/* -------------------------------------------------------------------------- */

interface UpdateUriModalProps {
  passport: PassportRecord | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (agentId: number, newURI: string) => void;
}

export function UpdateUriModal({
  passport,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: UpdateUriModalProps) {
  const [uriValue, setUriValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (passport && isOpen) {
      setUriValue(passport.agentURI);
      setError(null);
    }
  }, [passport, isOpen]);

  function handleQuickReencode() {
    if (!passport) return;
    const payload: AgentCardPayload = {
      type: ERC8004_REGISTRATION_TYPE,
      name: passport.displayName,
      description: passport.description,
      role: AGENT_ROLE_LABELS[passport.role],
      services: passport.endpoint
        ? [{ name: passport.role === 2 ? "MCP" : "A2A", endpoint: passport.endpoint }]
        : [],
      wallet: passport.owner,
    };
    setUriValue(buildAgentCardDataUri(payload));
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passport) return;
    const trimmed = uriValue.trim();
    if (!trimmed) {
      setError("Agent Card URI cannot be empty.");
      return;
    }
    setError(null);
    onSubmit(passport.agentId, trimmed);
  }

  return (
    <ModalFrame
      isOpen={isOpen && passport !== null}
      onClose={onClose}
      title="Update Agent Card URI"
      subtitle={
        passport
          ? `IdentityRegistry.setAgentURI(#${passport.agentId}) • ${passport.displayName}`
          : undefined
      }
      icon={<Link2 className="h-4 w-4" />}
      accent={passport?.role === 2 ? "ice" : "copper"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="update-uri-input"
              className="font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300"
            >
              New Agent Card URI
            </label>
            <button
              type="button"
              onClick={handleQuickReencode}
              className="inline-flex items-center gap-1 rounded-md border border-ice/30 bg-ice/10 px-2 py-0.5 font-mono text-[10px] font-medium text-ice-400 transition-colors hover:bg-ice/20"
            >
              <Sparkles className="h-3 w-3" />
              Re-encode ERC-8004 JSON
            </button>
          </div>
          <textarea
            id="update-uri-input"
            rows={4}
            value={uriValue}
            onChange={(e) => {
              setUriValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="ipfs://bafybeig... or https://... or data:application/json;base64,..."
            className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-copper/60 focus:outline-none focus:ring-1 focus:ring-copper/40"
          />
          {error && (
            <p className="mt-1.5 font-mono text-[11px] text-rose-400">{error}</p>
          )}
          <p className="mt-1.5 text-xs text-slate-400">
            Supports <span className="font-mono text-slate-300">ipfs://</span>,{" "}
            <span className="font-mono text-slate-300">https://</span>, or inline{" "}
            <span className="font-mono text-slate-300">
              data:application/json;base64,
            </span>{" "}
            ERC-8004 registration cards.
          </p>
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
                Updating URI...
              </>
            ) : (
              "Save Agent URI"
            )}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Set On-Chain Metadata Modal                                             */
/* -------------------------------------------------------------------------- */

const METADATA_PRESETS: readonly { key: string; placeholder: string }[] = [
  { key: "model", placeholder: "dilithium-verifier-v1" },
  { key: "specialization", placeholder: "defi-security-audits" },
  { key: "github", placeholder: "github.com/0xlaizer" },
  { key: "dilithium_pk", placeholder: "mldsa65:0x9f2a...4b1c" },
];

interface SetMetadataModalProps {
  passport: PassportRecord | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (agentId: number, key: string, value: string) => void;
}

export function SetMetadataModal({
  passport,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: SetMetadataModalProps) {
  const [metaKey, setMetaKey] = useState("model");
  const [metaValue, setMetaValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (passport && isOpen) {
      setMetaKey(passport.role === 2 ? "model" : "specialization");
      setMetaValue("");
      setError(null);
    }
  }, [passport, isOpen]);

  const encodedHex = metaValue.trim() ? stringToHex(metaValue.trim()) : "0x";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passport) return;
    const cleanKey = metaKey.trim();
    const cleanValue = metaValue.trim();
    if (!cleanKey) {
      setError("Metadata key is required.");
      return;
    }
    if (!cleanValue) {
      setError("Metadata value is required.");
      return;
    }
    setError(null);
    onSubmit(passport.agentId, cleanKey, cleanValue);
  }

  return (
    <ModalFrame
      isOpen={isOpen && passport !== null}
      onClose={onClose}
      title="Set On-Chain Metadata"
      subtitle={
        passport
          ? `IdentityRegistry.setMetadata(#${passport.agentId}, key, bytes)`
          : undefined
      }
      icon={<Database className="h-4 w-4" />}
      accent="ice"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preset key chips */}
        <div>
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Quick Key Presets
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {METADATA_PRESETS.map((preset) => {
              const active = metaKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    setMetaKey(preset.key);
                    if (!metaValue) setMetaValue(preset.placeholder);
                  }}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    active
                      ? "border-ice/40 bg-ice/15 text-ice-400"
                      : "border-hairline bg-canvas text-slate-400 hover:border-ice/30 hover:text-slate-200"
                  }`}
                >
                  {preset.key}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="meta-key-input"
              className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-slate-300"
            >
              Metadata Key
            </label>
            <input
              id="meta-key-input"
              type="text"
              value={metaKey}
              onChange={(e) => {
                setMetaKey(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. model"
              className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
            />
          </div>

          <div>
            <label
              htmlFor="meta-value-input"
              className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-slate-300"
            >
              Value (UTF-8)
            </label>
            <input
              id="meta-value-input"
              type="text"
              value={metaValue}
              onChange={(e) => {
                setMetaValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. dilithium-verifier-v1"
              className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-ice/60 focus:outline-none focus:ring-1 focus:ring-ice/40"
            />
          </div>
        </div>

        {/* Encoded bytes preview */}
        <div className="rounded-xl border border-hairline bg-canvas/80 p-3">
          <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="h-3 w-3 text-ice-400" />
              ABI-Encoded Bytes (`stringToHex`)
            </span>
            <span>{Math.max(0, (encodedHex.length - 2) / 2)} bytes</span>
          </div>
          <p className="mt-1.5 break-all font-mono text-[11px] text-ice-400/90">
            {encodedHex}
          </p>
        </div>

        {error && (
          <p className="font-mono text-[11px] text-rose-400">{error}</p>
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
            className="inline-flex items-center gap-2 rounded-xl bg-copper px-4 py-2 text-xs font-semibold text-canvas shadow-[0_0_20px_rgba(234,122,61,0.22)] transition-colors hover:bg-copper-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Writing Metadata...
              </>
            ) : (
              "Store On-Chain Metadata"
            )}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. View Agent Card Modal                                                   */
/* -------------------------------------------------------------------------- */

interface ViewAgentCardModalProps {
  passport: PassportRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ViewAgentCardModal({
  passport,
  isOpen,
  onClose,
}: ViewAgentCardModalProps) {
  const [copiedJson, setCopiedJson] = useState(false);

  if (!passport) {
    return null;
  }

  const decoded = parseAgentCardUri(passport.agentURI);
  const resolvedCard: AgentCardPayload = decoded ?? {
    type: ERC8004_REGISTRATION_TYPE,
    name: passport.displayName,
    description: passport.description,
    role: AGENT_ROLE_LABELS[passport.role],
    services: passport.endpoint
      ? [
          {
            name: passport.role === 2 ? "MCP" : "A2A",
            endpoint: passport.endpoint,
          },
        ]
      : [],
    wallet: passport.owner,
  };

  const formattedJson = JSON.stringify(resolvedCard, null, 2);
  const metadataEntries = Object.entries(passport.metadata);
  const isRemoteHttp = passport.agentURI.startsWith("https://");

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  }

  return (
    <ModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={passport.displayName}
      subtitle={`ERC-8004 Passport #${passport.agentId} • ${AGENT_ROLE_LABELS[passport.role]}`}
      icon={<FileJson className="h-4 w-4" />}
      accent={passport.role === 2 ? "ice" : "copper"}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Identity Summary Strip */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-hairline bg-canvas/70 p-3.5 sm:grid-cols-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Passport ID
            </span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-100">
              <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-copper-400">
                {roleMonogram(passport.role, passport.agentId)}
              </span>
              #{passport.agentId}
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Owner
            </span>
            <div className="mt-1 font-mono text-xs text-slate-200">
              {shortenAddress(passport.owner)}
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Status
            </span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  passport.active
                    ? "border-teal-500/35 bg-teal-500/10 text-teal-400"
                    : "border-slate-600/40 bg-slate-800 text-slate-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    passport.active ? "bg-teal-400" : "bg-slate-500"
                  }`}
                />
                {passport.active ? "ACTIVE" : "PAUSED"}
              </span>
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Registered
            </span>
            <div className="mt-1 font-mono text-xs text-slate-200">
              {formatPassportDate(passport.registeredAt)}
            </div>
          </div>
        </div>

        {/* Reputation Bar */}
        <div className="rounded-xl border border-hairline bg-elevated/45 p-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-ice-400" />
              {passport.role === 2 ? "Consensus Accuracy Score" : "On-Chain Trust Score"}
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-100">
              {passport.trustScore}/100{" "}
              <span className="font-normal text-slate-400">
                ({passport.reviewLabel})
              </span>
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas">
            <div
              style={{ width: `${Math.min(100, Math.max(0, passport.trustScore))}%` }}
              className={`h-full rounded-full ${
                passport.role === 2 ? "bg-ice-400" : "bg-copper"
              }`}
            />
          </div>
        </div>

        {/* On-Chain Metadata KV */}
        {metadataEntries.length > 0 && (
          <div>
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              On-Chain Key-Value Metadata
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {metadataEntries.map(([key, val]) => (
                <div
                  key={key}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-canvas px-2.5 py-1 font-mono text-[11px]"
                >
                  <span className="text-slate-400">{key}=</span>
                  <span className="text-ice-400">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ERC-8004 JSON Spec */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              ERC-8004 Agent Registration Card{" "}
              {decoded ? "(Decoded Inline Base64)" : "(Resolved Metadata View)"}
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1 rounded-md border border-hairline bg-elevated px-2 py-1 font-mono text-[10px] text-slate-300 transition-colors hover:border-ice/40 hover:text-ice-400"
            >
              {copiedJson ? (
                <>
                  <Check className="h-3 w-3 text-teal-400" />
                  Copied JSON
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy JSON
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-hairline bg-canvas p-3.5 font-mono text-[11px] leading-relaxed text-slate-200">
            {formattedJson}
          </pre>
        </div>

        {/* Raw URI + Explorer Footer */}
        <div className="flex flex-col justify-between gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Raw Token URI
            </span>
            <p className="truncate font-mono text-[11px] text-slate-300">
              {passport.agentURI}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isRemoteHttp && (
              <a
                href={passport.agentURI}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-hairline bg-elevated px-3 py-2 font-mono text-[11px] text-slate-200 transition-colors hover:border-ice/40 hover:text-ice-400"
              >
                Open URI
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <a
              href={explorerAddressUrl(CONTRACT_ADDRESSES.IdentityRegistry)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-copper/35 bg-copper/10 px-3 py-2 font-mono text-[11px] font-medium text-copper-400 transition-colors hover:bg-copper/20"
            >
              Aevum Explorer
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
