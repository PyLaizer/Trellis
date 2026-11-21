// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IDisputeResolution} from "../interfaces/IDisputeResolution.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IProjectManager} from "../interfaces/IProjectManager.sol";
import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";
import {IValidationRegistry} from "../interfaces/IValidationRegistry.sol";

/// @title DisputeResolution
/// @notice Trellis 2-of-3 AI Arbiter Dispute Resolution engine.
/// @dev Selects conflict-free 3-arbiter panels from `IdentityRegistry`, logs validation
///      requests and verdicts via `ValidationRegistry`, settles escrowed milestones through
///      `ProjectManager`, and automatically scores voting arbiters in `ReputationRegistry`.
contract DisputeResolution is AccessControl, ReentrancyGuard, IDisputeResolution {
    /// @notice Number of conflict-free AI arbiters assigned to each dispute panel.
    uint8 public constant PANEL_SIZE = 3;

    /// @notice Minimum matching votes required for immediate consensus resolution (2-of-3).
    uint8 public constant QUORUM = 2;

    /// @notice Reputation score awarded to arbiters who voted with the final ruling.
    uint8 public constant MAJORITY_REPUTATION_SCORE = 100;

    /// @notice Reputation score awarded to arbiters who voted in the minority.
    uint8 public constant DISSENT_REPUTATION_SCORE = 25;

    /// @notice ERC-8004 reputation category tag used when scoring arbiters.
    bytes32 public constant TAG_ARBITER = keccak256("arbiter");

    /// @notice `ValidationRegistry` response code corresponding to `Ruling.ReleaseToFreelancer` (> 0 => Approved).
    uint8 public constant VOTE_RELEASE = 1;

    /// @notice `ValidationRegistry` response code corresponding to `Ruling.RefundToClient` (> 0 => Approved).
    uint8 public constant VOTE_REFUND = 2;

    /// @notice ERC-8004 Identity Registry used for arbiter enumeration, ownership, and authorization checks.
    IIdentityRegistry public immutable identityRegistry;

    /// @notice ERC-8004 Reputation Registry used to auto-score voting arbiters upon resolution.
    IReputationRegistry public immutable reputationRegistry;

    /// @notice ERC-8004 Validation Registry used to record validation requests and arbiter verdicts.
    IValidationRegistry public immutable validationRegistry;

    /// @notice ProjectManager contract governing milestone states and escrow settlement.
    IProjectManager public immutable projectManager;

    /// @notice Minimum wait after deliverable submission before a freelancer may open a dispute.
    uint64 public clientReviewPeriod;

    /// @notice Duration of the arbiter voting window in seconds.
    uint64 public votingPeriod;

    /// @dev Monotonically increasing 1-indexed dispute ID counter.
    uint256 private _nextDisputeId;

    /// @dev disputeId => Dispute record.
    mapping(uint256 disputeId => Dispute dispute) private _disputes;

    /// @dev disputeId => arbiterAgentId => ArbiterVote record.
    mapping(uint256 disputeId => mapping(uint256 arbiterAgentId => ArbiterVote vote)) private _votes;

    /// @dev projectId => milestoneIndex => disputeId (0 if never disputed).
    mapping(uint256 projectId => mapping(uint256 milestoneIndex => uint256 disputeId)) private _milestoneDispute;

    /// @notice Initializes the DisputeResolution engine and its protocol registry references.
    /// @param identityRegistry_ Address of the deployed `IdentityRegistry`.
    /// @param reputationRegistry_ Address of the deployed `ReputationRegistry`.
    /// @param validationRegistry_ Address of the deployed `ValidationRegistry`.
    /// @param projectManager_ Address of the deployed `ProjectManager`.
    /// @param initialAdmin Address granted `DEFAULT_ADMIN_ROLE`.
    /// @param clientReviewPeriod_ Initial client review period in seconds (may be 0 for demos/tests).
    /// @param votingPeriod_ Initial arbiter voting period in seconds (must be > 0).
    constructor(
        address identityRegistry_,
        address reputationRegistry_,
        address validationRegistry_,
        address projectManager_,
        address initialAdmin,
        uint64 clientReviewPeriod_,
        uint64 votingPeriod_
    ) {
        if (
            identityRegistry_ == address(0) ||
            reputationRegistry_ == address(0) ||
            validationRegistry_ == address(0) ||
            projectManager_ == address(0) ||
            initialAdmin == address(0)
        ) {
            revert ZeroAddress();
        }
        if (votingPeriod_ == 0) {
            revert InvalidVotingPeriod();
        }

        identityRegistry = IIdentityRegistry(identityRegistry_);
        reputationRegistry = IReputationRegistry(reputationRegistry_);
        validationRegistry = IValidationRegistry(validationRegistry_);
        projectManager = IProjectManager(projectManager_);

        clientReviewPeriod = clientReviewPeriod_;
        votingPeriod = votingPeriod_;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    }

    /// @inheritdoc IDisputeResolution
    function setTimingConfig(
        uint64 newReviewPeriod,
        uint64 newVotingPeriod
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newVotingPeriod == 0) {
            revert InvalidVotingPeriod();
        }

        clientReviewPeriod = newReviewPeriod;
        votingPeriod = newVotingPeriod;

        emit TimingConfigUpdated(newReviewPeriod, newVotingPeriod);
    }

    /// @inheritdoc IDisputeResolution
    function openDispute(
        uint256 projectId,
        uint256 milestoneIndex,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external nonReentrant returns (uint256 disputeId) {
        if (evidenceHash == bytes32(0)) {
            revert EmptyEvidenceHash();
        }
        if (bytes(evidenceURI).length == 0) {
            revert EmptyURI();
        }

        IProjectManager.Project memory project = projectManager.getProject(projectId);
        if (project.status != IProjectManager.ProjectStatus.Active) {
            revert ProjectNotActive(projectId, project.status);
        }

        IProjectManager.Milestone memory milestone = projectManager.getMilestone(projectId, milestoneIndex);

        if (msg.sender == project.client) {
            bool isOverduePending = milestone.status == IProjectManager.MilestoneStatus.Pending &&
                milestone.dueDate != 0 &&
                block.timestamp > milestone.dueDate;
            if (milestone.status != IProjectManager.MilestoneStatus.Submitted && !isOverduePending) {
                revert MilestoneNotDisputable(projectId, milestoneIndex, milestone.status);
            }
        } else if (msg.sender == project.freelancer) {
            if (milestone.status != IProjectManager.MilestoneStatus.Submitted) {
                revert MilestoneNotDisputable(projectId, milestoneIndex, milestone.status);
            }
            uint64 reviewEnd = milestone.submittedAt + clientReviewPeriod;
            if (block.timestamp < reviewEnd) {
                revert ReviewPeriodNotElapsed(projectId, milestoneIndex, reviewEnd);
            }
        } else {
            revert UnauthorizedDisputeOpener(msg.sender, projectId);
        }

        uint256 existingDisputeId = _milestoneDispute[projectId][milestoneIndex];
        if (existingDisputeId != 0) {
            revert DisputeAlreadyExists(projectId, milestoneIndex, existingDisputeId);
        }

        uint256[3] memory selectedArbiters = _selectArbiterPanel(
            project,
            projectId,
            milestoneIndex,
            _nextDisputeId + 1
        );

        disputeId = ++_nextDisputeId;
        uint64 createdAt = uint64(block.timestamp);
        uint64 votingDeadline = createdAt + votingPeriod;

        _milestoneDispute[projectId][milestoneIndex] = disputeId;

        Dispute storage dispute = _disputes[disputeId];
        dispute.disputeId = disputeId;
        dispute.projectId = projectId;
        dispute.milestoneIndex = milestoneIndex;
        dispute.openedBy = msg.sender;
        dispute.status = DisputeStatus.Open;
        dispute.createdAt = createdAt;
        dispute.votingDeadline = votingDeadline;
        dispute.evidenceHash = evidenceHash;
        dispute.evidenceURI = evidenceURI;
        dispute.arbiters = selectedArbiters;

        projectManager.markMilestoneDisputed(projectId, milestoneIndex);

        for (uint256 i = 0; i < PANEL_SIZE; ++i) {
            bytes32 requestId = validationRegistry.requestValidation(
                selectedArbiters[i],
                disputeId,
                evidenceHash,
                evidenceURI
            );
            dispute.validationRequestIds[i] = requestId;
        }

        emit DisputeOpened(
            disputeId,
            projectId,
            milestoneIndex,
            msg.sender,
            selectedArbiters,
            votingDeadline,
            evidenceURI
        );
    }

    /// @inheritdoc IDisputeResolution
    function castVote(
        uint256 disputeId,
        uint256 arbiterAgentId,
        Ruling ruling,
        bytes32 reasoningHash,
        string calldata proofURI,
        bytes calldata proof
    ) external nonReentrant {
        Dispute storage dispute = _getExistingDispute(disputeId);

        if (dispute.status != DisputeStatus.Open) {
            revert DisputeNotOpen(disputeId, dispute.status);
        }
        if (block.timestamp > dispute.votingDeadline) {
            revert VotingPeriodExpired(disputeId, dispute.votingDeadline);
        }
        if (ruling != Ruling.ReleaseToFreelancer && ruling != Ruling.RefundToClient) {
            revert InvalidRuling();
        }
        if (reasoningHash == bytes32(0)) {
            revert EmptyReasoningHash();
        }
        if (bytes(proofURI).length == 0) {
            revert EmptyURI();
        }

        uint256 slotIndex = _findArbiterSlot(dispute, arbiterAgentId);

        if (!identityRegistry.isAuthorized(msg.sender, arbiterAgentId)) {
            revert UnauthorizedArbiterOperator(msg.sender, arbiterAgentId);
        }

        if (_votes[disputeId][arbiterAgentId].ruling != Ruling.None) {
            revert ArbiterAlreadyVoted(disputeId, arbiterAgentId);
        }

        _votes[disputeId][arbiterAgentId] = ArbiterVote({
            ruling: ruling,
            votedAt: uint64(block.timestamp),
            reasoningHash: reasoningHash,
            proofURI: proofURI
        });

        if (ruling == Ruling.ReleaseToFreelancer) {
            ++dispute.releaseVotes;
        } else {
            ++dispute.refundVotes;
        }

        bytes32 requestId = dispute.validationRequestIds[slotIndex];
        if (validationRegistry.getValidation(requestId).status == IValidationRegistry.ValidationStatus.Pending) {
            uint8 responseCode = ruling == Ruling.ReleaseToFreelancer ? VOTE_RELEASE : VOTE_REFUND;
            validationRegistry.submitValidation(requestId, responseCode, reasoningHash, proofURI, proof);
        }

        emit VoteCast(disputeId, arbiterAgentId, ruling, reasoningHash, proofURI);

        if (dispute.releaseVotes >= QUORUM) {
            _finalizeDispute(dispute, true);
        } else if (dispute.refundVotes >= QUORUM) {
            _finalizeDispute(dispute, false);
        }
    }

    /// @inheritdoc IDisputeResolution
    function finalizeExpiredDispute(uint256 disputeId) external nonReentrant {
        Dispute storage dispute = _getExistingDispute(disputeId);

        if (dispute.status != DisputeStatus.Open) {
            revert DisputeNotOpen(disputeId, dispute.status);
        }
        if (block.timestamp <= dispute.votingDeadline) {
            revert VotingPeriodNotExpired(disputeId, dispute.votingDeadline);
        }

        // Strict majority of cast votes wins; ties (0-0 or 1-1) default to RefundToClient
        // so escrowed funds cannot be permanently locked if arbiters fail to reach quorum.
        bool releaseToFreelancer = dispute.releaseVotes > dispute.refundVotes;
        _finalizeDispute(dispute, releaseToFreelancer);
    }

    /// @inheritdoc IDisputeResolution
    function getDispute(uint256 disputeId) external view returns (Dispute memory dispute) {
        return _getExistingDispute(disputeId);
    }

    /// @inheritdoc IDisputeResolution
    function getArbiterVote(
        uint256 disputeId,
        uint256 arbiterAgentId
    ) external view returns (ArbiterVote memory vote) {
        _getExistingDispute(disputeId);
        return _votes[disputeId][arbiterAgentId];
    }

    /// @inheritdoc IDisputeResolution
    function getMilestoneDisputeId(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (uint256 disputeId) {
        return _milestoneDispute[projectId][milestoneIndex];
    }

    /// @inheritdoc IDisputeResolution
    function totalDisputes() external view returns (uint256 total) {
        return _nextDisputeId;
    }

    /// @dev Selects 3 distinct, conflict-free active arbiters using a Fisher-Yates partial shuffle.
    function _selectArbiterPanel(
        IProjectManager.Project memory project,
        uint256 projectId,
        uint256 milestoneIndex,
        uint256 nextDisputeId
    ) internal view returns (uint256[3] memory selected) {
        uint256[] memory activeArbiters = identityRegistry.getActiveArbiters();
        address clientAgentOwner = identityRegistry.ownerOf(project.clientAgentId);
        address freelancerAgentOwner = identityRegistry.ownerOf(project.freelancerAgentId);

        uint256 totalActive = activeArbiters.length;
        uint256[] memory eligible = new uint256[](totalActive);
        uint256 eligibleCount = 0;

        for (uint256 i = 0; i < totalActive; ++i) {
            uint256 arbiterId = activeArbiters[i];
            address arbiterOwner = identityRegistry.ownerOf(arbiterId);
            if (
                arbiterOwner == project.client ||
                arbiterOwner == project.freelancer ||
                arbiterOwner == clientAgentOwner ||
                arbiterOwner == freelancerAgentOwner ||
                identityRegistry.isAuthorized(project.client, arbiterId) ||
                identityRegistry.isAuthorized(project.freelancer, arbiterId)
            ) {
                continue;
            }
            eligible[eligibleCount] = arbiterId;
            ++eligibleCount;
        }

        if (eligibleCount < PANEL_SIZE) {
            revert InsufficientArbiters(eligibleCount, PANEL_SIZE);
        }

        bytes32 seed = keccak256(
            abi.encodePacked(block.prevrandao, block.timestamp, projectId, milestoneIndex, nextDisputeId)
        );

        for (uint256 i = 0; i < PANEL_SIZE; ++i) {
            uint256 rand = uint256(keccak256(abi.encodePacked(seed, i)));
            uint256 swapIdx = i + (rand % (eligibleCount - i));
            selected[i] = eligible[swapIdx];
            eligible[swapIdx] = eligible[i];
        }
    }

    /// @dev Settles the dispute on `ProjectManager`, auto-scores voting arbiters, and emits `DisputeResolved`.
    function _finalizeDispute(Dispute storage dispute, bool releaseToFreelancer) internal {
        dispute.status = releaseToFreelancer ? DisputeStatus.ResolvedRelease : DisputeStatus.ResolvedRefund;

        uint256 disputeId = dispute.disputeId;
        projectManager.resolveDisputedMilestone(dispute.projectId, dispute.milestoneIndex, releaseToFreelancer);

        for (uint256 i = 0; i < PANEL_SIZE; ++i) {
            uint256 arbiterId = dispute.arbiters[i];
            ArbiterVote storage vote = _votes[disputeId][arbiterId];
            if (vote.ruling == Ruling.None) {
                continue;
            }

            bool votedWithMajority = (releaseToFreelancer && vote.ruling == Ruling.ReleaseToFreelancer) ||
                (!releaseToFreelancer && vote.ruling == Ruling.RefundToClient);
            uint8 score = votedWithMajority ? MAJORITY_REPUTATION_SCORE : DISSENT_REPUTATION_SCORE;

            bytes32 referenceId = keccak256(abi.encodePacked("trellis:dispute", disputeId, arbiterId));
            try
                reputationRegistry.giveFeedback(
                    arbiterId,
                    address(this),
                    score,
                    TAG_ARBITER,
                    referenceId,
                    vote.proofURI,
                    vote.reasoningHash
                )
            {} catch {
                emit ArbiterFeedbackSkipped(disputeId, arbiterId);
            }
        }

        emit DisputeResolved(
            disputeId,
            dispute.projectId,
            dispute.milestoneIndex,
            releaseToFreelancer,
            dispute.releaseVotes,
            dispute.refundVotes
        );
    }

    /// @dev Returns the panel slot index (0..2) for `arbiterAgentId`, or reverts `ArbiterNotAssigned`.
    function _findArbiterSlot(
        Dispute storage dispute,
        uint256 arbiterAgentId
    ) internal view returns (uint256 slotIndex) {
        for (uint256 i = 0; i < PANEL_SIZE; ++i) {
            if (dispute.arbiters[i] == arbiterAgentId) {
                return i;
            }
        }
        revert ArbiterNotAssigned(dispute.disputeId, arbiterAgentId);
    }

    /// @dev Returns a storage reference to an existing dispute or reverts `DisputeNotFound`.
    function _getExistingDispute(uint256 disputeId) internal view returns (Dispute storage dispute) {
        if (disputeId == 0 || disputeId > _nextDisputeId) {
            revert DisputeNotFound(disputeId);
        }
        return _disputes[disputeId];
    }
}
