# Trellis — Progress Tracker

## Overall Status: 🟢 Stage 2F Complete (`feat/stage-2f-reputation-page`) — Entire Week 2 Frontend Built! Ready for Review & Week 3

---

## Week 1: Smart Contracts + Testing (Nov 20 – Nov 27)

### Stage 1A: Project Setup
- [x] Initialize Hardhat 3 + viem project (`package.json`, `tsconfig.json`, `hardhat.config.ts`)
- [x] Configure Aevum Testnet network (Chain ID `44005`, RPC `https://rpc-test.qday.info`)
- [x] Install dependencies (`hardhat`, `@nomicfoundation/hardhat-toolbox-viem`, `viem`, `@openzeppelin/contracts`, `dotenv`, `typescript`)
- [x] Git repo initialized locally (branch `main`); initial commit created
- [x] Project folder structure (`contracts/{interfaces,registries,core}`, `test/`, `scripts/`, `frontend/`)
- [x] Environment variables template (`.env.example`) + `.gitignore`
- **Status:** ✅ Complete

### Stage 1B: ERC-8004 Registries
- [x] `IIdentityRegistry.sol` + `IdentityRegistry.sol` (ERC-721URIStorage, multi-identity, O(1) active-arbiter list, ERC-8004 metadata)
- [x] `IReputationRegistry.sol` + `ReputationRegistry.sol` (0–100 scale, `REPORTER_ROLE` gating, self-feedback guard, packed structs, paginated queries)
- [x] `IValidationRegistry.sol` + `ValidationRegistry.sol` (validation requests, original-requester & arbiter operator auth, opaque zkML/TEE proof field)
- [x] Unit tests for all 3 registries (`test/registries/`, 36 passing) + security code review completed
- **Status:** ✅ Complete

### Stage 1C: Core Business Logic
- [x] `MockTUSD8.sol` (6 decimals) for local testing
- [x] `IMilestoneEscrow.sol` + `MilestoneEscrow.sol` (upfront funding, SafeERC20, ReentrancyGuard, snapshotted 1% fee capped at 5%)
- [x] `IProjectManager.sol` + `ProjectManager.sol` (open + direct hire, overdue-milestone dispute recovery, full lifecycle, bilateral reputation)
- [x] Full milestone lifecycle tests (`test/core/`, 27 new tests — 63 total passing) + security code review completed
- **Status:** ✅ Complete

### Stage 1D: Dispute Resolution
- [x] `IDisputeResolution.sol` + `DisputeResolution.sol`
- [x] Conflict-free 3-arbiter panel selection + `ValidationRegistry` integration (with M-2 mitigation & operator conflict-of-interest guard)
- [x] 2-of-3 consensus voting, `VotingPeriodExpired` guard, deadline fallback, and non-blocking `try/catch` auto-reputation scoring
- [x] Unit tests (`test/core/DisputeResolution.test.ts`, 16 new tests — 79 total passing) + security code review completed
- **Status:** ✅ Complete

### Stage 1E: Integration Tests + Deployment
- [x] End-to-end integration test suite (`test/integration/TrellisE2E.test.ts` — 82 total passing)
- [x] Deployment script (`scripts/deploy.ts`) verified via local dry-run with full role wiring & manifest export
- [ ] Deploy to QDay Aevum Testnet *(ready — awaiting user `.env` + `tQDAY` faucet confirmation)*
- [ ] Verify contracts on Aevum explorer
- **Status:** 🟡 Ready for Aevum Testnet Deployment

---

## Week 2: Frontend + Integration (Nov 27 – Dec 4)

### Stage 2A: Frontend Scaffold
- [x] `scripts/export-abis.ts` exporting all 7 typed ABIs + addresses into `frontend/src/lib/contracts/`
- [x] Next.js 15 App Router + TypeScript + Tailwind CSS + Framer Motion scaffold in `frontend/`
- [x] wagmi / viem / RainbowKit configured for QDay Aevum Testnet (`44005`)
- [x] Quantum Lattice Dark shell: Navbar (inline SVG logo, sliding `layoutId` pills, live `tUSD8`/`tQDAY` balances), Footer, interactive motion Dashboard (`/`) matching `Trellis Escrow Dashboard 2`, and 4 route shells (`/identity`, `/projects`, `/disputes`, `/reputation`)
- [x] Verified clean production `npm run build` (0 TypeScript/lint errors)
- **Status:** ✅ Complete & merged into `main` (Copper & Ice theme applied)

### Stage 2B: Identity & Profiles
- [x] Agent Card JSON builder (`data:application/json;base64,...` + custom IPFS/HTTPS URI support) in `frontend/src/lib/agentCard.ts`
- [x] Registration studio (`IdentityRegistry.register` for Client / Freelancer / AI Arbiter) with live ERC-8004 JSON preview
- [x] Minted Passports vault (`setActive` toggle, `setAgentURI` modal, `setMetadata` modal, `ReputationRegistry.getSummary` score bars)
- [x] Active AI Arbiter Pool directory (`getActiveArbiters()`) + Agent Card inspector modal
- [x] Verified clean `npm run build` on `feat/stage-2b-identity-page` (0 TypeScript/lint errors)
- **Status:** ✅ Complete & merged into `main`

