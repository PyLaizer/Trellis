// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IReputationRegistry} from "../interfaces/IReputationRegistry.sol";
import {IMilestoneEscrow} from "../interfaces/IMilestoneEscrow.sol";
import {IProjectManager} from "../interfaces/IProjectManager.sol";

/// @title ProjectManager
/// @notice Core project and milestone lifecycle orchestrator for the Trellis protocol.
/// @dev Enforces ERC-8004 role verification, snapshots participant wallets to prevent mid-project
///      NFT-transfer hijacking, coordinates upfront escrow funding/settlements, and reports
///      post-settlement counterparty ratings to `ReputationRegistry`.
contract ProjectManager is AccessControl, ReentrancyGuard, IProjectManager {
    /// @notice Role granted to `DisputeResolution` to mark and settle disputed milestones.
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    /// @notice Maximum number of milestones permitted per project to bound loop gas costs.
    uint256 public constant MAX_MILESTONES = 20;

    /// @notice Reputation tag used when rating counterparties on settled milestones.
    bytes32 public constant TAG_MILESTONE = keccak256("milestone");

    /// @notice ERC-8004 Agent Identity Registry contract.
    IIdentityRegistry public immutable identityRegistry;

    /// @notice ERC-8004 Reputation Registry contract.
    IReputationRegistry public immutable reputationRegistry;

    /// @notice Milestone ERC-20 escrow vault contract.
    IMilestoneEscrow public immutable escrow;

    /// @dev Monotonically increasing counter for 1-indexed project IDs.
    uint256 private _nextProjectId;

    /// @dev Project records keyed by `projectId`.
    mapping(uint256 projectId => Project project) private _projects;

    /// @dev Milestone records keyed by `(projectId, milestoneIndex)`.
    mapping(uint256 projectId => mapping(uint256 milestoneIndex => Milestone milestone)) private _milestones;

    /// @notice Deploys the `ProjectManager` orchestrator.
    /// @param identityRegistry_ Non-zero `IdentityRegistry` address.
    /// @param reputationRegistry_ Non-zero `ReputationRegistry` address.
    /// @param escrow_ Non-zero `MilestoneEscrow` address.
    /// @param admin_ Non-zero address granted `DEFAULT_ADMIN_ROLE`.
    constructor(
        address identityRegistry_,
        address reputationRegistry_,
        address escrow_,
        address admin_
    ) {
        if (
            identityRegistry_ == address(0) ||
            reputationRegistry_ == address(0) ||
            escrow_ == address(0) ||
            admin_ == address(0)
        ) {
            revert ZeroAddress();
        }

        identityRegistry = IIdentityRegistry(identityRegistry_);
        reputationRegistry = IReputationRegistry(reputationRegistry_);
        escrow = IMilestoneEscrow(escrow_);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /// @inheritdoc IProjectManager
    function createProject(
        uint256 clientAgentId,
        uint256 targetFreelancerAgentId,
        string calldata metadataURI,
        uint256[] calldata milestoneAmounts,
        uint64[] calldata milestoneDueDates,
        string[] calldata milestoneDescriptionURIs
    ) external nonReentrant returns (uint256 projectId) {
        if (!identityRegistry.isAuthorized(msg.sender, clientAgentId)) {
            revert UnauthorizedAgent(msg.sender, clientAgentId);
        }

        IIdentityRegistry.AgentInfo memory clientInfo = identityRegistry.getAgentInfo(clientAgentId);
        if (clientInfo.role != IIdentityRegistry.AgentRole.Client || !clientInfo.active) {
            revert InvalidAgentRoleOrInactive(clientAgentId);
        }

        if (targetFreelancerAgentId != 0) {
            if (!identityRegistry.agentExists(targetFreelancerAgentId)) {
                revert InvalidAgentRoleOrInactive(targetFreelancerAgentId);
            }
            IIdentityRegistry.AgentInfo memory freelancerInfo = identityRegistry.getAgentInfo(
                targetFreelancerAgentId
            );
            if (freelancerInfo.role != IIdentityRegistry.AgentRole.Freelancer || !freelancerInfo.active) {
                revert InvalidAgentRoleOrInactive(targetFreelancerAgentId);
            }
            if (
                identityRegistry.ownerOf(clientAgentId) == identityRegistry.ownerOf(targetFreelancerAgentId) ||
                identityRegistry.isAuthorized(msg.sender, targetFreelancerAgentId)
            ) {
                revert SelfHiringNotAllowed(clientAgentId, targetFreelancerAgentId);
            }
        }

        if (bytes(metadataURI).length == 0) {
            revert EmptyURI();
        }

        uint256 milestoneCount = milestoneAmounts.length;
        if (milestoneCount == 0 || milestoneCount > MAX_MILESTONES) {
            revert InvalidMilestoneCount(milestoneCount);
        }
        if (
            milestoneDueDates.length != milestoneCount ||
            milestoneDescriptionURIs.length != milestoneCount
        ) {
            revert ArrayLengthMismatch();
        }

        projectId = ++_nextProjectId;
        uint256 totalBudget;

        for (uint256 i = 0; i < milestoneCount; ++i) {
            uint256 amount = milestoneAmounts[i];
            if (amount == 0) {
                revert ZeroMilestoneAmount(i);
            }
            if (bytes(milestoneDescriptionURIs[i]).length == 0) {
                revert EmptyURI();
            }

            totalBudget += amount;
            _milestones[projectId][i] = Milestone({
                amount: amount,
                dueDate: milestoneDueDates[i],
                submittedAt: 0,
                status: MilestoneStatus.Pending,
                deliverableHash: bytes32(0),
                descriptionURI: milestoneDescriptionURIs[i],
                deliverableURI: ""
            });
        }

        _projects[projectId] = Project({
            projectId: projectId,
            clientAgentId: clientAgentId,
            freelancerAgentId: targetFreelancerAgentId,
            client: msg.sender,
            status: ProjectStatus.Open,
            milestoneCount: uint8(milestoneCount),
            settledCount: 0,
            createdAt: uint64(block.timestamp),
            freelancer: address(0),
            totalBudget: totalBudget,
            metadataURI: metadataURI
        });

        escrow.fundProjectMilestones(projectId, msg.sender, milestoneAmounts);

        emit ProjectCreated(
            projectId,
            clientAgentId,
            targetFreelancerAgentId,
            msg.sender,
            totalBudget,
            uint8(milestoneCount),
            metadataURI
        );
    }

    /// @inheritdoc IProjectManager
    function cancelProject(uint256 projectId) external nonReentrant {
        Project storage project = _getExistingProject(projectId);

        if (msg.sender != project.client) {
            revert UnauthorizedParticipant(msg.sender, projectId);
        }
        if (project.status != ProjectStatus.Open) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Open);
        }

        project.status = ProjectStatus.Cancelled;

        uint256 totalRefunded = escrow.refundAllLockedMilestones(
            projectId,
            project.milestoneCount,
            project.client
        );

        emit ProjectCancelled(projectId, project.client, totalRefunded);
    }

    /// @inheritdoc IProjectManager
    function acceptProject(uint256 projectId, uint256 freelancerAgentId) external {
        Project storage project = _getExistingProject(projectId);

        if (project.status != ProjectStatus.Open) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Open);
        }
        if (!identityRegistry.isAuthorized(msg.sender, freelancerAgentId)) {
            revert UnauthorizedAgent(msg.sender, freelancerAgentId);
        }

        IIdentityRegistry.AgentInfo memory freelancerInfo = identityRegistry.getAgentInfo(
            freelancerAgentId
        );
        if (freelancerInfo.role != IIdentityRegistry.AgentRole.Freelancer || !freelancerInfo.active) {
            revert InvalidAgentRoleOrInactive(freelancerAgentId);
        }

        if (
            msg.sender == project.client ||
            identityRegistry.ownerOf(project.clientAgentId) == identityRegistry.ownerOf(freelancerAgentId) ||
            identityRegistry.isAuthorized(msg.sender, project.clientAgentId)
        ) {
            revert SelfHiringNotAllowed(project.clientAgentId, freelancerAgentId);
        }

        if (project.freelancerAgentId != 0 && freelancerAgentId != project.freelancerAgentId) {
            revert NotTargetFreelancer(projectId, project.freelancerAgentId, freelancerAgentId);
        }

        project.freelancerAgentId = freelancerAgentId;
        project.freelancer = msg.sender;
        project.status = ProjectStatus.Active;

        emit ProjectAccepted(projectId, freelancerAgentId, msg.sender);
    }

    /// @inheritdoc IProjectManager
    function submitDeliverable(
        uint256 projectId,
        uint256 milestoneIndex,
        string calldata deliverableURI,
        bytes32 deliverableHash
    ) external {
        Project storage project = _getExistingProject(projectId);

        if (project.status != ProjectStatus.Active) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Active);
        }
        if (msg.sender != project.freelancer) {
            revert UnauthorizedParticipant(msg.sender, projectId);
        }
        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }

        Milestone storage milestone = _milestones[projectId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Pending) {
            revert InvalidMilestoneStatus(projectId, milestoneIndex, milestone.status);
        }
        if (bytes(deliverableURI).length == 0) {
            revert EmptyURI();
        }
        if (deliverableHash == bytes32(0)) {
            revert EmptyDeliverableHash();
        }

        milestone.deliverableURI = deliverableURI;
        milestone.deliverableHash = deliverableHash;
        milestone.submittedAt = uint64(block.timestamp);
        milestone.status = MilestoneStatus.Submitted;

        emit DeliverableSubmitted(projectId, milestoneIndex, deliverableURI, deliverableHash);
    }

    /// @inheritdoc IProjectManager
    function approveMilestone(uint256 projectId, uint256 milestoneIndex) external nonReentrant {
        Project storage project = _getExistingProject(projectId);

        if (project.status != ProjectStatus.Active) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Active);
        }
        if (msg.sender != project.client) {
            revert UnauthorizedParticipant(msg.sender, projectId);
        }
        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }

        Milestone storage milestone = _milestones[projectId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Submitted) {
            revert InvalidMilestoneStatus(projectId, milestoneIndex, milestone.status);
        }

        milestone.status = MilestoneStatus.Approved;
        bool completed = _recordMilestoneSettled(project);

        escrow.releaseMilestone(projectId, milestoneIndex, project.freelancer);

        emit MilestoneApproved(projectId, milestoneIndex, milestone.amount);
        if (completed) {
            emit ProjectCompleted(projectId);
        }
    }

    /// @inheritdoc IProjectManager
    function markMilestoneDisputed(
        uint256 projectId,
        uint256 milestoneIndex
    ) external onlyRole(DISPUTE_RESOLVER_ROLE) {
        Project storage project = _getExistingProject(projectId);

        if (project.status != ProjectStatus.Active) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Active);
        }
        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }

        Milestone storage milestone = _milestones[projectId][milestoneIndex];
        bool isOverduePending = milestone.status == MilestoneStatus.Pending &&
            milestone.dueDate != 0 &&
            block.timestamp > milestone.dueDate;
        if (milestone.status != MilestoneStatus.Submitted && !isOverduePending) {
            revert InvalidMilestoneStatus(projectId, milestoneIndex, milestone.status);
        }

        milestone.status = MilestoneStatus.Disputed;

        emit MilestoneDisputed(projectId, milestoneIndex);
    }

    /// @inheritdoc IProjectManager
    function resolveDisputedMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        bool releaseToFreelancer
    ) external onlyRole(DISPUTE_RESOLVER_ROLE) nonReentrant {
        Project storage project = _getExistingProject(projectId);

        if (project.status != ProjectStatus.Active) {
            revert InvalidProjectStatus(projectId, project.status, ProjectStatus.Active);
        }
        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }

        Milestone storage milestone = _milestones[projectId][milestoneIndex];
        if (milestone.status != MilestoneStatus.Disputed) {
            revert InvalidMilestoneStatus(projectId, milestoneIndex, milestone.status);
        }

        milestone.status = releaseToFreelancer
            ? MilestoneStatus.ResolvedRelease
            : MilestoneStatus.ResolvedRefund;
        bool completed = _recordMilestoneSettled(project);

        if (releaseToFreelancer) {
            escrow.releaseMilestone(projectId, milestoneIndex, project.freelancer);
        } else {
            escrow.refundMilestone(projectId, milestoneIndex, project.client);
        }

        emit MilestoneDisputeResolved(projectId, milestoneIndex, releaseToFreelancer);
        if (completed) {
            emit ProjectCompleted(projectId);
        }
    }

    /// @inheritdoc IProjectManager
    function rateCounterparty(
        uint256 projectId,
        uint256 milestoneIndex,
        uint8 score,
        string calldata commentURI,
        bytes32 commentHash
    ) external {
        Project storage project = _getExistingProject(projectId);

        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }

        MilestoneStatus status = _milestones[projectId][milestoneIndex].status;
        if (
            status != MilestoneStatus.Approved &&
            status != MilestoneStatus.ResolvedRelease &&
            status != MilestoneStatus.ResolvedRefund
        ) {
            revert MilestoneNotSettled(projectId, milestoneIndex);
        }

        uint256 targetAgentId;
        if (msg.sender == project.client) {
            targetAgentId = project.freelancerAgentId;
        } else if (msg.sender == project.freelancer) {
            targetAgentId = project.clientAgentId;
        } else {
            revert UnauthorizedParticipant(msg.sender, projectId);
        }

        bytes32 referenceId = keccak256(abi.encodePacked("trellis:milestone", projectId, milestoneIndex));

        reputationRegistry.giveFeedback(
            targetAgentId,
            msg.sender,
            score,
            TAG_MILESTONE,
            referenceId,
            commentURI,
            commentHash
        );

        emit CounterpartyRated(projectId, milestoneIndex, targetAgentId, msg.sender, score);
    }

    /// @inheritdoc IProjectManager
    function getProject(uint256 projectId) external view returns (Project memory project) {
        return _getExistingProject(projectId);
    }

    /// @inheritdoc IProjectManager
    function getMilestone(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (Milestone memory milestone) {
        Project storage project = _getExistingProject(projectId);
        if (milestoneIndex >= project.milestoneCount) {
            revert MilestoneNotFound(projectId, milestoneIndex);
        }
        return _milestones[projectId][milestoneIndex];
    }

    /// @inheritdoc IProjectManager
    function getProjectMilestones(
        uint256 projectId
    ) external view returns (Milestone[] memory milestones) {
        Project storage project = _getExistingProject(projectId);
        uint256 count = project.milestoneCount;
        milestones = new Milestone[](count);
        for (uint256 i = 0; i < count; ++i) {
            milestones[i] = _milestones[projectId][i];
        }
    }

    /// @inheritdoc IProjectManager
    function totalProjects() external view returns (uint256 total) {
        return _nextProjectId;
    }

    /// @dev Returns a storage reference to an existing project or reverts `ProjectNotFound`.
    function _getExistingProject(uint256 projectId) internal view returns (Project storage project) {
        if (projectId == 0 || projectId > _nextProjectId) {
            revert ProjectNotFound(projectId);
        }
        return _projects[projectId];
    }

    /// @dev Increments a project's settled milestone count and completes the project when all are settled.
    function _recordMilestoneSettled(Project storage project) internal returns (bool completed) {
        uint8 settled = ++project.settledCount;
        if (settled == project.milestoneCount) {
            project.status = ProjectStatus.Completed;
            return true;
        }
        return false;
    }
}
