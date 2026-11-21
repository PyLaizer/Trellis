import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-8">
      <div className="lattice-bg rounded-2xl border border-hairline bg-surface p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <LayoutGrid className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
              ProjectManager &amp; MilestoneEscrow • Stage 2C
            </span>
            <h1 className="font-display text-2xl font-bold text-slate-50">
              Escrow Projects &amp; Milestone Vaults
            </h1>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
          Create milestone-gated tUSD8 escrow projects, submit freelancer
          applications, deliver cryptographic work proofs, and approve milestone
          releases on-chain.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-400">
            Coming in Stage 2C
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