### Stage 2C: Project Flow
- [x] Project metadata JSON helper (`frontend/src/lib/projectMetadata.ts`) + preview dataset (`frontend/src/lib/mockProjectsData.ts`)
- [x] Projects Marketplace with status/hiring filters, search, segmented milestone bars, Accept & Cancel/Refund modals
- [x] Sticky Create Escrow Project builder (dynamic milestones up to 20, live upfront lock & 1% fee summary, 2-step `tUSD8.approve` → `ProjectManager.createProject`)
- [x] Live wagmi hooks (`ProjectManager`, `MilestoneEscrow`, `tUSD8`, `IdentityRegistry`) + Interactive Preview Mode
- [x] Verified clean `npm run build` on `feat/stage-2c-projects-page` (0 TypeScript/lint errors)
- **Status:** ✅ Complete & merged into `main`

### Stage 2D: Milestone Management
- [x] Dynamic workspace route (`frontend/src/app/projects/[id]/page.tsx`) + `ProjectWorkspaceClient.tsx`
- [x] Interactive milestone modals (`SubmitDeliverableModal`, `ApproveMilestoneModal`, `OpenDisputeModal`, `RateCounterpartyModal`)
- [x] Vault Proof & AI Arbitration Rules sidebar + On-Chain Timeline + Client/Freelancer perspective switcher
- [x] Live wagmi hooks (`ProjectManager`, `MilestoneEscrow`, `DisputeResolution`, `ReputationRegistry`) + Interactive Preview Mode
- [x] Verified clean `npm run build` on `feat/stage-2d-project-workspace` (0 TypeScript/lint errors)
- **Status:** ✅ Complete & merged into `main`

### Stage 2E: Dispute & Arbitration
- [x] Typed dispute & validation proof models + preview docket (`frontend/src/lib/mockDisputesData.ts`)
- [x] `ProofInspectorModal.tsx` (inspects `ValidationRegistry` zkML/TEE proofs, reasoning hashes, and response codes)
- [x] `DisputesClient.tsx` + `/disputes/page.tsx` (Active Dispute Tribunal, 2-of-3 Quorum Consensus Meter, live countdown, 3-column AI Arbiter panel, Cast Verdict form, Past Resolved Disputes table)
- [x] Live wagmi hooks (`DisputeResolution`, `ValidationRegistry`, `IdentityRegistry`) + Interactive Preview Mode
- [x] Verified clean `npm run build` on `feat/stage-2e-disputes-page` (0 TypeScript/lint errors)
- **Status:** ✅ Complete & merged into `main`

### Stage 2F: Reputation Dashboard
- [x] Typed reputation profiles, feedback records, and validation log dataset (`frontend/src/lib/mockReputationData.ts`)
- [x] `ReputationClient.tsx` + `/reputation/page.tsx` (Top Verified Agents Leaderboard with animated SVG trust rings, agent drill-down, paginated Immutable Feedback Feed, Validation Proofs Log with `ProofInspectorModal` & `.json` Proof Bundle download)
- [x] Live wagmi hooks (`ReputationRegistry`, `ValidationRegistry`, `IdentityRegistry`) + Interactive Preview Mode
- [x] Verified clean `npm run build` on `feat/stage-2f-reputation-page` (0 TypeScript/lint errors across all 6 routes)
- **Status:** ✅ Complete (on branch `feat/stage-2f-reputation-page`)

---

## Week 3: Polish, Demo & Docs (Dec 4 – Dec 11)

### Stage 3A: AI Arbiter Demo
- [ ] TypeScript arbiter simulation script
- [ ] Record demo of arbiter voting
- **Status:** ⬜ Not Started

### Stage 3B: End-to-End Testing
- [ ] Full walkthrough on testnet
- [ ] Bug fixes + edge cases
- **Status:** ⬜ Not Started

### Stage 3C: UI Polish
- [ ] Loading states
- [ ] Error handling
- [ ] Toast notifications
- **Status:** ⬜ Not Started

### Stage 3D: Documentation
- [ ] README.md
- [ ] Architecture docs
- [ ] System diagrams
- [ ] Setup guide
- **Status:** ⬜ Not Started

### Stage 3E: Demo Video
- [ ] Script the walkthrough
- [ ] Record 3-5 min video
- **Status:** ⬜ Not Started

### Stage 3F: Submission
- [ ] GitHub cleanup
- [ ] Contract verification
- [ ] Submit to DoraHacks
- **Status:** ⬜ Not Started
