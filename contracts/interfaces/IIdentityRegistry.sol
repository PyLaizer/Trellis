// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";

/// @title IIdentityRegistry
/// @notice Interface for the Trellis ERC-8004 Agent Identity Registry.
/// @dev Allows wallets to mint multiple ERC-721 identity tokens representing
///      Clients, Freelancers, or AI Arbiter agents, with on-chain role status,
///      metadata key-value storage, and O(1) active-arbiter enumeration.
interface IIdentityRegistry is IERC721Metadata {
    /// @notice Role assigned to a registered Trellis participant or AI agent.
    enum AgentRole {
        Client,
        Freelancer,
        Arbiter
    }

    /// @notice Core registration metadata stored for each agent identity NFT.
    /// @param role Functional role of the agent in the Trellis protocol.
    /// @param active Whether the agent identity is currently active.
    /// @param registeredAt Block timestamp when the identity was minted.
    struct AgentInfo {
        AgentRole role;
        bool active;
        uint64 registeredAt;
    }

    /// @notice Emitted when a new agent identity NFT is registered and minted.
    /// @param agentId Newly minted agent token ID (1-indexed).
    /// @param owner Address that received the agent identity NFT.
    /// @param role Role assigned to the agent.
    /// @param agentURI URI pointing to the off-chain ERC-8004 agent card metadata.
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        AgentRole role,
        string agentURI
    );

    /// @notice Emitted when an agent's metadata URI is updated.
    /// @param agentId Agent token ID whose URI changed.
    /// @param newURI New URI pointing to updated agent card metadata.
    event AgentURIUpdated(uint256 indexed agentId, string newURI);

    /// @notice Emitted when an agent's active status is toggled.
    /// @param agentId Agent token ID whose status changed.
    /// @param active New active status.
    event AgentStatusUpdated(uint256 indexed agentId, bool active);

    /// @notice Emitted when an arbitrary key-value metadata entry is set for an agent.
    /// @param agentId Agent token ID whose metadata was updated.
    /// @param indexedKey Indexed hash of the metadata key for efficient log filtering.
    /// @param key Plaintext metadata key.
    /// @param value Raw metadata bytes stored for the key.
    event MetadataSet(
        uint256 indexed agentId,
        string indexed indexedKey,
        string key,
        bytes value
    );

    /// @notice Thrown when an empty URI string is supplied.
    error EmptyURI();

    /// @notice Thrown when an empty metadata key is supplied.
    error EmptyMetadataKey();

    /// @notice Thrown when querying or mutating a non-existent agent ID.
    /// @param agentId The unknown agent token ID.
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when a caller is neither the owner nor an approved operator of the agent NFT.
    /// @param caller Address attempting the unauthorized action.
    /// @param agentId Target agent token ID.
    error UnauthorizedAgentOperator(address caller, uint256 agentId);

    /// @notice Thrown when requesting an active arbiter at an out-of-bounds array index.
    /// @param index Requested array index.
    /// @param length Current number of active arbiters.
    error ArbiterIndexOutOfBounds(uint256 index, uint256 length);

    /// @notice Registers a new agent identity NFT for `msg.sender`.
    /// @param agentURI Non-empty URI describing the agent (e.g., IPFS or HTTPS JSON).
    /// @param role Protocol role assigned to the agent.
    /// @return agentId Newly minted token ID starting at 1.
    function register(string calldata agentURI, AgentRole role) external returns (uint256 agentId);

    /// @notice Updates the metadata URI for an existing agent identity.
    /// @param agentId Agent token ID to update.
    /// @param newURI Non-empty replacement URI.
    function setAgentURI(uint256 agentId, string calldata newURI) external;

    /// @notice Enables or disables an agent identity.
    /// @dev For arbiters, updates membership in the active-arbiter list in O(1).
    /// @param agentId Agent token ID to update.
    /// @param active Desired active state.
    function setActive(uint256 agentId, bool active) external;

    /// @notice Sets an optional ERC-8004 key-value metadata entry on an agent identity.
    /// @param agentId Agent token ID to update.
    /// @param key Non-empty metadata key.
    /// @param value Arbitrary ABI-encoded or raw metadata bytes.
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external;

    /// @notice Reads a key-value metadata entry for an agent identity.
    /// @param agentId Agent token ID to query.
    /// @param key Metadata key to retrieve.
    /// @return value Stored metadata bytes (empty if unset).
    function getMetadata(uint256 agentId, string calldata key) external view returns (bytes memory value);

    /// @notice Checks whether an agent token ID has been minted and exists.
    /// @param agentId Agent token ID to check.
    /// @return exists True if the token exists.
    function agentExists(uint256 agentId) external view returns (bool exists);

    /// @notice Checks whether `operator` is the owner or an approved operator for `agentId`.
    /// @param operator Address to check authorization for.
    /// @param agentId Agent token ID.
    /// @return authorized True if `agentId` exists and `operator` is authorized.
    function isAuthorized(address operator, uint256 agentId) external view returns (bool authorized);

    /// @notice Returns the stored `AgentInfo` struct for a registered agent.
    /// @param agentId Agent token ID to query.
    /// @return info The agent's role, active flag, and registration timestamp.
    function getAgentInfo(uint256 agentId) external view returns (AgentInfo memory info);

    /// @notice Checks whether an agent exists, has the `Arbiter` role, and is currently active.
    /// @param agentId Agent token ID to check.
    /// @return activeArbiter True if the agent is an active arbiter.
    function isActiveArbiter(uint256 agentId) external view returns (bool activeArbiter);

    /// @notice Returns the full list of currently active arbiter agent IDs.
    /// @return arbiters Array of active arbiter token IDs.
    function getActiveArbiters() external view returns (uint256[] memory arbiters);

    /// @notice Returns the current count of active arbiters.
    /// @return count Number of active arbiters.
    function getActiveArbiterCount() external view returns (uint256 count);

    /// @notice Returns the active arbiter agent ID at `index`.
    /// @param index Zero-based index into the active arbiters array.
    /// @return agentId Arbiter token ID at the requested index.
    function getActiveArbiterAt(uint256 index) external view returns (uint256 agentId);

    /// @notice Returns the total number of agent identities minted so far.
    /// @return total Total minted agent count.
    function totalAgents() external view returns (uint256 total);
}
