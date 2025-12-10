// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployMockUSDC is Script {
    function run() external returns (MockUSDC) {
        vm.startBroadcast();
        
        MockUSDC usdc = new MockUSDC();
        
        console.log("MockUSDC deployed at:", address(usdc));
        console.log("Deployer balance:", usdc.balanceOf(msg.sender));
        
        vm.stopBroadcast();
        
        return usdc;
    }
}

