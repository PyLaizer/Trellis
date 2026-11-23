export type AgentRoleId = 0 | 1 | 2;

export type AgentRoleLabel = "Client" | "Freelancer" | "Arbiter";

export const AGENT_ROLE_LABELS: Record<AgentRoleId, AgentRoleLabel> = {
  0: "Client",
  1: "Freelancer",
  2: "Arbiter",
};

export const ERC8004_REGISTRATION_TYPE =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;

export interface AgentCardService {
  name: string;
  endpoint: string;
}

export interface AgentCardPayload {
  type: typeof ERC8004_REGISTRATION_TYPE;
  name: string;
  description: string;
  role: AgentRoleLabel;
  services: AgentCardService[];
  wallet?: string;
}

const DATA_URI_PREFIX = "data:application/json;base64,";

/**
 * Encodes an ERC-8004 Agent Card payload into a UTF-8 safe base64 data URI
 * without relying on Node's Buffer API.
 */
export function buildAgentCardDataUri(payload: AgentCardPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `${DATA_URI_PREFIX}${base64}`;
}

/**
 * Synchronously decodes a `data:application/json;base64,...` ERC-8004 Agent Card URI.
 * Returns `null` for remote `ipfs://` or `https://` URIs or malformed payloads.
 */
export function parseAgentCardUri(uri: string): AgentCardPayload | null {
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

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.description !== "string") {
      return null;
    }

    const roleRaw = record.role;
    const role: AgentRoleLabel =
      roleRaw === "Client" || roleRaw === "Freelancer" || roleRaw === "Arbiter"
        ? roleRaw
        : "Client";

    const services: AgentCardService[] = Array.isArray(record.services)
      ? record.services
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as Record<string, unknown>).name === "string" &&
              typeof (item as Record<string, unknown>).endpoint === "string"
          )
          .map((item) => ({
            name: String(item.name),
            endpoint: String(item.endpoint),
          }))
      : [];

    return {
      type: ERC8004_REGISTRATION_TYPE,
      name: record.name,
      description: record.description,
      role,
      services,
      wallet: typeof record.wallet === "string" ? record.wallet : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the UTF-8 byte length of a string (browser-safe).
 */
export function getUtf8ByteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}

/**
 * Formats a Unix timestamp (in seconds) into a concise human-readable passport date.
 */
export function formatPassportDate(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return "Pending";
  }
  const date = new Date(unixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/**
 * Builds a compact passport monogram such as "C1", "F2", or "A5".
 */
export function roleMonogram(role: AgentRoleId, agentId: number): string {
  const prefix = role === 0 ? "C" : role === 1 ? "F" : "A";
  return `${prefix}${agentId}`;
}

/**
 * Converts a raw uint8 role value from Solidity into a typed AgentRoleId.
 */
export function toAgentRoleId(value: number): AgentRoleId {
  if (value === 1) return 1;
  if (value === 2) return 2;
  return 0;
}
