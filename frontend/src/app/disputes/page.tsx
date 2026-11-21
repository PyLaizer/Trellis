import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";

export default function DisputesPage() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-8">
      <div className="lattice-bg rounded-2xl border border-hairline bg-surface p-8 sm:p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10">
            <Scale className="h-5 w-5 text-rose-400" />
          </div>
          <div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-rose-400">
              DisputeResolution &amp; AI Arbiters • Stage 2D
            </span>
            <h1 className="font-display text-2xl font-bold text-slate-50">
              AI Arbitration &amp; 2-of-3 Quorum Console
            </h1>
          </div>
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
          Inspect active escrow disputes, review submitted evidence hashes,
          trigger AI arbiter evaluations, and verify Dilithium-3 quorum
          resolutions.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-400">
            Coming in Stage 2D
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated px-3.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-copper/40 hover:text-copper-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
