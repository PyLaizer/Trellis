// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";

/// @title ReputationRegistry
/// @notice ERC-8004 Reputation Registry for the Trellis protocol.
/// @dev Stores Sybil-resistant 0–100 reputation scores for registered ERC-8004 agents.
///      Feedback submission is gated to `REPORTER_ROLE` (granted to `ProjectManager`
///      and `DisputeResolution`) and deduplicated by `(agentId, reviewer, referenceId)`.
contract ReputationRegistry is AccessControl, IReputationRegistry {
    /// @notice Role granted to authorized Trellis protocol contracts that may submit feedback.
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    /// @notice Maximum allowed reputation score on the 0–100 scale.
    uint8 public constant MAX_SCORE = 100;

    /// @notice Reference to the ERC-8004 IdentityRegistry used to validate agent existence.
    IIdentityRegistry public immutable identityRegistry;

    /// @notice Per-agent list of all submitted feedback entries (including revoked entries).
    mapping(uint256 agentId => Feedback[]) private _feedbacks;

    /// @notice Per-agent running totals for O(1) average score calculation.
    mapping(uint256 agentId => ReputationSummary) private _summaries;

    /// @inheritdoc IReputationRegistry
    mapping(uint256 agentId => mapping(address reviewer => mapping(bytes32 referenceId => bool)))
        public
        override hasSubmittedFeedback;

    /// @notice Initializes the ReputationRegistry with the IdentityRegistry and admin address.
    /// @param identityRegistry_ Address of the deployed `IdentityRegistry`.
    /// @param admin_ Address granted `DEFAULT_ADMIN_ROLE`.
    constructor(address identityRegistry_, address admin_) {
        if (identityRegistry_ == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /// @inheritdoc IReputationRegistry
    function giveFeedback(
        uint256 agentId,
        address reviewer,
        uint8 score,
        bytes32 tag,
        bytes32 referenceId,
        string calldata commentURI,
        bytes32 commentHash
    ) external override onlyRole(REPORTER_ROLE) returns (uint256 feedbackIndex) {
        if (!identityRegistry.agentExists(agentId)) {
            revert UnknownAgent(agentId);
        }
        if (reviewer == address(0)) {
            revert ZeroAddress();
        }
        if (identityRegistry.isAuthorized(reviewer, agentId)) {
            revert SelfFeedbackNotAllowed(agentId, reviewer);
        }
        if (score > MAX_SCORE) {
            revert ScoreOutOfRange(score);
        }
        if (hasSubmittedFeedback[agentId][reviewer][referenceId]) {
            revert DuplicateFeedback(agentId, reviewer, referenceId);
        }

        hasSubmittedFeedback[agentId][reviewer][referenceId] = true;

        feedbackIndex = _feedbacks[agentId].length;
        _feedbacks[agentId].push(
            Feedback({
                agentId: agentId,
                reviewer: reviewer,
                score: score,
                tag: tag,
                referenceId: referenceId,
                commentURI: commentURI,
                commentHash: commentHash,
                timestamp: uint64(block.timestamp),
                revoked: false
            })
        );

        ReputationSummary storage summary = _summaries[agentId];
        summary.count += 1;
        summary.totalScore += score;

        emit FeedbackSubmitted(
            agentId,
            feedbackIndex,
            reviewer,
            score,
            tag,
            referenceId,
            commentURI,
            commentHash
        );
    }

    /// @inheritdoc IReputationRegistry
    function revokeFeedback(uint256 agentId, uint256 feedbackIndex) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feedbackIndex >= _feedbacks[agentId].length) {
            revert FeedbackNotFound(agentId, feedbackIndex);
        }

        Feedback storage fb = _feedbacks[agentId][feedbackIndex];
        if (fb.revoked) {
            revert FeedbackAlreadyRevoked(agentId, feedbackIndex);
        }

        fb.revoked = true;

        ReputationSummary storage summary = _summaries[agentId];
        summary.count -= 1;
        summary.totalScore -= fb.score;

        emit FeedbackRevoked(agentId, feedbackIndex);
    }

    /// @inheritdoc IReputationRegistry
    function getSummary(uint256 agentId) external view override returns (uint64 count, uint8 averageScore) {
        ReputationSummary storage summary = _summaries[agentId];
        count = summary.count;
        averageScore = count == 0 ? 0 : uint8(summary.totalScore / count);
    }

    /// @inheritdoc IReputationRegistry
    function getFeedbackCount(uint256 agentId) external view override returns (uint256 total) {
        return _feedbacks[agentId].length;
    }

    /// @inheritdoc IReputationRegistry
    function getFeedback(
        uint256 agentId,
        uint256 feedbackIndex
    ) external view override returns (Feedback memory feedback) {
        if (feedbackIndex >= _feedbacks[agentId].length) {
            revert FeedbackNotFound(agentId, feedbackIndex);
        }
        return _feedbacks[agentId][feedbackIndex];
    }

    /// @inheritdoc IReputationRegistry
    function getAgentFeedbacks(
        uint256 agentId,
        uint256 offset,
        uint256 limit
    ) external view override returns (Feedback[] memory feedbacks) {
        Feedback[] storage all = _feedbacks[agentId];
        uint256 total = all.length;

        if (offset >= total || limit == 0) {
            return new Feedback[](0);
        }

        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        feedbacks = new Feedback[](size);

        for (uint256 i = 0; i < size; ++i) {
            feedbacks[i] = all[offset + i];
        }
    }
}
