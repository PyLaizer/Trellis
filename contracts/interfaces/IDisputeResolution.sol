// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProjectManager} from "./IProjectManager.sol";

/// @title IDisputeResolution
/// @notice Interface for the Trellis 2-of-3 AI Arbiter Dispute Resolution engine.
/// @dev Coordinates conflict-free panel selection from `IdentityRegistry`, ERC-8004
///      validation logging in `ValidationRegistry`, escrow settlement via `ProjectManager`,
///      and automated majority/dissent arbiter scoring in `ReputationRegistry`.
interface IDisputeResolution {
    /// @notice Lifecycle status of a milestone dispute.
    enum DisputeStatus {
        Open,
        ResolvedRelease,
        ResolvedRefund
    }

    /// @notice Vote ruling submitted by an assigned AI arbiter.
    enum Ruling {
        None,
        ReleaseToFreelancer,
        RefundToClient
    }

    /// @notice Complete on-chain record of a milestone dispute and its 3-arbiter panel.
    /// @param disputeId Unique 1-indexed dispute identifier.
    /// @param projectId Associated `ProjectManager` project ID.
    /// @param milestoneIndex Zero-based milestone index within `projectId`.
    /// @param openedBy Wallet address of the participant who opened the dispute.
    /// @param status Current dispute lifecycle status.
    /// @param releaseVotes Number of votes cast in favor of releasing funds to the freelancer.
    /// @param refundVotes Number of votes cast in favor of refunding funds to the client.
    /// @param createdAt Block timestamp when the dispute was opened.
    /// @param votingDeadline Block timestamp after which an unresolved dispute can be finalized.
    /// @param evidenceHash Keccak256 integrity hash of the dispute evidence bundle.
    /// @param evidenceURI Off-chain URI (IPFS/HTTPS) pointing to the dispute evidence bundle.
    /// @param arbiters ERC-8004 agent IDs of the 3 conflict-free assigned arbiters.
    /// @param validationRequestIds Corresponding `ValidationRegistry` request IDs for each arbiter.
    struct Dispute {
        uint256 disputeId;
        uint256 projectId;
        uint256 milestoneIndex;
        address openedBy;
        DisputeStatus status;
        uint8 releaseVotes;
        uint8 refundVotes;
        uint64 createdAt;
        uint64 votingDeadline;
        bytes32 evidenceHash;
        string evidenceURI;
        uint256[3] arbiters;
        bytes32[3] validationRequestIds;
    }

    /// @notice Individual vote cast by an assigned arbiter on a dispute.
    /// @param ruling Arbiter's ruling (`None` if not yet voted).
    /// @param votedAt Block timestamp when the vote was cast.
    /// @param reasoningHash Keccak256 hash of the arbiter's off-chain reasoning report.
    /// @param proofURI Off-chain URI pointing to the arbiter's reasoning or attestation artifact.
    struct ArbiterVote {
        Ruling ruling;
        uint64 votedAt;
        bytes32 reasoningHash;
        string proofURI;
    }

    /// @notice Emitted when an admin updates the client review period or arbiter voting period.
    /// @param clientReviewPeriod Minimum wait after deliverable submission before a freelancer can dispute.
    /// @param votingPeriod Duration of the arbiter voting window in seconds.
    event TimingConfigUpdated(uint64 clientReviewPeriod, uint64 votingPeriod);

    /// @notice Emitted when a new milestone dispute is opened and a 3-arbiter panel is assigned.
    /// @param disputeId Unique 1-indexed dispute ID.
    /// @param projectId Associated project ID.
    /// @param milestoneIndex Zero-based disputed milestone index.
    /// @param openedBy Participant wallet that opened the dispute.
    /// @param arbiters Selected 3-arbiter panel agent IDs.
    /// @param votingDeadline Timestamp after which anyone may finalize an expired dispute.
    /// @param evidenceURI URI pointing to the dispute evidence bundle.
    event DisputeOpened(
        uint256 indexed disputeId,
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        address openedBy,
        uint256[3] arbiters,
        uint64 votingDeadline,
        string evidenceURI
    );

    /// @notice Emitted when an assigned arbiter casts a vote on an open dispute.
    /// @param disputeId Dispute ID being voted on.
    /// @param arbiterAgentId Voting arbiter's ERC-8004 agent ID.
    /// @param ruling Ruling selected by the arbiter.
    /// @param reasoningHash Keccak256 hash of the off-chain reasoning document.
    /// @param proofURI URI pointing to the reasoning or proof artifact.
    event VoteCast(
        uint256 indexed disputeId,
        uint256 indexed arbiterAgentId,
        Ruling ruling,
        bytes32 reasoningHash,
        string proofURI
    );

