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
