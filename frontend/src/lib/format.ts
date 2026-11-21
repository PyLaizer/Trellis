import { formatUnits } from "viem";
import {
  AEVUM_EXPLORER_URL,
  TUSD8_DECIMALS,
} from "@/lib/contracts/addresses";

/**
 * Formats a raw 6-decimal tUSD8 bigint into a USD-formatted string, e.g. "$4,500.00".
 */
export function formatTUSD8(amount: bigint, includeDollarSign = true): string {
  const numeric = Number(formatUnits(amount, TUSD8_DECIMALS));
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
  return includeDollarSign ? `$${formatted}` : formatted;
}

/**
 * Formats a standard numeric USD value with 2 decimal places, e.g. "$48,250.00".
 */
export function formatCurrencyNumber(
  value: number,
  includeDollarSign = true
): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return includeDollarSign ? `$${formatted}` : formatted;
}

/**
 * Shortens an EVM address to "0x71C...9A2B".
 */
export function shortenAddress(addr: string, prefixLen = 5, suffixLen = 4): string {
  if (!addr) return "";
  if (addr.length <= prefixLen + suffixLen + 3) return addr;
  return `${addr.slice(0, prefixLen)}...${addr.slice(-suffixLen)}`;
}

/**
 * Shortens a transaction or proof hash to "0x8a4f...3c1e".
 */
export function shortenHash(hash: string, prefixLen = 6, suffixLen = 4): string {
  if (!hash) return "";
  if (hash.length <= prefixLen + suffixLen + 3) return hash;
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
}

export function explorerAddressUrl(addr: string): string {
  return `${AEVUM_EXPLORER_URL}/address/${addr}`;
}

export function explorerTxUrl(hash: string): string {
  return `${AEVUM_EXPLORER_URL}/tx/${hash}`;
}