    /// @notice Emitted when a dispute reaches quorum or expires and settles the milestone escrow.
    /// @param disputeId Resolved dispute ID.
    /// @param projectId Associated project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param releasedToFreelancer True if funds were released to the freelancer, false if refunded to client.
    /// @param releaseVotes Final count of release votes.
    /// @param refundVotes Final count of refund votes.
    event DisputeResolved(
        uint256 indexed disputeId,
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        bool releasedToFreelancer,
        uint8 releaseVotes,
        uint8 refundVotes
    );

    /// @notice Emitted when auto-reputation feedback for an arbiter is skipped so settlement is never blocked.
    /// @param disputeId Resolved dispute ID.
    /// @param arbiterAgentId Arbiter's ERC-8004 agent ID whose feedback call failed.
    event ArbiterFeedbackSkipped(uint256 indexed disputeId, uint256 indexed arbiterAgentId);

    /// @notice Thrown when a required address parameter is the zero address.
    error ZeroAddress();

    /// @notice Thrown when `votingPeriod` is configured to zero.
    error InvalidVotingPeriod();

    /// @notice Thrown when an arbiter attempts to vote after `votingDeadline` has passed.
    /// @param disputeId Target dispute ID.
    /// @param votingDeadline Timestamp after which voting is closed.
    error VotingPeriodExpired(uint256 disputeId, uint64 votingDeadline);

    /// @notice Thrown when a dispute evidence hash is zero.
    error EmptyEvidenceHash();

    /// @notice Thrown when a required URI string is empty.
    error EmptyURI();

    /// @notice Thrown when an arbiter reasoning hash is zero.
    error EmptyReasoningHash();

    /// @notice Thrown when a caller other than the project client or freelancer attempts to open a dispute.
    /// @param caller Unauthorized caller address.
    /// @param projectId Target project ID.
    error UnauthorizedDisputeOpener(address caller, uint256 projectId);

    /// @notice Thrown when attempting to open a dispute on a project that is not `Active`.
    /// @param projectId Project ID.
    /// @param currentStatus Observed project status.
    error ProjectNotActive(uint256 projectId, IProjectManager.ProjectStatus currentStatus);

    /// @notice Thrown when a milestone is not eligible to be disputed by the caller.
    /// @param projectId Project ID.
    /// @param milestoneIndex Milestone index.
    /// @param currentStatus Observed milestone status.
    error MilestoneNotDisputable(
        uint256 projectId,
        uint256 milestoneIndex,
        IProjectManager.MilestoneStatus currentStatus
    );

    /// @notice Thrown when a freelancer attempts to open a dispute before `clientReviewPeriod` elapses.
    /// @param projectId Project ID.
    /// @param milestoneIndex Milestone index.
    /// @param availableAt Timestamp when the freelancer becomes eligible to open a dispute.
    error ReviewPeriodNotElapsed(uint256 projectId, uint256 milestoneIndex, uint64 availableAt);

    /// @notice Thrown when a dispute has already been opened for `(projectId, milestoneIndex)`.
    /// @param projectId Project ID.
    /// @param milestoneIndex Milestone index.
    /// @param existingDisputeId Previously created dispute ID for this milestone.
    error DisputeAlreadyExists(uint256 projectId, uint256 milestoneIndex, uint256 existingDisputeId);

    /// @notice Thrown when fewer than `PANEL_SIZE` conflict-free active arbiters are available.
    /// @param available Number of conflict-free active arbiters found.
    /// @param required Minimum number of arbiters required (`PANEL_SIZE`).
    error InsufficientArbiters(uint256 available, uint256 required);

    /// @notice Thrown when referencing a non-existent dispute ID.
    /// @param disputeId Unknown dispute ID.
    error DisputeNotFound(uint256 disputeId);

    /// @notice Thrown when attempting to vote on or finalize a dispute that is not `Open`.
    /// @param disputeId Dispute ID.
    /// @param currentStatus Observed dispute status.
    error DisputeNotOpen(uint256 disputeId, DisputeStatus currentStatus);

    /// @notice Thrown when an arbiter attempts to submit `Ruling.None`.
    error InvalidRuling();

    /// @notice Thrown when an arbiter agent ID is not part of the dispute's assigned 3-arbiter panel.
    /// @param disputeId Dispute ID.
    /// @param arbiterAgentId Unassigned arbiter agent ID.
    error ArbiterNotAssigned(uint256 disputeId, uint256 arbiterAgentId);

