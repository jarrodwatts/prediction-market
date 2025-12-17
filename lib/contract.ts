import { PREDICTION_MARKET_ABI, MarketState } from "./abi";

// TODO: Update this address after deploying the contract
// Deploy with: cd contracts && forge script script/DeployPredictionMarket.s.sol --broadcast --rpc-url <RPC_URL> --private-key <PRIVATE_KEY> --zksync
// Set env: PROTOCOL_TREASURY=<your_treasury_address>
export const PREDICTION_MARKET_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export { PREDICTION_MARKET_ABI, MarketState };
