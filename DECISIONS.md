# Trellis — Project Decisions Log

## Project Name: Trellis
## Tagline: Quantum-safe milestone escrow with AI arbitration

---

## Decision Log

| # | Date | Decision | Context | Status |
|---|---|---|---|---|
| 1 | 2026-11-20 | Hybrid approach: PayLock + TrustNet | Combines milestone escrow with AI arbiter dispute resolution for maximum hackathon impact + long-term viability | ✅ Approved |
| 2 | 2026-11-20 | Tech stack: Hardhat + Next.js + wagmi + Tailwind | Battle-tested EVM stack, rapid development | ✅ Approved |
| 3 | 2026-11-20 | 6 smart contracts (3 adapted from ERC-8004 ref, 3 custom) | IdentityRegistry, ReputationRegistry, ValidationRegistry, ProjectManager, MilestoneEscrow, DisputeResolution | ✅ Approved |
| 4 | 2026-11-20 | AI arbiter: architecturally real, demo-simplified | Contracts support real AI agents; hackathon demo uses simulated arbiter script | ✅ Approved |
| 5 | 2026-11-20 | 3-week timeline: Contracts → Frontend → Polish | Week 1: contracts, Week 2: frontend, Week 3: polish/docs/video | ✅ Approved |
| 6 | 2026-11-20 | Git local first; user adds GitHub remote later | User will create remote repo | ✅ Approved |
| 7 | 2026-11-20 | Hardhat 3 + viem (not Hardhat 2 / ethers) | Modern stack; viem shared with wagmi frontend | ✅ Approved |
| 8 | 2026-11-20 | Deployer key entered by user into local `.env` only | Never shared in chat; `.env` gitignored | ✅ Approved |
| 9 | 2026-11-21 | Project renamed to **Trellis** | Ties lattice-based post-quantum security (QDay/Abelian) with staged milestone support; memorable for long-term brand | ✅ Approved |
| 10 | 2026-11-21 | IdentityRegistry allows multiple identity NFTs per wallet | Matches ERC-8004 standard; lets one wallet operate multiple AI arbiter agents or hold Client & Freelancer profiles | ✅ Approved |
| 11 | 2026-11-21 | ReputationRegistry uses 0–100 score scale, gated to authorized Trellis contracts | Matches ERC-8004 convention; strongest Sybil resistance (only ProjectManager & DisputeResolution can record feedback) | ✅ Approved |
| 12 | 2026-11-21 | TypeScript tests with viem + `node:test` | Exercises the exact ABI and viem client calls used by the Next.js frontend | ✅ Approved |
| 13 | 2026-11-21 | Upfront full-project funding in `MilestoneEscrow` | All milestones locked on project creation; gives freelancers verifiable on-chain proof of funds before starting work | ✅ Approved |
| 14 | 2026-11-21 | 1% protocol fee (100 bps, capped at 500 bps, 0% on refunds) | Demonstrates sustainable business model vs 20–30% centralized platforms; 0% fee on client refunds | ✅ Approved |
| 15 | 2026-11-21 | Both open marketplace & direct hire in `ProjectManager` | `freelancerAgentId == 0` allows any active registered Freelancer to accept; `> 0` targets a specific Freelancer | ✅ Approved |
| 16 | 2026-11-21 | Bilateral dispute initiation with client review window | Client can dispute `Submitted` or overdue `Pending`; Freelancer can dispute `Submitted` after configurable review window (default 3 days) | ✅ Approved |
| 17 | 2026-11-21 | 3-arbiter panel (2-of-3 consensus) with conflict-of-interest guard | Pseudo-randomly selected from active ERC-8004 arbiters excluding Client & Freelancer owners | ✅ Approved |
| 18 | 2026-11-21 | Auto-score arbiters in `ReputationRegistry` on consensus | Majority voters receive 100, dissenters receive 25 (tag `arbiter`); every vote & proof also stored in `ValidationRegistry` | ✅ Approved |
| 19 | 2026-11-21 | Testnet dispute timing: `clientReviewPeriod = 300s` (5m), `votingPeriod = 3600s` (1h) | Demo-friendly on Aevum Testnet; admin-adjustable via `setTimingConfig` | ✅ Approved |
| 20 | 2026-11-21 | Visual design system: **Option A — Quantum Lattice Dark** | Obsidian `#070B12` canvas, `#0E1525` surfaces, emerald `#10B981` + cyan `#22D3EE` accents, Space Grotesk / Inter / JetBrains Mono | ✅ Approved |
| 21 | 2026-11-21 | Wallet UX: `wagmi` + `viem` + `@rainbow-me/rainbowkit` | Polished wallet modal + automatic QDay Aevum Testnet (`44005`) chain switcher | ✅ Approved |
| 22 | 2026-11-21 | Automated ABI sync via `scripts/export-abis.ts` | Keeps `frontend/src/lib/contracts/` 100% synced with Hardhat artifacts & `deployments/aevum.json` | ✅ Approved |
| 23 | 2026-11-21 | Dashboard is the landing page (`/`) | Judges & users land directly inside the live dApp with zero extra clicks (matches `Trellis Escrow Dashboard 2` Stitch design) | ✅ Approved |
| 24 | 2026-11-21 | Interactive motion design via `framer-motion` | Sliding `layoutId` pills, cursor-tracking lattice glow, animated counters & milestone bars, `AnimatePresence` filter transitions, `reducedMotion="user"` | ✅ Approved |
| 25 | 2026-11-21 | Feature branch `feat/stage-2a-frontend-scaffold` | Develop Stage 2A on a separate Git branch and merge into `main` after review | ✅ Approved |
| 26 | 2026-11-21 | Brand palette updated to **Copper & Ice** (`#EA7A3D` Burnished Copper + `#38BDF8` Ice Blue) | Replaces generic DeFi emerald with a rare, architectural vault/trellis identity; previewing on Stitch before updating code | ✅ Approved |
