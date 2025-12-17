/**
 * Market Service
 *
 * Backend service for creating and managing prediction markets.
 */

import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { activeChain } from './wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from './contract'
import { logger } from './logger'
import { BLOCKCHAIN } from './config'
import { TransactionRevertedError } from './errors/backend'
import { circuitBreakers } from './circuit-breaker'

// USDC address (from config)
const USDC_ADDRESS = BLOCKCHAIN.USDC_ADDRESS

/**
 * Get the backend wallet client for market operations
 *
 * Configured for Abstract (zkSync L2) with 200ms block times:
 * - Fast timeouts (30s sufficient for ~150 blocks)
 * - Retry logic for transient RPC failures
 */
function getBackendWallet() {
  const privateKey = BLOCKCHAIN.BACKEND_WALLET_PRIVATE_KEY
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  // Configure transport with timeouts and retries optimized for Abstract L2
  const transportConfig = http(activeChain.rpcUrls.default.http[0], {
    timeout: BLOCKCHAIN.RPC.TIMEOUT_MS,
    retryCount: BLOCKCHAIN.RPC.RETRY_COUNT,
    retryDelay: BLOCKCHAIN.RPC.RETRY_DELAY_MS,
  })

  const walletClient = createWalletClient({
    account,
    chain: activeChain as typeof activeChain,
    transport: transportConfig,
  })

  const publicClient = createPublicClient({
    chain: activeChain as typeof activeChain,
    transport: transportConfig,
  })

  return { walletClient, publicClient, account }
}

/** Default fee structure (in basis points) */
const DEFAULT_FEES = {
  /** Protocol fee: 1.5% */
  protocolFeeBps: 150,
  /** Creator/streamer fee: 1.5% */
  creatorFeeBps: 150,
}

/**
 * Create a new prediction market
 */
export async function createMarket(params: {
  question: string
  outcomeCount: number
  closesAt: number // Unix timestamp in seconds
  creatorAddress: string // Streamer's wallet for fee collection
  image?: string // Optional image URL (e.g., Twitch profile picture)
  protocolFeeBps?: number // Override default protocol fee
  creatorFeeBps?: number // Override default creator fee
}): Promise<{ marketId: bigint; txHash: string }> {
  return circuitBreakers.rpc.execute(async () => {
    const { walletClient, publicClient } = getBackendWallet()

    const marketParams = {
      question: params.question,
      image: params.image || '',
      outcomeCount: BigInt(params.outcomeCount),
      closesAt: BigInt(params.closesAt),
      token: USDC_ADDRESS,
      protocolFeeBps: params.protocolFeeBps ?? DEFAULT_FEES.protocolFeeBps,
      creatorFeeBps: params.creatorFeeBps ?? DEFAULT_FEES.creatorFeeBps,
      creator: params.creatorAddress as `0x${string}`,
    }

    logger.info('Creating market', {
      question: params.question,
      outcomeCount: params.outcomeCount,
      closesAt: new Date(params.closesAt * 1000).toISOString(),
      creator: params.creatorAddress,
    })

    const startTime = Date.now()
    const txHash = await walletClient.writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'createMarket',
      args: [marketParams],
    })

    logger.transaction.submitted(txHash, 'createMarket')

    // Wait for transaction with timeout
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: BLOCKCHAIN.TX.WAIT_TIMEOUT_MS,
      confirmations: BLOCKCHAIN.RPC.CONFIRMATIONS,
    })

    if (receipt.status === 'reverted') {
      logger.transaction.reverted(txHash, 'createMarket')
      throw new TransactionRevertedError(txHash, 'createMarket')
    }

    const txDuration = Date.now() - startTime
    logger.transaction.confirmed(txHash, receipt.blockNumber, txDuration)

    // Read the market count to get the latest market ID
    // The contract increments marketCount after creation, so current count = latest market ID + 1
    const marketCount = await publicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'marketCount',
    })

    const marketId = marketCount - 1n

    logger.info('Market created', {
      marketId: marketId.toString(),
      txHash,
      duration: `${txDuration}ms`,
    })

    return { marketId, txHash }
  })
}

/**
 * Resolve a market with the winning outcome
 *
 * Can only be called by owner or market creator.
 */
