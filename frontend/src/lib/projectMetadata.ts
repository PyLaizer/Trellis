import { TUSD8_DECIMALS } from "@/lib/contracts/addresses";

export type ProjectStatusId = 0 | 1 | 2 | 3;

export type ProjectStatusLabel = "Open" | "Active" | "Completed" | "Cancelled";

export const PROJECT_STATUS_LABELS: Record<ProjectStatusId, ProjectStatusLabel> = {
  0: "Open",
  1: "Active",
  2: "Completed",
  3: "Cancelled",
};

export type MilestoneStatusId = 0 | 1 | 2 | 3 | 4 | 5;

export type MilestoneStatusLabel =
  | "Pending"
  | "Submitted"
  | "Approved"
  | "Disputed"
  | "ResolvedRelease"
  | "ResolvedRefund";

export const MILESTONE_STATUS_LABELS: Record<
  MilestoneStatusId,
  MilestoneStatusLabel
> = {
  0: "Pending",
  1: "Submitted",
  2: "Approved",
  3: "Disputed",
  4: "ResolvedRelease",
  5: "ResolvedRefund",
};

export interface ProjectBriefPayload {
  title: string;
  summary: string;
  category?: string;
  createdAt?: string;
}

export interface MilestoneSpecPayload {
  title: string;
  deliverables?: string;
}

const DATA_URI_PREFIX = "data:application/json;base64,";

/**
 * Browser-safe UTF-8 JSON to `data:application/json;base64,...` encoder
 * without relying on Node's Buffer API.
 */
export function buildJsonDataUri(obj: object): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `${DATA_URI_PREFIX}${base64}`;
}

function decodeJsonDataUri(uri: string): Record<string, unknown> | null {
  if (!uri || !uri.startsWith(DATA_URI_PREFIX)) {
    return null;
  }

  try {
    const base64 = uri.slice(DATA_URI_PREFIX.length);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Decodes a `data:application/json;base64,...` Project Brief URI.
 * Safely returns `null` for remote `ipfs://` or `https://` URIs or malformed payloads.
 */
export function parseProjectBriefUri(uri: string): ProjectBriefPayload | null {
  const record = decodeJsonDataUri(uri);
  if (!record) return null;

  if (typeof record.title !== "string" || !record.title.trim()) {
    return null;
  }

  return {
    title: record.title,
    summary: typeof record.summary === "string" ? record.summary : "",
    category: typeof record.category === "string" ? record.category : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
  };
}

/**
 * Decodes a `data:application/json;base64,...` Milestone Spec URI.
 * Safely returns `null` for remote `ipfs://` or `https://` URIs or malformed payloads.
 */
export function parseMilestoneSpecUri(uri: string): MilestoneSpecPayload | null {
  const record = decodeJsonDataUri(uri);
  if (!record) return null;

  if (typeof record.title !== "string" || !record.title.trim()) {
    return null;
  }

  return {
    title: record.title,
    deliverables:
      typeof record.deliverables === "string" ? record.deliverables : undefined,
  };
}

/**
 * Converts a decimal string like "1500.50" into 6-decimal tUSD8 `bigint`.
 * Returns `0n` on empty, negative, or invalid input.
 */
export function parseTUSD8Input(raw: string): bigint {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return 0n;
  if (!/^\d+(\.\d*)?$/.test(cleaned)) return 0n;

  const [wholePart, fracPart = ""] = cleaned.split(".");
  const paddedFrac = fracPart
    .slice(0, TUSD8_DECIMALS)
    .padEnd(TUSD8_DECIMALS, "0");

  try {
    return BigInt(wholePart) * 10n ** BigInt(TUSD8_DECIMALS) + BigInt(paddedFrac);
  } catch {
    return 0n;
  }
}

/**
 * Converts a `YYYY-MM-DD` date input string into an end-of-day UTC Unix timestamp `bigint`.
 * Returns `0n` if invalid.
 */
export function dateInputToUnix(dateStr: string): bigint {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return 0n;

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return 0n;
  }

  const ms = Date.UTC(year, month - 1, day, 23, 59, 59);
  if (!Number.isFinite(ms) || ms <= 0) return 0n;

  return BigInt(Math.floor(ms / 1000));
}

export function toProjectStatusId(value: number): ProjectStatusId {
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 0;
}

export function toMilestoneStatusId(value: number): MilestoneStatusId {
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  if (value === 4) return 4;
  if (value === 5) return 5;
  return 0;
}

/**
 * Formats a Unix timestamp (seconds) into a compact due date string, e.g. "Dec 18, 2026".
 */
export function formatShortDate(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return "TBD";
  }
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
