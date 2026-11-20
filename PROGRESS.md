# PayLock — Progress Tracker

## Overall Status: 🟢 Stage 1A Complete — Ready for Stage 1B Scope Review

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
- [ ] Adapt IdentityRegistry.sol from reference impl
- [ ] Adapt ReputationRegistry.sol from reference impl
- [ ] Adapt ValidationRegistry.sol from reference impl
- [ ] Write unit tests for all 3 registries
- **Status:** ⬜ Not Started

### Stage 1C: Core Business Logic
- [ ] Build ProjectManager.sol
- [ ] Build MilestoneEscrow.sol
- [ ] Full milestone lifecycle tests
- **Status:** ⬜ Not Started

### Stage 1D: Dispute Resolution
- [ ] Build DisputeResolution.sol
- [ ] Arbiter assignment logic
- [ ] Voting + consensus logic
- [ ] Unit tests
- **Status:** ⬜ Not Started

### Stage 1E: Integration Tests + Deployment
- [ ] End-to-end test suite
- [ ] Deploy to Aevum Testnet
- [ ] Verify contracts on explorer
- **Status:** ⬜ Not Started

---

## Week 2: Frontend + Integration (Nov 27 – Dec 4)

### Stage 2A: Frontend Scaffold
- [ ] Init Next.js project
- [ ] Configure wagmi/viem for Aevum
- [ ] Wallet connection (RainbowKit)
- [ ] Layout & navigation
- **Status:** ⬜ Not Started

### Stage 2B: Identity & Profiles
- [ ] Registration page (mint identity NFT)
- [ ] Profile view
- [ ] Agent Card upload to IPFS
- **Status:** ⬜ Not Started

### Stage 2C: Project Flow
- [ ] Create project form
- [ ] Milestone definition
- [ ] Escrow funding
- [ ] Project listing/browsing
- **Status:** ⬜ Not Started

### Stage 2D: Milestone Management
- [ ] Freelancer deliverable submission
- [ ] Client review/approve UI
- [ ] tUSD8 release flow
- **Status:** ⬜ Not Started

### Stage 2E: Dispute & Arbitration
- [ ] Dispute filing UI
- [ ] Arbiter voting interface
- [ ] Consensus result display
- **Status:** ⬜ Not Started

### Stage 2F: Reputation Dashboard
- [ ] View ratings
- [ ] Reputation history
- [ ] Profile completeness
- **Status:** ⬜ Not Started

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