export async function resolveMarket(
  marketId: bigint,
  winningOutcome: number
): Promise<string> {
  return circuitBreakers.rpc.execute(async () => {
    const { walletClient, publicClient } = getBackendWallet()

    // Check market state first
    const marketData = await publicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarketData',
      args: [marketId],
    })

    const state = marketData[0] // MarketState: 0=Open, 1=Locked, 2=Resolved, 3=Voided

    if (state === 2) {
      logger.info('Market already resolved, skipping', {
        marketId: marketId.toString(),
      })
      return ''
    }

    if (state === 3) {
      logger.info('Market already voided, skipping', {
        marketId: marketId.toString(),
      })
      return ''
    }

    logger.market.resolving(marketId, winningOutcome)

    const txHash = await walletClient.writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'resolve',
      args: [marketId, BigInt(winningOutcome)],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    if (receipt.status === 'reverted') {
      logger.transaction.reverted(txHash, 'resolve')
      throw new TransactionRevertedError(txHash, 'resolve')
    }

    logger.market.resolved(marketId, winningOutcome, txHash)
    return txHash
  })
}

/**
 * Lock a market (stop betting before resolution)
 *
 * Called when Twitch prediction is locked.
 * Can only be called by owner or market creator.
 */
export async function lockMarket(marketId: bigint): Promise<string> {
  return circuitBreakers.rpc.execute(async () => {
    const { walletClient, publicClient } = getBackendWallet()

    // Check market state first
    const marketData = await publicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarketData',
      args: [marketId],
    })

    const state = marketData[0] // MarketState: 0=Open, 1=Locked, 2=Resolved, 3=Voided

    if (state !== 0) {
      logger.info('Market not open, skipping lock', {
        marketId: marketId.toString(),
        state: state.toString(),
      })
      return ''
    }

    logger.market.locking(marketId)

    const txHash = await walletClient.writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'lockMarket',
      args: [marketId],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    if (receipt.status === 'reverted') {
      logger.transaction.reverted(txHash, 'lockMarket')
      throw new TransactionRevertedError(txHash, 'lockMarket')
    }

    logger.market.locked(marketId, txHash)
    return txHash
  })
}

/**
 * Void a market (cancel and enable refunds)
 *
 * Called when Twitch prediction is cancelled.
 * All bettors can claim full refunds of their bets.
 */
export async function voidMarket(marketId: bigint): Promise<string> {
  return circuitBreakers.rpc.execute(async () => {
    const { walletClient, publicClient } = getBackendWallet()

    // Check market state first
    const marketData = await publicClient.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'getMarketData',
      args: [marketId],
    })

    const state = marketData[0] // MarketState: 0=Open, 1=Locked, 2=Resolved, 3=Voided

    if (state === 2) {
      logger.info('Market already resolved, skipping void', {
        marketId: marketId.toString(),
      })
      return ''
    }

    if (state === 3) {
      logger.info('Market already voided, skipping', {
        marketId: marketId.toString(),
      })
      return ''
    }

    logger.market.voiding(marketId)

    const txHash = await walletClient.writeContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: 'voidMarket',
      args: [marketId],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

    if (receipt.status === 'reverted') {
      logger.transaction.reverted(txHash, 'voidMarket')
      throw new TransactionRevertedError(txHash, 'voidMarket')
    }

    logger.market.voided(marketId, txHash)
    return txHash
  })
}

/**
 * Get market data from the contract
 */
export async function getMarketData(marketId: bigint) {
  const { publicClient } = getBackendWallet()

  const data = await publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketData',
    args: [marketId],
  })

  return {
    state: data[0],
    closesAt: data[1],
    totalPot: data[2],
    outcomeCount: data[3],
    resolvedOutcome: data[4],
    creator: data[5],
    protocolFeeBps: data[6],
    creatorFeeBps: data[7],
  }
}

/**
 * Get market pools (amount bet on each outcome)
 */
export async function getMarketPools(marketId: bigint): Promise<readonly bigint[]> {
  const { publicClient } = getBackendWallet()

  return publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketPools',
    args: [marketId],
  })
}

/**
 * Get indicative prices (probabilities) for a market
 */
export async function getIndicativePrices(marketId: bigint): Promise<readonly bigint[]> {
  const { publicClient } = getBackendWallet()

  return publicClient.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getIndicativePrices',
    args: [marketId],
  })
}

