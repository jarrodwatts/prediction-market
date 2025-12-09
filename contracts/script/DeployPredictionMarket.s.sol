// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket, IWETH} from "../src/PredictionMarket.sol";

contract DeployPredictionMarket is Script {
    function run() external returns (PredictionMarket) {
        // Get WETH address from environment variable
        address weth = vm.envAddress("WETH_ADDRESS");
        
        vm.startBroadcast();
        
        PredictionMarket market = new PredictionMarket(IWETH(weth));
        
        console.log("PredictionMarket deployed at:", address(market));
        console.log("WETH address:", weth);
        console.log("Owner:", market.owner());
        
        vm.stopBroadcast();
        
        return market;
    }
}

