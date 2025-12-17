// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract DeployPredictionMarket is Script {
    function run() external returns (PredictionMarket) {
        // Get protocol treasury address from environment variable
        address protocolTreasury = vm.envAddress("PROTOCOL_TREASURY");
        
        vm.startBroadcast();
        
        PredictionMarket market = new PredictionMarket(protocolTreasury);
        
        console.log("PredictionMarket deployed at:", address(market));
        console.log("Protocol Treasury:", protocolTreasury);
        console.log("Owner:", market.owner());
        
        vm.stopBroadcast();
        
        return market;
    }
}