    /// @notice Thrown when `msg.sender` is neither the owner nor an approved operator of `arbiterAgentId`.
    /// @param caller Unauthorized caller address.
    /// @param arbiterAgentId Target arbiter agent ID.
    error UnauthorizedArbiterOperator(address caller, uint256 arbiterAgentId);

    /// @notice Thrown when an assigned arbiter attempts to vote more than once on the same dispute.
    /// @param disputeId Dispute ID.
    /// @param arbiterAgentId Arbiter agent ID that already voted.
    error ArbiterAlreadyVoted(uint256 disputeId, uint256 arbiterAgentId);

    /// @notice Thrown when `finalizeExpiredDispute` is called before `votingDeadline` has passed.
    /// @param disputeId Dispute ID.
    /// @param votingDeadline Timestamp after which finalization is allowed.
    error VotingPeriodNotExpired(uint256 disputeId, uint64 votingDeadline);

    /// @notice Updates the client review period and arbiter voting period.
    /// @dev Restricted to `DEFAULT_ADMIN_ROLE`. `newVotingPeriod` must be greater than zero.
    /// @param newReviewPeriod New client review window in seconds (may be 0 for demos/tests).
    /// @param newVotingPeriod New arbiter voting window in seconds (must be > 0).
    function setTimingConfig(uint64 newReviewPeriod, uint64 newVotingPeriod) external;

    /// @notice Opens a dispute on an eligible milestone and assigns a conflict-free 3-arbiter panel.
    /// @param projectId Active project ID.
    /// @param milestoneIndex Zero-based milestone index to dispute.
    /// @param evidenceHash Non-zero `keccak256` hash of the dispute evidence bundle.
    /// @param evidenceURI Non-empty URI pointing to the dispute evidence bundle.
    /// @return disputeId Newly created 1-indexed dispute ID.
    function openDispute(
        uint256 projectId,
        uint256 milestoneIndex,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external returns (uint256 disputeId);

    /// @notice Submits an assigned arbiter's vote and records their ERC-8004 validation verdict.
    /// @dev Automatically finalizes the dispute once either ruling reaches 2-of-3 quorum.
    /// @param disputeId Open dispute ID.
    /// @param arbiterAgentId Assigned arbiter's ERC-8004 agent ID.
    /// @param ruling Arbiter's ruling (`ReleaseToFreelancer` or `RefundToClient`).
    /// @param reasoningHash Non-zero `keccak256` hash of the arbiter's reasoning report.
    /// @param proofURI Non-empty URI pointing to the reasoning or attestation artifact.
    /// @param proof Opaque proof bytes forwarded to `ValidationRegistry` (e.g., zkML / TEE).
    function castVote(
        uint256 disputeId,
        uint256 arbiterAgentId,
        Ruling ruling,
        bytes32 reasoningHash,
        string calldata proofURI,
        bytes calldata proof
    ) external;

    /// @notice Finalizes an open dispute after its `votingDeadline` has elapsed without quorum.
    /// @dev Resolves in favor of the higher vote tally; defaults to `RefundToClient` on a tie
    ///      (0-0 or 1-1) to prevent escrowed funds from being permanently locked.
    /// @param disputeId Expired open dispute ID.
    function finalizeExpiredDispute(uint256 disputeId) external;

    /// @notice Returns the full `Dispute` record for `disputeId`.
    /// @param disputeId Dispute ID to query.
    /// @return dispute Stored `Dispute` struct.
    function getDispute(uint256 disputeId) external view returns (Dispute memory dispute);

    /// @notice Returns the `ArbiterVote` cast by `arbiterAgentId` on `disputeId`.
    /// @param disputeId Dispute ID to query.
    /// @param arbiterAgentId Arbiter's ERC-8004 agent ID.
    /// @return vote Stored `ArbiterVote` struct (`ruling == Ruling.None` if not yet voted).
    function getArbiterVote(
        uint256 disputeId,
        uint256 arbiterAgentId
    ) external view returns (ArbiterVote memory vote);

    /// @notice Returns the dispute ID associated with `(projectId, milestoneIndex)`, or 0 if none.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @return disputeId Associated dispute ID (0 if no dispute has been opened).
    function getMilestoneDisputeId(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (uint256 disputeId);

    /// @notice Returns the total number of disputes created so far.
    /// @return total Total created dispute count.
    function totalDisputes() external view returns (uint256 total);
}
