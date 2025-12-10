// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @dev Simple mock USDC for testing purposes
 */
contract MockUSDC is ERC20 {
    uint8 private _decimals = 6; // USDC has 6 decimals

    constructor() ERC20("Mock USDC", "USDC") {
        // Mint 1 million USDC to deployer for testing
        _mint(msg.sender, 1_000_000 * 10**_decimals);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @dev Anyone can mint for testing purposes
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @dev Convenience function to mint 1000 USDC
     */
    function faucet() external {
        _mint(msg.sender, 1000 * 10**_decimals);
    }
}

