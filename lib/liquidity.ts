import { createWalletClient, createPublicClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { abstractTestnet } from './wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from './contract'

// ERC20 ABI for USDC approval
const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// USDC address on Abstract Testnet
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` || '0x0000000000000000000000000000000000000000'

// Default liquidity amount (10 USDC with 6 decimals for testing)
const DEFAULT_LIQUIDITY = parseUnits('10', 6)

/**
 * Get the backend wallet client for seeding liquidity
 */
function getBackendWallet() {
  const privateKey = process.env.LIQUIDITY_WALLET_PRIVATE_KEY
  if (!privateKey) {
    throw new Error('LIQUIDITY_WALLET_PRIVATE_KEY not configured')
  }
  
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  
  const walletClient = createWalletClient({
    account,
    chain: abstractTestnet,
    transport: http(),
  })
  
  const publicClient = createPublicClient({
    chain: abstractTestnet,
    transport: http(),
  })
  
  return { walletClient, publicClient, account }
}

/**
 * Create a new prediction market with liquidity
 */
export async function createMarketWithLiquidity(params: {
  question: string
  outcomes: number
  closesAt: number // Unix timestamp in seconds
  distributorAddress: string // Streamer's wallet for fee collection
  treasuryAddress: string // Protocol treasury
  image?: string // Optional image URL (e.g., Twitch profile picture)
}): Promise<{ marketId: bigint; txHash: string }> {
  const { walletClient, publicClient, account } = getBackendWallet()
  
  // Check USDC balance
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
  
  if (balance < DEFAULT_LIQUIDITY) {
    throw new Error(`Insufficient USDC balance. Have ${balance}, need ${DEFAULT_LIQUIDITY}`)
  }
  
  // Check allowance
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, PREDICTION_MARKET_ADDRESS],
  })
  
  // Approve if needed
  if (allowance < DEFAULT_LIQUIDITY) {
    const approveTx = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [PREDICTION_MARKET_ADDRESS, DEFAULT_LIQUIDITY * 100n], // Approve extra for future markets
    })
    
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
  }
  
  // Fee structure: 1.5% to protocol treasury, 1.5% to streamer (distributor)
  // Fee values are in basis points where 10^18 = 100%
  const protocolFee = parseUnits('0.015', 18) // 1.5%
  const streamerFee = parseUnits('0.015', 18) // 1.5%
  
  const fees = {
    fee: 0n, // LP fee (we're the LP, don't need this)
    treasuryFee: protocolFee,
    distributorFee: streamerFee,
  }
  
  // Create equal distribution for outcomes (50/50 for 2 outcomes)
  const distribution = Array(params.outcomes).fill(1n)
  
  const marketDescription = {
    value: DEFAULT_LIQUIDITY,
    closesAt: params.closesAt,
    outcomes: BigInt(params.outcomes),
    token: USDC_ADDRESS,
    distribution,
    question: params.question,
    image: params.image || '', // Twitch profile image or empty
    buyFees: fees,
    sellFees: fees,
    treasury: params.treasuryAddress as `0x${string}`,
    distributor: params.distributorAddress as `0x${string}`,
  }
  
  // Create the market
  const txHash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'createMarket',
    args: [marketDescription],
  })
  
  // Wait for transaction and get the market ID from logs
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  
  // Parse MarketCreated event to get marketId
  const marketCreatedLog = receipt.logs.find(log => {
    // MarketCreated event signature
    return log.topics[0] === '0x' // Would need actual topic hash
  })
  
  // For now, read the market index to get the latest market ID
  const marketIndex = await publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'marketIndex',
  })
  
  // The market ID is the previous index (since it increments after creation)
  const marketId = marketIndex - 1n
  
  return { marketId, txHash }
}

/**
 * Resolve a market with the winning outcome
 */
export async function resolveMarket(
  marketId: bigint,
  outcomeId: number
): Promise<string> {
  const { walletClient, publicClient } = getBackendWallet()
  
  // Check market state first
  const marketData = await publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketData',
    args: [marketId],
  })
  
  const state = marketData[0] // MarketState: 0=open, 1=closed, 2=resolved
  const closesAt = marketData[1] // closesAt timestamp
  
  if (state === 2) {
    console.log(`Market ${marketId} is already resolved`)
    return ''
  }
  
  // Note: We removed the early return check for open markets
  // When Twitch locks a prediction early, we use adminPauseMarket which keeps state=0 but sets paused=true
  // The contract's adminResolveMarketOutcome with transitionLast modifier will handle state transitions
  // If market is open but paused, resolution should still work
  console.log(`📝 Calling adminResolveMarketOutcome for market ${marketId} with outcome ${outcomeId}`)
  
  const txHash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'adminResolveMarketOutcome',
    args: [marketId, BigInt(outcomeId)],
  })
  
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  
  return txHash
}

/**
 * Lock a market early (stop trading before closesAt time)
 * Called when Twitch prediction is locked
 */
export async function lockMarket(marketId: bigint): Promise<string> {
  const { walletClient, publicClient } = getBackendWallet()
  
  // Check market state first
  const marketData = await publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketData',
    args: [marketId],
  })
  
  const state = marketData[0] // MarketState: 0=open, 1=closed, 2=resolved
  
  if (state !== 0) {
    console.log(`Market ${marketId} is not open (state: ${state}), skipping lock`)
    return ''
  }
  
  console.log(`🔒 Pausing market ${marketId} using adminPauseMarket`)
  
  // Use adminPauseMarket to immediately stop all trading
  // This is called by the owner (our liquidity wallet) and takes effect instantly
  const txHash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'adminPauseMarket',
    args: [marketId],
  })
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  
  if (receipt.status === 'reverted') {
    throw new Error(`Transaction reverted: ${txHash}`)
  }
  
  return txHash
}

/**
 * Void a market (resolve with invalid outcome to refund all)
 */
export async function voidMarket(marketId: bigint): Promise<string> {
  const { walletClient, publicClient } = getBackendWallet()
  
  // Check market state first
  const marketData = await publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketData',
    args: [marketId],
  })
  
  const state = marketData[0] // MarketState: 0=open, 1=closed, 2=resolved
  const closesAt = marketData[1] // closesAt timestamp
  
  if (state === 2) {
    console.log(`Market ${marketId} is already resolved, skipping void`)
    return ''
  }
  
  // Check if market SHOULD be closed (time has passed) even if state hasn't transitioned yet
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (state === 0 && now < closesAt) {
    console.log(`⚠️ Market ${marketId} is still open (closes at ${new Date(Number(closesAt) * 1000).toISOString()})`)
    console.log(`   Current time: ${new Date(Number(now) * 1000).toISOString()}`)
    console.log(`   The market will need to be voided manually after it closes`)
    return ''
  }
  
  // Either market is closed OR time has passed (contract will auto-transition)
  // Resolve with an outcomeId that doesn't exist to void the market
  // The contract uses MAX_UINT_256 for voided markets
  console.log(`📝 Voiding market ${marketId}`)
  const voidOutcomeId = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
  
  const txHash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'adminResolveMarketOutcome',
    args: [marketId, voidOutcomeId],
  })
  
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  
  return txHash
}

/**
 * Get the backend wallet's USDC balance
 */
export async function getLiquidityBalance(): Promise<bigint> {
  const { publicClient, account } = getBackendWallet()
  
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })
}

