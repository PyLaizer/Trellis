// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockTUSD8
/// @notice Mock stablecoin replicating QDay Aevum's 6-decimal `tUSD8` for local testing.
/// @dev Exposes an unrestricted `mint` helper intended strictly for local development and tests.
contract MockTUSD8 is ERC20 {
    /// @notice Initializes the mock token with name `"Test USD8"` and symbol `"tUSD8"`.
    constructor() ERC20("Test USD8", "tUSD8") {}

    /// @notice Returns the number of decimals used for display (6, matching QDay Aevum `tUSD8`).
    /// @return Token decimal precision.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mints `amount` tokens to `to` for local testing convenience.
    /// @param to Recipient address.
    /// @param amount Quantity of tokens in base units (6 decimals).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
