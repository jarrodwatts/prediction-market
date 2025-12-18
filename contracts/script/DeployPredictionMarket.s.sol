// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployPredictionMarket is Script {
    function run() external returns (PredictionMarket, MockUSDC) {
        // Get protocol treasury address from environment variable
        address protocolTreasury = vm.envAddress("PROTOCOL_TREASURY");
        
        // Check if we should deploy MockUSDC (for testnet)
        bool deployMockUSDC = vm.envOr("DEPLOY_MOCK_USDC", false);
        
        vm.startBroadcast();
        
        // Deploy PredictionMarket
        PredictionMarket market = new PredictionMarket(protocolTreasury);
        console.log("PredictionMarket deployed at:", address(market));
        console.log("Protocol Treasury:", protocolTreasury);
        console.log("Owner:", market.owner());
        
        MockUSDC usdc;
        
        if (deployMockUSDC) {
            // Deploy MockUSDC for testnet
            usdc = new MockUSDC();
            console.log("MockUSDC deployed at:", address(usdc));
            
            // Whitelist MockUSDC in the PredictionMarket
            market.setTokenAllowed(address(usdc), true);
            console.log("MockUSDC whitelisted in PredictionMarket");
            
            // Mint 100k USDC to test wallet
            address testWallet = 0xA57AF021C321F38D1e464e44AE9c7e45488aAbf3;
            usdc.mint(testWallet, 100_000 * 10**6);
            console.log("Minted 100,000 USDC to:", testWallet);
        }
        
        vm.stopBroadcast();
        
        return (market, usdc);
    }
}
