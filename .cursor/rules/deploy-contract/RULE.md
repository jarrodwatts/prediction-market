---
description: "Deploy PredictionMarket contract to Abstract and update frontend"
globs: 
  - "contracts/**"
  - "lib/contract.ts"
  - "lib/abi.ts"
alwaysApply: false
---

# Deploy & Update PredictionMarket Contract

## Prerequisites

- Foundry keystore: `myKeystore` (verify with `cast wallet list`)
- Etherscan API key: `MYUUIZ683YVHFH4P7UY6IV76QGI5K5P2AC`

## Network Config

| Network | Chain ID | RPC | WETH |
|---------|----------|-----|------|
| Testnet | 11124 | https://api.testnet.abs.xyz | 0x9EDCde0257F2386Ce177C3a7FCdd97787F0D841d |
| Mainnet | 2741 | https://api.mainnet.abs.xyz | 0x3439153EB7AF838Ad19d56E1571FBD09333C2809 |

---

## Step 1: Build

```bash
cd /home/jarrod/prediction-market/contracts && forge build --force
```

## Step 2: Deploy

**Testnet:**
```bash
cd /home/jarrod/prediction-market/contracts && \
WETH_ADDRESS=0x9EDCde0257F2386Ce177C3a7FCdd97787F0D841d forge script script/DeployPredictionMarket.s.sol \
  --rpc-url https://api.testnet.abs.xyz \
  --account myKeystore \
  --broadcast \
  --verify \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=11124" \
  --etherscan-api-key MYUUIZ683YVHFH4P7UY6IV76QGI5K5P2AC
```

**Mainnet:**
```bash
cd /home/jarrod/prediction-market/contracts && \
WETH_ADDRESS=0x3439153EB7AF838Ad19d56E1571FBD09333C2809 forge script script/DeployPredictionMarket.s.sol \
  --rpc-url https://api.mainnet.abs.xyz \
  --account myKeystore \
  --broadcast \
  --verify \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=2741" \
  --etherscan-api-key MYUUIZ683YVHFH4P7UY6IV76QGI5K5P2AC
```

> Note: User must run in terminal — keystore requires password input.

## Step 3: Update Frontend

After deployment succeeds, update the app:

### 3a. Update contract address in `lib/contract.ts`:
```typescript
export const PREDICTION_MARKET_ADDRESS = "<NEW_ADDRESS>";
```

### 3b. Extract fresh ABI:
```bash
cd /home/jarrod/prediction-market && node scripts/extract-abi.js
```

---

## Manual Verification (if needed)

```bash
forge verify-contract <ADDRESS> src/PredictionMarket.sol:PredictionMarket \
  --verifier-url "https://api.etherscan.io/v2/api?chainid=<CHAIN_ID>" \
  --etherscan-api-key MYUUIZ683YVHFH4P7UY6IV76QGI5K5P2AC \
  --constructor-args <CONSTRUCTOR_ARGS_HEX>
```

## Current Deployments

| Network | Address | Explorer |
|---------|---------|----------|
| Testnet | 0xcCfD5223e14D0A24aF2A80A6931c228F0a4137E0 | [abscan](https://sepolia.abscan.org/address/0xcCfD5223e14D0A24aF2A80A6931c228F0a4137E0) |
| Mainnet | TBD | TBD |
