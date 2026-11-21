import Link from "next/link";
import { AEVUM_EXPLORER_URL } from "@/lib/contracts/addresses";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-hairline bg-canvas/90">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-center sm:text-left">
          <span className="font-display font-semibold text-slate-200">
            Trellis Protocol
          </span>
          <span className="text-slate-600">•</span>
          <span>
            Post-Quantum Lattice Escrow &amp; ERC-8004 Verification
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
          <Link
            href="/projects"
            className="transition-colors hover:text-copper-400"
          >
            Smart Contracts
          </Link>
          <Link
            href="/disputes"
            className="transition-colors hover:text-copper-400"
          >
            Arbiter Consensus
          </Link>
          <a
            href={AEVUM_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-copper-400"
          >
            Aevum Explorer
          </a>
          <span className="rounded-md border border-hairline bg-surface px-2 py-0.5 font-mono text-[10px] tracking-wider text-ice-400">
            AEVUM-TESTNET
          </span>
        </div>
      </div>
    </footer>
  );
}
