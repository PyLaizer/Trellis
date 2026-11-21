// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";
import {IValidationRegistry} from "../interfaces/IValidationRegistry.sol";

/// @title ValidationRegistry
/// @notice ERC-8004 Validation Registry for the Trellis protocol.
/// @dev Issues validation requests to active AI arbiter agents and records their
///      verdicts, reasoning hashes, and opaque proof payloads (e.g., zkML / TEE).
///      Supports both direct submission by the arbiter's owner/operator and atomic
///      recording by a `REQUESTER_ROLE` contract such as `DisputeResolution`.
contract ValidationRegistry is AccessControl, IValidationRegistry {
    /// @notice Role granted to protocol contracts (e.g., `DisputeResolution`) allowed to open requests.
    bytes32 public constant REQUESTER_ROLE = keccak256("REQUESTER_ROLE");

    /// @notice Reference to the ERC-8004 IdentityRegistry used to verify arbiters and operators.
    IIdentityRegistry public immutable identityRegistry;

    /// @notice Monotonic nonce used to guarantee unique deterministic request IDs.
    uint256 private _nonce;

    /// @notice Mapping from request ID to its full `ValidationRequest` record.
    mapping(bytes32 requestId => ValidationRequest) private _requests;

    /// @notice Mapping from subject ID (e.g., dispute ID) to all associated request IDs.
    mapping(uint256 subjectId => bytes32[]) private _subjectRequests;

    /// @notice Mapping from validator agent ID to all request IDs assigned to that validator.
    mapping(uint256 validatorAgentId => bytes32[]) private _validatorRequests;

    /// @notice Initializes the ValidationRegistry with the IdentityRegistry and admin address.
    /// @param identityRegistry_ Address of the deployed `IdentityRegistry`.
    /// @param admin_ Address granted `DEFAULT_ADMIN_ROLE`.
    constructor(address identityRegistry_, address admin_) {
        if (identityRegistry_ == address(0) || admin_ == address(0)) {
            revert ZeroAddress();
        }
        identityRegistry = IIdentityRegistry(identityRegistry_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /// @inheritdoc IValidationRegistry
    function requestValidation(
        uint256 validatorAgentId,
        uint256 subjectId,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external override onlyRole(REQUESTER_ROLE) returns (bytes32 requestId) {
        if (!identityRegistry.isActiveArbiter(validatorAgentId)) {
            revert InvalidValidator(validatorAgentId);
        }

        requestId = keccak256(
            abi.encodePacked(block.chainid, address(this), ++_nonce, validatorAgentId, subjectId)
        );

        _requests[requestId] = ValidationRequest({
            requestId: requestId,
            validatorAgentId: validatorAgentId,
            subjectId: subjectId,
            requester: msg.sender,
            evidenceHash: evidenceHash,
            evidenceURI: evidenceURI,
            status: ValidationStatus.Pending,
            responseCode: 0,
            reasoningHash: bytes32(0),
            proofURI: "",
            proof: "",
            requestedAt: uint64(block.timestamp),
            respondedAt: 0
        });

        _subjectRequests[subjectId].push(requestId);
        _validatorRequests[validatorAgentId].push(requestId);

        emit ValidationRequested(requestId, validatorAgentId, subjectId, evidenceHash, evidenceURI);
    }

    /// @inheritdoc IValidationRegistry
    function submitValidation(
        bytes32 requestId,
        uint8 responseCode,
        bytes32 reasoningHash,
        string calldata proofURI,
        bytes calldata proof
    ) external override {
        ValidationRequest storage req = _requests[requestId];
        if (req.requestedAt == 0) {
            revert ValidationNotFound(requestId);
        }
        if (req.status != ValidationStatus.Pending) {
            revert ValidationAlreadySubmitted(requestId);
        }

        bool isOriginalRequester = msg.sender == req.requester && hasRole(REQUESTER_ROLE, msg.sender);
        if (!isOriginalRequester && !identityRegistry.isAuthorized(msg.sender, req.validatorAgentId)) {
            revert UnauthorizedValidator(msg.sender, req.validatorAgentId);
        }

        req.status = responseCode > 0 ? ValidationStatus.Approved : ValidationStatus.Rejected;
        req.responseCode = responseCode;
        req.reasoningHash = reasoningHash;
        req.proofURI = proofURI;
        req.proof = proof;
        req.respondedAt = uint64(block.timestamp);

        emit ValidationSubmitted(
            requestId,
            req.validatorAgentId,
            req.subjectId,
            responseCode,
            reasoningHash,
            proofURI
        );
    }

    /// @inheritdoc IValidationRegistry
    function getValidation(bytes32 requestId) external view override returns (ValidationRequest memory request) {
        if (_requests[requestId].requestedAt == 0) {
            revert ValidationNotFound(requestId);
        }
        return _requests[requestId];
    }

    /// @inheritdoc IValidationRegistry
    function getSubjectValidations(uint256 subjectId) external view override returns (bytes32[] memory requestIds) {
        return _subjectRequests[subjectId];
    }

    /// @inheritdoc IValidationRegistry
    function getValidatorRequests(
        uint256 validatorAgentId
    ) external view override returns (bytes32[] memory requestIds) {
        return _validatorRequests[validatorAgentId];
    }
}
