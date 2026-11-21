// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMilestoneEscrow
/// @notice Interface for the Trellis ERC-20 (`tUSD8`) milestone escrow vault.
/// @dev Holds upfront project funding per `(projectId, milestoneIndex)` and settles
///      releases (with configurable protocol fee) or full 0%-fee refunds upon instruction
///      from `ProjectManager` or `DisputeResolution`.
interface IMilestoneEscrow {
    /// @notice Lifecycle state of an individual milestone escrow record.
    enum EscrowStatus {
        Unfunded,
        Locked,
        Released,
        Refunded
    }

    /// @notice Accounting record for a single project milestone.
    /// @param amount Escrowed token amount in base units.
    /// @param payer Address that originally funded the milestone (packed with `status` and `feeBps`).
    /// @param status Current escrow status.
    /// @param feeBps Protocol fee in basis points snapshotted at funding time.
    struct EscrowRecord {
        uint256 amount;
        address payer;
        EscrowStatus status;
        uint16 feeBps;
    }

    /// @notice Emitted when all milestones of a project are funded upfront.
    /// @param projectId Unique project identifier.
    /// @param payer Address from which funds were pulled.
    /// @param totalAmount Sum of all milestone amounts locked.
    /// @param milestoneCount Number of milestones funded.
    event ProjectFunded(
        uint256 indexed projectId,
        address indexed payer,
        uint256 totalAmount,
        uint256 milestoneCount
    );

    /// @notice Emitted when a locked milestone is released to a recipient.
    /// @param projectId Unique project identifier.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param recipient Address receiving the net payout.
    /// @param payout Net amount transferred to `recipient` after fee deduction.
    /// @param fee Protocol fee transferred to `treasury`.
    event MilestoneReleased(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        address indexed recipient,
        uint256 payout,
        uint256 fee
    );

    /// @notice Emitted when a single locked milestone is refunded at 0% fee.
    /// @param projectId Unique project identifier.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param recipient Address receiving the full refund.
    /// @param amount Full escrowed amount refunded.
    event MilestoneRefunded(
        uint256 indexed projectId,
        uint256 indexed milestoneIndex,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when all locked milestones of a cancelled project are refunded.
    /// @param projectId Unique project identifier.
    /// @param recipient Address receiving the combined refund.
    /// @param totalRefunded Total amount refunded across all locked milestones.
    event ProjectRefunded(
        uint256 indexed projectId,
        address indexed recipient,
        uint256 totalRefunded
    );

    /// @notice Emitted when the protocol fee rate or treasury address is updated.
    /// @param feeBps New protocol fee in basis points.
    /// @param treasury New protocol fee treasury address.
    event FeeConfigUpdated(uint16 feeBps, address indexed treasury);

    /// @notice Thrown when a required address parameter is the zero address.
    error ZeroAddress();

    /// @notice Thrown when a fee configuration exceeds `MAX_FEE_BPS` (500 bps / 5%).
    /// @param feeBps Invalid fee value supplied.
    error FeeTooHigh(uint16 feeBps);

    /// @notice Thrown when attempting to fund a project with zero milestones.
    error EmptyMilestones();

    /// @notice Thrown when any milestone amount is zero.
    error ZeroAmount();

    /// @notice Thrown when attempting to fund a project that has already been funded.
    /// @param projectId Already-funded project identifier.
    error AlreadyFunded(uint256 projectId);

    /// @notice Thrown when a release or refund targets a milestone that is not in `Locked` status.
    /// @param projectId Project identifier.
    /// @param milestoneIndex Milestone index.
    /// @param currentStatus Observed status of the escrow record.
    error EscrowNotLocked(uint256 projectId, uint256 milestoneIndex, EscrowStatus currentStatus);

    /// @notice Thrown when cancelling/refunding a project yields zero locked funds.
    /// @param projectId Project identifier.
    error NothingToRefund(uint256 projectId);

    /// @notice Thrown when a caller lacks both `PROJECT_MANAGER_ROLE` and `DISPUTE_RESOLVER_ROLE`.
    /// @param caller Unauthorized caller address.
    error UnauthorizedCaller(address caller);

    /// @notice Updates the protocol fee rate and treasury address.
    /// @dev Restricted to `DEFAULT_ADMIN_ROLE`.
    /// @param newFeeBps New protocol fee in basis points (must be `<= MAX_FEE_BPS`).
    /// @param newTreasury New non-zero treasury address.
    function setFeeConfig(uint16 newFeeBps, address newTreasury) external;

    /// @notice Locks upfront funding for every milestone of a project in a single transfer.
    /// @dev Restricted to `PROJECT_MANAGER_ROLE`. `payer` must approve this contract directly.
    /// @param projectId Unique project identifier.
    /// @param payer Client wallet providing the ERC-20 funds.
    /// @param amounts Ordered array of milestone amounts.
    function fundProjectMilestones(
        uint256 projectId,
        address payer,
        uint256[] calldata amounts
    ) external;

    /// @notice Releases a locked milestone to `recipient`, deducting the protocol fee.
    /// @dev Restricted to `PROJECT_MANAGER_ROLE` or `DISPUTE_RESOLVER_ROLE`.
    /// @param projectId Unique project identifier.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param recipient Address receiving the net payout.
    function releaseMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        address recipient
    ) external;

    /// @notice Refunds a single locked milestone in full (0% fee) to `recipient`.
    /// @dev Restricted to `PROJECT_MANAGER_ROLE` or `DISPUTE_RESOLVER_ROLE`.
    /// @param projectId Unique project identifier.
    /// @param milestoneIndex Zero-based milestone index.
    /// @param recipient Address receiving the full refund.
    function refundMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        address recipient
    ) external;

    /// @notice Refunds all currently locked milestones for a cancelled project in one transfer.
    /// @dev Restricted to `PROJECT_MANAGER_ROLE`. Charges 0% fee.
    /// @param projectId Unique project identifier.
    /// @param milestoneCount Total number of milestones in the project.
    /// @param recipient Address receiving the combined refund.
    /// @return totalRefunded Total token amount refunded.
    function refundAllLockedMilestones(
        uint256 projectId,
        uint256 milestoneCount,
        address recipient
    ) external returns (uint256 totalRefunded);

    /// @notice Returns the stored `EscrowRecord` for a given project milestone.
    /// @param projectId Unique project identifier.
    /// @param milestoneIndex Zero-based milestone index.
    /// @return record The milestone's escrow record.
    function getEscrow(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (EscrowRecord memory record);
}
