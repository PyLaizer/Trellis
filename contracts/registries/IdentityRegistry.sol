// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/// @title IdentityRegistry
/// @notice ERC-8004 Agent Identity Registry for the Trellis protocol.
/// @dev Mints ERC-721 identity NFTs for Clients, Freelancers, and AI Arbiters.
///      A single wallet may own multiple identity NFTs (e.g., multiple AI arbiter
///      agents or distinct Client and Freelancer profiles). Active arbiters are
///      tracked in an O(1) swap-and-pop enumerable list for efficient selection.
contract IdentityRegistry is ERC721URIStorage, IIdentityRegistry {
    /// @notice Incremental counter for minted agent IDs (1-indexed).
    uint256 private _nextAgentId;

    /// @notice Mapping from agent ID to its role, active flag, and registration timestamp.
    mapping(uint256 agentId => AgentInfo) private _agents;

    /// @notice Optional ERC-8004 arbitrary key-value metadata per agent ID.
    mapping(uint256 agentId => mapping(string key => bytes value)) private _metadata;

    /// @notice Enumerable array of currently active arbiter agent IDs.
    uint256[] private _activeArbiters;

    /// @notice 1-based index of an arbiter agent ID in `_activeArbiters` (0 means absent).
    mapping(uint256 agentId => uint256 indexPlusOne) private _activeArbiterIndex;

    /// @notice Initializes the ERC-721 collection name and symbol.
    constructor() ERC721("Trellis Agent Identity", "TRELLIS-ID") {}

    /// @inheritdoc IIdentityRegistry
    function register(string calldata agentURI, AgentRole role) external override returns (uint256 agentId) {
        if (bytes(agentURI).length == 0) {
            revert EmptyURI();
        }

        agentId = ++_nextAgentId;

        _agents[agentId] = AgentInfo({
            role: role,
            active: true,
            registeredAt: uint64(block.timestamp)
        });

        if (role == AgentRole.Arbiter) {
            _addActiveArbiter(agentId);
        }

        _setTokenURI(agentId, agentURI);
        emit AgentRegistered(agentId, msg.sender, role, agentURI);
        _safeMint(msg.sender, agentId);
    }

    /// @inheritdoc IIdentityRegistry
    function setAgentURI(uint256 agentId, string calldata newURI) external override {
        _requireAuthorized(agentId);
        if (bytes(newURI).length == 0) {
            revert EmptyURI();
        }

        _setTokenURI(agentId, newURI);

        emit AgentURIUpdated(agentId, newURI);
    }

    /// @inheritdoc IIdentityRegistry
    function setActive(uint256 agentId, bool active) external override {
        _requireAuthorized(agentId);

        AgentInfo storage info = _agents[agentId];
        if (info.active == active) {
            return;
        }

        info.active = active;

        if (info.role == AgentRole.Arbiter) {
            if (active) {
                _addActiveArbiter(agentId);
            } else {
                _removeActiveArbiter(agentId);
            }
        }

        emit AgentStatusUpdated(agentId, active);
    }

    /// @inheritdoc IIdentityRegistry
    function setMetadata(uint256 agentId, string calldata key, bytes calldata value) external override {
        _requireAuthorized(agentId);
        if (bytes(key).length == 0) {
            revert EmptyMetadataKey();
        }

        _metadata[agentId][key] = value;

        emit MetadataSet(agentId, key, key, value);
    }

    /// @inheritdoc IIdentityRegistry
    function getMetadata(uint256 agentId, string calldata key) external view override returns (bytes memory value) {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentNotFound(agentId);
        }
        return _metadata[agentId][key];
    }

    /// @inheritdoc IIdentityRegistry
    function agentExists(uint256 agentId) external view override returns (bool exists) {
        return _ownerOf(agentId) != address(0);
    }

    /// @inheritdoc IIdentityRegistry
    function isAuthorized(address operator, uint256 agentId) external view override returns (bool authorized) {
        address owner = _ownerOf(agentId);
        return owner != address(0) && _isAuthorized(owner, operator, agentId);
    }

    /// @inheritdoc IIdentityRegistry
    function getAgentInfo(uint256 agentId) external view override returns (AgentInfo memory info) {
        if (_ownerOf(agentId) == address(0)) {
            revert AgentNotFound(agentId);
        }
        return _agents[agentId];
    }

    /// @inheritdoc IIdentityRegistry
    function isActiveArbiter(uint256 agentId) external view override returns (bool activeArbiter) {
        return _ownerOf(agentId) != address(0) && _agents[agentId].role == AgentRole.Arbiter && _agents[agentId].active;
    }

    /// @inheritdoc IIdentityRegistry
    function getActiveArbiters() external view override returns (uint256[] memory arbiters) {
        return _activeArbiters;
    }

    /// @inheritdoc IIdentityRegistry
    function getActiveArbiterCount() external view override returns (uint256 count) {
        return _activeArbiters.length;
    }

    /// @inheritdoc IIdentityRegistry
    function getActiveArbiterAt(uint256 index) external view override returns (uint256 agentId) {
        uint256 length = _activeArbiters.length;
        if (index >= length) {
            revert ArbiterIndexOutOfBounds(index, length);
        }
        return _activeArbiters[index];
    }

    /// @inheritdoc IIdentityRegistry
    function totalAgents() external view override returns (uint256 total) {
        return _nextAgentId;
    }

    /// @notice Verifies that `agentId` exists and `msg.sender` is its owner or approved operator.
    /// @param agentId Target agent token ID.
    function _requireAuthorized(uint256 agentId) internal view {
        address owner = _ownerOf(agentId);
        if (owner == address(0)) {
            revert AgentNotFound(agentId);
        }
        if (!_isAuthorized(owner, msg.sender, agentId)) {
            revert UnauthorizedAgentOperator(msg.sender, agentId);
        }
    }

    /// @notice Adds an arbiter agent ID to `_activeArbiters` in O(1) if not already present.
    /// @param agentId Arbiter token ID to add.
    function _addActiveArbiter(uint256 agentId) internal {
        if (_activeArbiterIndex[agentId] != 0) {
            return;
        }
        _activeArbiters.push(agentId);
        _activeArbiterIndex[agentId] = _activeArbiters.length;
    }

    /// @notice Removes an arbiter agent ID from `_activeArbiters` in O(1) via swap-and-pop.
    /// @param agentId Arbiter token ID to remove.
    function _removeActiveArbiter(uint256 agentId) internal {
        uint256 indexPlusOne = _activeArbiterIndex[agentId];
        if (indexPlusOne == 0) {
            return;
        }

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activeArbiters.length - 1;

        if (index != lastIndex) {
            uint256 lastAgentId = _activeArbiters[lastIndex];
            _activeArbiters[index] = lastAgentId;
            _activeArbiterIndex[lastAgentId] = indexPlusOne;
        }

        _activeArbiters.pop();
        delete _activeArbiterIndex[agentId];
    }
}
