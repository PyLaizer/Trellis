// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationRegistry
/// @notice Interface for the Trellis ERC-8004 Reputation Registry.
/// @dev Records Sybil-resistant 0–100 reputation feedback gated to authorized
///      protocol reporter contracts (`ProjectManager` and `DisputeResolution`).
interface IReputationRegistry {
    /// @notice On-chain feedback record tied to a specific protocol interaction.
    /// @param agentId ERC-8004 agent ID receiving the feedback.
    /// @param reviewer Address of the participant who originated the rating.
    /// @param score Rating on a 0–100 scale.
    /// @param tag Category tag (e.g., `keccak256("milestone")` or `keccak256("arbiter")`).
    /// @param referenceId Unique interaction identifier preventing duplicate ratings.
    /// @param commentURI Optional URI to detailed off-chain review text.
    /// @param commentHash Optional hash of the off-chain review content for integrity.
    /// @param timestamp Block timestamp when the feedback was recorded.
    /// @param revoked Whether an admin has revoked this feedback entry.
    struct Feedback {
        uint256 agentId;
        address reviewer;
        uint8 score;
        uint64 timestamp;
        bool revoked;
        bytes32 tag;
        bytes32 referenceId;
        string commentURI;
        bytes32 commentHash;
    }

    /// @notice Running aggregate totals enabling O(1) reputation average lookups.
    /// @param count Number of active (non-revoked) feedback entries.
    /// @param totalScore Cumulative sum of active feedback scores (packed with `count` in 1 slot).
    struct ReputationSummary {
        uint64 count;
        uint192 totalScore;
    }

    /// @notice Emitted when a new feedback entry is recorded for an agent.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param feedbackIndex Zero-based index of the entry in the agent's feedback array.
    /// @param reviewer Address of the reviewer.
    /// @param score Rating on the 0–100 scale.
    /// @param tag Category tag for the feedback.
    /// @param referenceId Unique interaction reference ID.
    /// @param commentURI Optional URI to off-chain comment content.
    /// @param commentHash Optional keccak256 hash of the off-chain comment content.
    event FeedbackSubmitted(
        uint256 indexed agentId,
        uint256 indexed feedbackIndex,
        address indexed reviewer,
        uint8 score,
        bytes32 tag,
        bytes32 referenceId,
        string commentURI,
        bytes32 commentHash
    );

    /// @notice Emitted when an admin revokes a previously submitted feedback entry.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param feedbackIndex Index of the revoked feedback entry.
    event FeedbackRevoked(uint256 indexed agentId, uint256 indexed feedbackIndex);

    /// @notice Thrown when a required address parameter is the zero address.
    error ZeroAddress();

    /// @notice Thrown when feedback targets a non-existent agent ID.
    /// @param agentId Unknown agent ID.
    error UnknownAgent(uint256 agentId);

    /// @notice Thrown when a submitted score exceeds `MAX_SCORE` (100).
    /// @param score Invalid score supplied.
    error ScoreOutOfRange(uint8 score);

    /// @notice Thrown when the same reviewer submits duplicate feedback for the same agent and reference ID.
    /// @param agentId Target agent ID.
    /// @param reviewer Reviewer address.
    /// @param referenceId Duplicate interaction reference ID.
    error DuplicateFeedback(uint256 agentId, address reviewer, bytes32 referenceId);

    /// @notice Thrown when a reviewer attempts to rate an agent identity they own or operate.
    /// @param agentId Target agent ID.
    /// @param reviewer Unauthorized self-reviewer address.
    error SelfFeedbackNotAllowed(uint256 agentId, address reviewer);

    /// @notice Thrown when accessing a feedback index outside the agent's feedback list.
    /// @param agentId Target agent ID.
    /// @param feedbackIndex Out-of-bounds index.
    error FeedbackNotFound(uint256 agentId, uint256 feedbackIndex);

    /// @notice Thrown when attempting to revoke an already-revoked feedback entry.
    /// @param agentId Target agent ID.
    /// @param feedbackIndex Index of the already-revoked entry.
    error FeedbackAlreadyRevoked(uint256 agentId, uint256 feedbackIndex);

    /// @notice Records a new reputation feedback entry for an agent.
    /// @dev Restricted to accounts holding `REPORTER_ROLE`.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param reviewer Address of the participant giving feedback.
    /// @param score Score between 0 and 100 inclusive.
    /// @param tag Category tag (e.g., `keccak256("milestone")`).
    /// @param referenceId Unique interaction identifier preventing duplicate ratings.
    /// @param commentURI Optional URI pointing to off-chain commentary.
    /// @param commentHash Optional integrity hash of the off-chain commentary.
    /// @return feedbackIndex Index of the newly stored feedback entry.
    function giveFeedback(
        uint256 agentId,
        address reviewer,
        uint8 score,
        bytes32 tag,
        bytes32 referenceId,
        string calldata commentURI,
        bytes32 commentHash
    ) external returns (uint256 feedbackIndex);

    /// @notice Revokes a previously submitted feedback entry and updates running totals.
    /// @dev Restricted to `DEFAULT_ADMIN_ROLE`.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param feedbackIndex Index of the feedback entry to revoke.
    function revokeFeedback(uint256 agentId, uint256 feedbackIndex) external;

    /// @notice Returns the active feedback count and integer average score (0–100) for an agent.
    /// @param agentId Target ERC-8004 agent ID.
    /// @return count Number of non-revoked feedback entries.
    /// @return averageScore Mean score (0 if `count == 0`).
    function getSummary(uint256 agentId) external view returns (uint64 count, uint8 averageScore);

    /// @notice Returns the total number of feedback entries (including revoked) stored for an agent.
    /// @param agentId Target ERC-8004 agent ID.
    /// @return total Total feedback array length.
    function getFeedbackCount(uint256 agentId) external view returns (uint256 total);

    /// @notice Returns a single feedback entry by index.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param feedbackIndex Zero-based index into the agent's feedback list.
    /// @return feedback The requested `Feedback` struct.
    function getFeedback(uint256 agentId, uint256 feedbackIndex) external view returns (Feedback memory feedback);

    /// @notice Returns a paginated slice of feedback entries for an agent.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param offset Starting index in the agent's feedback list.
    /// @param limit Maximum number of entries to return.
    /// @return feedbacks Paginated array of `Feedback` structs.
    function getAgentFeedbacks(
        uint256 agentId,
        uint256 offset,
        uint256 limit
    ) external view returns (Feedback[] memory feedbacks);

    /// @notice Checks whether a reviewer has already submitted feedback for `(agentId, referenceId)`.
    /// @param agentId Target ERC-8004 agent ID.
    /// @param reviewer Reviewer address.
    /// @param referenceId Interaction reference ID.
    /// @return submitted True if feedback was already recorded.
    function hasSubmittedFeedback(
        uint256 agentId,
        address reviewer,
        bytes32 referenceId
    ) external view returns (bool submitted);
}
