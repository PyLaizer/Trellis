// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IProjectManager
/// @notice Interface for the Trellis project and milestone lifecycle orchestrator.
/// @dev Coordinates ERC-8004 identity checks, upfront milestone escrow funding,
///      deliverable submissions, approvals, dispute hooks, and post-settlement ratings.
interface IProjectManager {
    /// @notice Overall lifecycle state of a Trellis project.
    enum ProjectStatus {
        Open,
        Active,
        Completed,
        Cancelled
    }

    /// @notice Lifecycle state of an individual milestone within a project.
    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Disputed,
        ResolvedRelease,
        ResolvedRefund
    }

    /// @notice Core project state and participant bindings.
    /// @param projectId Unique 1-indexed project identifier.
    /// @param clientAgentId ERC-8004 agent ID of the hiring client.
    /// @param freelancerAgentId ERC-8004 agent ID of the freelancer (0 = open marketplace).
    /// @param client Snapshot wallet address of the client who funded the project.
    /// @param status Current project lifecycle status.
    /// @param milestoneCount Total number of milestones in the project.
    /// @param settledCount Number of milestones settled via approval or dispute resolution.
    /// @param createdAt Block timestamp when the project was created.
    /// @param freelancer Snapshot wallet address of the freelancer who accepted the project.
    /// @param totalBudget Sum of all milestone amounts in token base units.
    /// @param metadataURI Off-chain URI (IPFS/HTTPS) describing the project brief.
    struct Project {
        uint256 projectId;
        uint256 clientAgentId;
        uint256 freelancerAgentId;
        address client;
        ProjectStatus status;
        uint8 milestoneCount;
        uint8 settledCount;
        uint64 createdAt;
        address freelancer;
        uint256 totalBudget;
        string metadataURI;
    }

    /// @notice Individual milestone specification and deliverable state.
    /// @param amount Escrowed token amount for this milestone.
    /// @param dueDate Target completion timestamp (unix seconds).
    /// @param submittedAt Block timestamp when the deliverable was submitted (0 if unsubmitted).
    /// @param status Current milestone lifecycle status.
    /// @param deliverableHash Integrity hash (`keccak256`) of the submitted deliverable.
    /// @param descriptionURI Off-chain URI describing milestone acceptance criteria.
    /// @param deliverableURI Off-chain URI pointing to the submitted work artifact.
    struct Milestone {
        uint256 amount;
        uint64 dueDate;
        uint64 submittedAt;
        MilestoneStatus status;
        bytes32 deliverableHash;
        string descriptionURI;
        string deliverableURI;
    }

    /// @notice Emitted when a new project is created and fully funded in escrow.
    /// @param projectId Unique 1-indexed project ID.
    /// @param clientAgentId Client's ERC-8004 agent ID.
    /// @param targetFreelancerAgentId Target freelancer agent ID (0 if open marketplace).
    /// @param client Client wallet address.
    /// @param totalBudget Total escrowed budget across all milestones.
    /// @param milestoneCount Number of milestones created.
    /// @param metadataURI Project brief metadata URI.
    event ProjectCreated(
        uint256 indexed projectId,
        uint256 indexed clientAgentId,
        uint256 indexed targetFreelancerAgentId,
        address client,
        uint256 totalBudget,
        uint8 milestoneCount,
        string metadataURI
    );

    /// @notice Emitted when an open project is cancelled by its client prior to acceptance.
    /// @param projectId Cancelled project ID.
    /// @param client Client wallet that received the full refund.
    /// @param totalRefunded Total token amount refunded.
    event ProjectCancelled(
        uint256 indexed projectId,
        address indexed client,
        uint256 totalRefunded
    );

    /// @notice Emitted when a freelancer accepts an open project.
    /// @param projectId Accepted project ID.
    /// @param freelancerAgentId Accepting freelancer's ERC-8004 agent ID.
    /// @param freelancer Snapshot wallet address of the accepting freelancer.
    event ProjectAccepted(
        uint256 indexed projectId,
        uint256 indexed freelancerAgentId,
        address indexed freelancer
    );

    /// @notice Emitted when all milestones of a project have been settled.
    /// @param projectId Completed project ID.
    event ProjectCompleted(uint256 indexed projectId);

    /// @notice Emitted when a freelancer submits a deliverable for a pending milestone.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param deliverableURI Off-chain URI of the deliverable.
    /// @param deliverableHash Integrity hash of the deliverable.
    event DeliverableSubmitted(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        string deliverableURI,
        bytes32 deliverableHash
    );

    /// @notice Emitted when a client approves a submitted milestone and releases funds.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param amount Gross milestone amount released from escrow.
    event MilestoneApproved(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        uint256 amount
    );

    /// @notice Emitted when `DisputeResolution` marks a submitted milestone as disputed.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    event MilestoneDisputed(uint256 indexed projectId, uint256 indexed milestoneIndex);

    /// @notice Emitted when `DisputeResolution` settles a disputed milestone.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param releasedToFreelancer True if funds were released to freelancer, false if refunded to client.
    event MilestoneDisputeResolved(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        bool releasedToFreelancer
    );

    /// @notice Emitted when a participant submits ERC-8004 reputation feedback for their counterparty.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param targetAgentId Counterparty's ERC-8004 agent ID receiving the rating.
    /// @param reviewer Wallet address submitting the rating.
    /// @param score Score on a 0–100 scale.
    event CounterpartyRated(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        uint256 indexed targetAgentId,
        address reviewer,
        uint8 score
    );

    /// @notice Thrown when a required address parameter is the zero address.
    error ZeroAddress();

    /// @notice Thrown when a required URI string is empty.
    error EmptyURI();

    /// @notice Thrown when a deliverable integrity hash is zero.
    error EmptyDeliverableHash();

    /// @notice Thrown when the caller is not authorized to act for an ERC-8004 agent ID.
    /// @param caller Address attempting the action.
    /// @param agentId Target ERC-8004 agent ID.
    error UnauthorizedAgent(address caller, uint256 agentId);

    /// @notice Thrown when an agent does not exist, lacks the expected role, or is inactive.
    /// @param agentId Invalid agent ID.
    error InvalidAgentRoleOrInactive(uint256 agentId);

    /// @notice Thrown when a client attempts to hire or accept a project using their own identity.
    /// @param clientAgentId Client's agent ID.
    /// @param freelancerAgentId Freelancer's agent ID.
    error SelfHiringNotAllowed(uint256 clientAgentId, uint256 freelancerAgentId);

    /// @notice Thrown when milestone count is 0 or exceeds `MAX_MILESTONES`.
    /// @param count Invalid milestone count supplied.
    error InvalidMilestoneCount(uint256 count);

    /// @notice Thrown when milestone input arrays have mismatched lengths.
    error ArrayLengthMismatch();

    /// @notice Thrown when a milestone amount is zero.
    /// @param milestoneIndex Index of the invalid milestone.
    error ZeroMilestoneAmount(uint256 milestoneIndex);

    /// @notice Thrown when referencing a non-existent project ID.
    /// @param projectId Unknown project ID.
    error ProjectNotFound(uint256 projectId);

    /// @notice Thrown when referencing an out-of-bounds milestone index.
    /// @param projectId Project ID.
    /// @param milestoneIndex Out-of-bounds milestone index.
    error MilestoneNotFound(uint256 projectId, uint256 milestoneIndex);

    /// @notice Thrown when a project is not in the expected lifecycle status.
    /// @param projectId Project ID.
    /// @param currentStatus Observed project status.
    /// @param expectedStatus Required project status.
    error InvalidProjectStatus(
        uint256 projectId,
        ProjectStatus currentStatus,
        ProjectStatus expectedStatus
    );

    /// @notice Thrown when a milestone is not in the required status for an operation.
    /// @param projectId Project ID.
    /// @param milestoneIndex Milestone index.
    /// @param currentStatus Observed milestone status.
    error InvalidMilestoneStatus(
        uint256 projectId,
        uint256 milestoneIndex,
        MilestoneStatus currentStatus
    );

    /// @notice Thrown when a caller is not the authorized project participant for an action.
    /// @param caller Unauthorized wallet address.
    /// @param projectId Project ID.
    error UnauthorizedParticipant(address caller, uint256 projectId);

    /// @notice Thrown when a freelancer attempts to accept a direct-hire project assigned to another agent.
    /// @param projectId Project ID.
    /// @param expectedFreelancerAgentId Designated target freelancer agent ID.
    /// @param providedFreelancerAgentId Agent ID supplied by the caller.
    error NotTargetFreelancer(
        uint256 projectId,
        uint256 expectedFreelancerAgentId,
        uint256 providedFreelancerAgentId
    );

    /// @notice Thrown when attempting to rate a counterparty before the milestone is settled.
    /// @param projectId Project ID.
    /// @param milestoneIndex Milestone index.
    error MilestoneNotSettled(uint256 projectId, uint256 milestoneIndex);

    /// @notice Creates a new project and locks upfront escrow funding for all milestones.
    /// @param clientAgentId Caller's ERC-8004 Client agent ID.
    /// @param targetFreelancerAgentId Optional direct-hire Freelancer agent ID (0 for open marketplace).
    /// @param metadataURI Non-empty URI pointing to the project brief.
    /// @param milestoneAmounts Ordered array of milestone funding amounts (1..20 items).
    /// @param milestoneDueDates Ordered array of milestone due timestamps.
    /// @param milestoneDescriptionURIs Ordered array of non-empty milestone description URIs.
    /// @return projectId Newly created 1-indexed project ID.
    function createProject(
        uint256 clientAgentId,
        uint256 targetFreelancerAgentId,
        string calldata metadataURI,
        uint256[] calldata milestoneAmounts,
        uint64[] calldata milestoneDueDates,
        string[] calldata milestoneDescriptionURIs
    ) external returns (uint256 projectId);

    /// @notice Cancels an open project and refunds all locked milestones to the client at 0% fee.
    /// @param projectId Project ID to cancel.
    function cancelProject(uint256 projectId) external;

    /// @notice Accepts an open project as a verified, active ERC-8004 Freelancer.
    /// @param projectId Project ID to accept.
    /// @param freelancerAgentId Caller's ERC-8004 Freelancer agent ID.
    function acceptProject(uint256 projectId, uint256 freelancerAgentId) external;

    /// @notice Submits a deliverable URI and integrity hash for a pending milestone.
    /// @param projectId Active project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param deliverableURI Non-empty URI pointing to the deliverable artifact.
    /// @param deliverableHash Non-zero `keccak256` hash of the deliverable content.
    function submitDeliverable(
        uint256 projectId,
        uint256 milestoneIndex,
        string calldata deliverableURI,
        bytes32 deliverableHash
    ) external;

    /// @notice Approves a submitted milestone and releases escrowed funds to the freelancer.
    /// @param projectId Active project ID.
    /// @param milestoneIndex Zero-based milestone index.
    function approveMilestone(uint256 projectId, uint256 milestoneIndex) external;

    /// @notice Marks a submitted milestone as disputed.
    /// @dev Restricted to `DISPUTE_RESOLVER_ROLE`.
    /// @param projectId Active project ID.
    /// @param milestoneIndex Zero-based milestone index.
    function markMilestoneDisputed(uint256 projectId, uint256 milestoneIndex) external;

    /// @notice Resolves a disputed milestone by releasing funds to the freelancer or refunding the client.
    /// @dev Restricted to `DISPUTE_RESOLVER_ROLE`.
    /// @param projectId Active project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param releaseToFreelancer True to pay the freelancer, false to refund the client.
    function resolveDisputedMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        bool releaseToFreelancer
    ) external;

    /// @notice Submits ERC-8004 reputation feedback for the counterparty of a settled milestone.
    /// @param projectId Project ID.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param score Rating score on a 0–100 scale.
    /// @param commentURI Optional URI pointing to off-chain review commentary.
    /// @param commentHash Optional `keccak256` hash of the review commentary.
    function rateCounterparty(
        uint256 projectId,
        uint256 milestoneIndex,
        uint8 score,
        string calldata commentURI,
        bytes32 commentHash
    ) external;

    /// @notice Returns the stored `Project` struct for `projectId`.
    /// @param projectId Project ID to query.
    /// @return project The requested project record.
    function getProject(uint256 projectId) external view returns (Project memory project);

    /// @notice Returns a single `Milestone` struct for `(projectId, milestoneIndex)`.
    /// @param projectId Project ID to query.
    /// @param milestoneIndex Zero-based milestone index.
    /// @return milestone The requested milestone record.
    function getMilestone(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (Milestone memory milestone);

    /// @notice Returns all milestones belonging to `projectId`.
    /// @param projectId Project ID to query.
    /// @return milestones Array of all milestone records for the project.
    function getProjectMilestones(uint256 projectId) external view returns (Milestone[] memory milestones);

    /// @notice Returns the total number of projects created so far.
    /// @return total Total created project count.
    function totalProjects() external view returns (uint256 total);
}
