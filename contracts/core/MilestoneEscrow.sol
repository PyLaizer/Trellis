// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMilestoneEscrow} from "../interfaces/IMilestoneEscrow.sol";

/// @title MilestoneEscrow
/// @notice Non-custodial ERC-20 (`tUSD8`) milestone escrow vault for the Trellis protocol.
/// @dev Pulls upfront project funding directly from clients via `SafeERC20` and settles
///      milestone releases (subject to a capped protocol fee) or 0%-fee refunds when
///      instructed by `ProjectManager` or `DisputeResolution`.
contract MilestoneEscrow is AccessControl, ReentrancyGuard, IMilestoneEscrow {
    using SafeERC20 for IERC20;

    /// @notice Role granted to `ProjectManager` for funding, releases, and project-cancel refunds.
    bytes32 public constant PROJECT_MANAGER_ROLE = keccak256("PROJECT_MANAGER_ROLE");

    /// @notice Role granted to `DisputeResolution` for dispute-triggered releases and refunds.
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    /// @notice Hard upper bound on the protocol fee (500 bps = 5%).
    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Basis-points denominator (10,000 = 100%).
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice ERC-20 token used for all escrow deposits and payouts (e.g., QDay `tUSD8`).
    IERC20 public immutable token;

    /// @notice Protocol fee rate in basis points applied exclusively on milestone releases.
    uint16 public feeBps;

    /// @notice Recipient address for collected protocol fees.
    address public treasury;

    /// @dev Tracks whether a project ID has already been funded to prevent duplicate funding.
    mapping(uint256 projectId => bool funded) private _projectFunded;

    /// @dev Per-project, per-milestone escrow accounting records.
    mapping(uint256 projectId => mapping(uint256 milestoneIndex => EscrowRecord record)) private _escrows;

    /// @dev Restricts execution to accounts holding either `PROJECT_MANAGER_ROLE` or `DISPUTE_RESOLVER_ROLE`.
    modifier onlyAuthorizedSettler() {
        if (!hasRole(PROJECT_MANAGER_ROLE, msg.sender) && !hasRole(DISPUTE_RESOLVER_ROLE, msg.sender)) {
            revert UnauthorizedCaller(msg.sender);
        }
        _;
    }

    /// @notice Deploys the `MilestoneEscrow` vault.
    /// @param token_ Non-zero ERC-20 token address (`tUSD8`).
    /// @param treasury_ Non-zero protocol fee treasury address.
    /// @param feeBps_ Initial protocol fee in basis points (must be `<= MAX_FEE_BPS`, default 100 = 1%).
    /// @param admin_ Non-zero address granted `DEFAULT_ADMIN_ROLE`.
    constructor(address token_, address treasury_, uint16 feeBps_, address admin_) {
        if (token_ == address(0) || treasury_ == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ > MAX_FEE_BPS) {
            revert FeeTooHigh(feeBps_);
        }

        token = IERC20(token_);
        treasury = treasury_;
        feeBps = feeBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /// @inheritdoc IMilestoneEscrow
    function setFeeConfig(uint16 newFeeBps, address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) {
            revert ZeroAddress();
        }
        if (newFeeBps > MAX_FEE_BPS) {
            revert FeeTooHigh(newFeeBps);
        }

        feeBps = newFeeBps;
        treasury = newTreasury;

        emit FeeConfigUpdated(newFeeBps, newTreasury);
    }

    /// @inheritdoc IMilestoneEscrow
    function fundProjectMilestones(
        uint256 projectId,
        address payer,
        uint256[] calldata amounts
    ) external onlyRole(PROJECT_MANAGER_ROLE) nonReentrant {
        if (payer == address(0)) {
            revert ZeroAddress();
        }
        uint256 milestoneCount = amounts.length;
        if (milestoneCount == 0) {
            revert EmptyMilestones();
        }
        if (_projectFunded[projectId]) {
            revert AlreadyFunded(projectId);
        }

        _projectFunded[projectId] = true;

        uint16 currentFeeBps = feeBps;
        uint256 totalAmount;
        for (uint256 i = 0; i < milestoneCount; ++i) {
            uint256 amount = amounts[i];
            if (amount == 0) {
                revert ZeroAmount();
            }

            totalAmount += amount;
            _escrows[projectId][i] = EscrowRecord({
                amount: amount,
                payer: payer,
                status: EscrowStatus.Locked,
                feeBps: currentFeeBps
            });
        }

        token.safeTransferFrom(payer, address(this), totalAmount);

        emit ProjectFunded(projectId, payer, totalAmount, milestoneCount);
    }

    /// @inheritdoc IMilestoneEscrow
    function releaseMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        address recipient
    ) external onlyAuthorizedSettler nonReentrant {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        EscrowRecord storage record = _escrows[projectId][milestoneIndex];
        if (record.status != EscrowStatus.Locked) {
            revert EscrowNotLocked(projectId, milestoneIndex, record.status);
        }

        record.status = EscrowStatus.Released;

        uint256 amount = record.amount;
        uint256 fee = (amount * record.feeBps) / BPS_DENOMINATOR;
        uint256 payout = amount - fee;

        token.safeTransfer(recipient, payout);
        if (fee > 0) {
            token.safeTransfer(treasury, fee);
        }

        emit MilestoneReleased(projectId, milestoneIndex, recipient, payout, fee);
    }

    /// @inheritdoc IMilestoneEscrow
    function refundMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        address recipient
    ) external onlyAuthorizedSettler nonReentrant {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        EscrowRecord storage record = _escrows[projectId][milestoneIndex];
        if (record.status != EscrowStatus.Locked) {
            revert EscrowNotLocked(projectId, milestoneIndex, record.status);
        }

        record.status = EscrowStatus.Refunded;
        uint256 amount = record.amount;

        token.safeTransfer(recipient, amount);

        emit MilestoneRefunded(projectId, milestoneIndex, recipient, amount);
    }

    /// @inheritdoc IMilestoneEscrow
    function refundAllLockedMilestones(
        uint256 projectId,
        uint256 milestoneCount,
        address recipient
    ) external onlyRole(PROJECT_MANAGER_ROLE) nonReentrant returns (uint256 totalRefunded) {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        for (uint256 i = 0; i < milestoneCount; ++i) {
            EscrowRecord storage record = _escrows[projectId][i];
            if (record.status == EscrowStatus.Locked) {
                record.status = EscrowStatus.Refunded;
                totalRefunded += record.amount;
            }
        }

        if (totalRefunded == 0) {
            revert NothingToRefund(projectId);
        }

        token.safeTransfer(recipient, totalRefunded);

        emit ProjectRefunded(projectId, recipient, totalRefunded);
    }

    /// @inheritdoc IMilestoneEscrow
    function getEscrow(
        uint256 projectId,
        uint256 milestoneIndex
    ) external view returns (EscrowRecord memory record) {
        return _escrows[projectId][milestoneIndex];
    }
}
