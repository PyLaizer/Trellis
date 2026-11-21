// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IValidationRegistry
/// @notice Interface for the Trellis ERC-8004 Validation Registry.
/// @dev Tracks validation requests issued to active AI arbiter agents and stores
///      their verdicts, reasoning hashes, and opaque proof payloads (e.g., zkML / TEE).
interface IValidationRegistry {
    /// @notice Lifecycle status of a validation request.
    enum ValidationStatus {
        Pending,
        Approved,
        Rejected
    }

    /// @notice Complete on-chain record for an ERC-8004 validation request and response.
    /// @param requestId Deterministic unique identifier for the request.
    /// @param validatorAgentId ERC-8004 agent ID of the assigned arbiter validator.
    /// @param subjectId Protocol subject identifier (e.g., `disputeId`).
    /// @param requester Address of the contract that initiated the validation request.
    /// @param evidenceHash Keccak256 hash of the dispute evidence bundle.
    /// @param evidenceURI URI pointing to the evidence bundle.
    /// @param status Current lifecycle status (`Pending`, `Approved`, or `Rejected`).
    /// @param responseCode Outcome code (0 = Rejected; >0 = Approved, e.g., 1 = Release, 2 = Refund).
    /// @param reasoningHash Keccak256 hash of the arbiter's off-chain reasoning report.
    /// @param proofURI URI pointing to the arbiter's reasoning / attestation artifact.
    /// @param proof Opaque proof bytes reserved for zkML or TEE attestations.
    /// @param requestedAt Block timestamp when the request was created.
    /// @param respondedAt Block timestamp when the validation response was submitted (0 if pending).
    struct ValidationRequest {
        bytes32 requestId;
        uint256 validatorAgentId;
        uint256 subjectId;
        address requester;
        ValidationStatus status;
        uint8 responseCode;
        uint64 requestedAt;
        uint64 respondedAt;
        bytes32 evidenceHash;
        string evidenceURI;
        bytes32 reasoningHash;
        string proofURI;
        bytes proof;
    }

    /// @notice Emitted when a new validation request is opened for an active arbiter.
    /// @param requestId Deterministic unique request ID.
    /// @param validatorAgentId Assigned arbiter's ERC-8004 agent ID.
    /// @param subjectId Subject identifier (e.g., dispute ID).
    /// @param evidenceHash Hash of the evidence payload.
    /// @param evidenceURI URI of the evidence payload.
    event ValidationRequested(
        bytes32 indexed requestId,
        uint256 indexed validatorAgentId,
        uint256 indexed subjectId,
        bytes32 evidenceHash,
        string evidenceURI
    );

    /// @notice Emitted when a validation response is recorded for a pending request.
    /// @param requestId Request ID being fulfilled.
    /// @param validatorAgentId Arbiter's ERC-8004 agent ID.
    /// @param subjectId Subject identifier (e.g., dispute ID).
    /// @param responseCode Outcome code (0 = Rejected; >0 = Approved).
    /// @param reasoningHash Hash of the validator's reasoning document.
    /// @param proofURI URI of the validator's proof/reasoning artifact.
    event ValidationSubmitted(
        bytes32 indexed requestId,
        uint256 indexed validatorAgentId,
        uint256 indexed subjectId,
        uint8 responseCode,
        bytes32 reasoningHash,
        string proofURI
    );

    /// @notice Thrown when a required address parameter is the zero address.
    error ZeroAddress();

    /// @notice Thrown when `validatorAgentId` is not an active arbiter in `IdentityRegistry`.
    /// @param validatorAgentId Invalid or inactive arbiter agent ID.
    error InvalidValidator(uint256 validatorAgentId);

    /// @notice Thrown when referencing an unknown validation request ID.
    /// @param requestId Unknown request ID.
    error ValidationNotFound(bytes32 requestId);

    /// @notice Thrown when attempting to submit a response for a non-pending validation request.
    /// @param requestId Already-resolved request ID.
    error ValidationAlreadySubmitted(bytes32 requestId);

    /// @notice Thrown when a caller is neither authorized for `validatorAgentId` nor holds `REQUESTER_ROLE`.
    /// @param caller Unauthorized caller address.
    /// @param validatorAgentId Assigned validator's ERC-8004 agent ID.
    error UnauthorizedValidator(address caller, uint256 validatorAgentId);

    /// @notice Creates a new validation request targeting an active arbiter agent.
    /// @dev Restricted to accounts holding `REQUESTER_ROLE`.
    /// @param validatorAgentId ERC-8004 agent ID of an active arbiter.
    /// @param subjectId Protocol subject ID (e.g., dispute ID).
    /// @param evidenceHash Keccak256 hash of the evidence bundle.
    /// @param evidenceURI URI pointing to the evidence bundle.
    /// @return requestId Deterministic unique identifier for the created request.
    function requestValidation(
        uint256 validatorAgentId,
        uint256 subjectId,
        bytes32 evidenceHash,
        string calldata evidenceURI
    ) external returns (bytes32 requestId);

    /// @notice Submits a validation response and optional cryptographic proof for a pending request.
    /// @dev Callable by the owner/approved operator of `validatorAgentId` or by `REQUESTER_ROLE`.
    /// @param requestId Identifier of the pending validation request.
    /// @param responseCode Outcome code (`0` sets status to `Rejected`; `> 0` sets `Approved`).
    /// @param reasoningHash Keccak256 hash of the off-chain reasoning report.
    /// @param proofURI URI pointing to the reasoning or proof artifact.
    /// @param proof Opaque proof bytes (e.g., zkML or TEE attestation).
    function submitValidation(
        bytes32 requestId,
        uint8 responseCode,
        bytes32 reasoningHash,
        string calldata proofURI,
        bytes calldata proof
    ) external;

    /// @notice Returns the full `ValidationRequest` struct for a given `requestId`.
    /// @param requestId Validation request identifier.
    /// @return request Stored `ValidationRequest` record.
    function getValidation(bytes32 requestId) external view returns (ValidationRequest memory request);

    /// @notice Returns all validation request IDs associated with a subject (e.g., dispute ID).
    /// @param subjectId Subject identifier.
    /// @return requestIds Array of validation request IDs.
    function getSubjectValidations(uint256 subjectId) external view returns (bytes32[] memory requestIds);

    /// @notice Returns all validation request IDs assigned to a specific validator agent.
    /// @param validatorAgentId Validator's ERC-8004 agent ID.
    /// @return requestIds Array of validation request IDs.
    function getValidatorRequests(uint256 validatorAgentId) external view returns (bytes32[] memory requestIds);
}
