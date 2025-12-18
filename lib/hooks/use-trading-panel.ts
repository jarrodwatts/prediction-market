'use client'

/**
 * useTradingPanel - Shared trading logic for overlay and market pages
 *
 * Consolidates contract reads, price calculations, and payout estimates
 * to ensure consistent behavior across all trading interfaces.
 */

import { useMemo } from 'react'
import { useReadContract, useAccount } from 'wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { calcBuyAmount, getPrice } from '@/lib/market-math'
import { useMarketEvents } from '@/lib/hooks/use-market-events'
import { useUsdcBalance } from '@/lib/hooks/use-usdc-balance'
import { parseUSDC } from '@/lib/tokens'

interface UseTradingPanelOptions {
  /** Market ID (bigint) */
  marketId: bigint | undefined
  /** Number of outcomes in the market */
  outcomeCount: number
  /** Total fee in basis points (protocol + creator) */
  totalFeeBps: bigint
  /** Currently selected outcome index */
  selectedOutcome: number | null
  /** Amount to bet (as string, e.g., "10.00") */
  amount: string
  /** Channel ID for query invalidation (optional, for overlay) */
  channelId?: string
  /** Enable/disable real-time event watching */
  enableEvents?: boolean
}

interface UseTradingPanelReturn {
  // Contract data
  pools: readonly bigint[] | undefined
  userShares: readonly bigint[] | undefined
  refetchPools: () => void

  // USDC balance/allowance
  usdcBalance: bigint | undefined
  usdcAllowance: bigint | undefined
  balanceFormatted: number

  // Calculated values
  outcomePrices: number[]
  estimatedPayout: bigint
  needsApproval: boolean

  // Derived user position info
  hasAnyPosition: boolean
  positionsByOutcome: Array<{ idx: number; shares: bigint }>

  // Loading states
  isLoadingPools: boolean
}

export function useTradingPanel({
  marketId,
  outcomeCount,
  totalFeeBps,
  selectedOutcome,
  amount,
  channelId,
  enableEvents = true,
}: UseTradingPanelOptions): UseTradingPanelReturn {
  const { address, isConnected } = useAccount()

  // USDC balance and allowance
  const { balance: usdcBalance, allowance: usdcAllowance, balanceFormatted } = useUsdcBalance()

  // Get market pools
  // Using staleTime to reduce unnecessary refetches and keep data stable during background updates
  const { data: pools, isLoading: isLoadingPools, refetch: refetchPools } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketPools',
    args: marketId ? [marketId] : undefined,
    query: {
      enabled: !!marketId,
      refetchInterval: 5_000,
      staleTime: 3_000, // Consider data fresh for 3 seconds
    },
  })

  // Get user's shares
  const { data: userShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserShares',
    args: marketId && address ? [marketId, address] : undefined,
    query: {
      enabled: !!marketId && isConnected && !!address,
      refetchInterval: 5_000,
      staleTime: 3_000, // Consider data fresh for 3 seconds
    },
  })

  // Real-time updates when bets are placed
  useMarketEvents({
    marketId,
    channelId,
    onBetPlaced: () => {
      refetchPools()
    },
    enabled: enableEvents && !!marketId,
  })

  // Calculate outcome prices from pools
  const outcomePrices = useMemo(() => {
    if (!pools?.length) {
      return Array(outcomeCount).fill(1 / outcomeCount)
    }
    return Array.from({ length: outcomeCount }).map((_, i) =>
      getPrice(i, [...pools])
    )
  }, [pools, outcomeCount])

  // Parse amount to number for validation
  const amountValue = useMemo(() => {
    const parsed = parseFloat(amount)
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed
  }, [amount])

  // Calculate estimated payout (shares you'd receive)
  // Uses 6 decimal USDC - do NOT scale to 18 decimals
  const estimatedPayout = useMemo(() => {
    if (!amountValue || selectedOutcome === null || !pools?.length) return 0n
    try {
      const amountBigInt = parseUSDC(amountValue.toString())
      return calcBuyAmount(amountBigInt, selectedOutcome, [...pools], totalFeeBps)
    } catch {
      return 0n
    }
  }, [amountValue, selectedOutcome, pools, totalFeeBps])

  // Check if approval is needed
  const needsApproval = useMemo(() => {
    if (!amountValue) return false
    if (usdcAllowance === undefined) return true
    try {
      return usdcAllowance < parseUSDC(amountValue.toString())
    } catch {
      return true
    }
  }, [amountValue, usdcAllowance])

  // User position helpers
  const userSharesArray = (userShares ?? []) as readonly bigint[]
  const hasAnyPosition = userSharesArray.some((s) => s > 0n)
  const positionsByOutcome = userSharesArray
    .map((shares, idx) => ({ shares, idx }))
    .filter(({ shares }) => shares > 0n)

  return {
    // Contract data
    pools,
    userShares,
    refetchPools,

    // USDC balance/allowance
    usdcBalance,
    usdcAllowance,
    balanceFormatted,

    // Calculated values
    outcomePrices,
    estimatedPayout,
    needsApproval,

    // User position info
    hasAnyPosition,
    positionsByOutcome,

    // Loading states
    isLoadingPools,
  }
}

