/**
 * useMarketEvents - Real-time contract event subscriptions via WebSocket
 * 
 * Uses wagmi's useWatchContractEvent for instant event notifications
 * instead of polling. Falls back gracefully if WebSocket unavailable.
 */

import { useCallback } from 'react'
import { useWatchContractEvent } from 'wagmi'
import { useQueryClient as useTanstackQueryClient } from '@tanstack/react-query'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'

interface UseMarketEventsOptions {
  /** Market ID to watch (optional - watches all if not provided) */
  marketId?: bigint
  /** Channel ID for cache invalidation */
  channelId?: string
  /** Called when a bet is placed */
  onBetPlaced?: (args: {
    marketId: bigint
    user: `0x${string}`
    outcome: bigint
    amount: bigint
    sharesMinted: bigint
  }) => void
  /** Called when market is resolved */
  onMarketResolved?: (args: {
    marketId: bigint
    winningOutcome: bigint
    resolver: `0x${string}`
  }) => void
  /** Called when market is voided */
  onMarketVoided?: (args: {
    marketId: bigint
    reason: string
  }) => void
  /** Called when market is locked */
  onMarketLocked?: (args: {
    marketId: bigint
  }) => void
  /** Enable/disable watching */
  enabled?: boolean
}

/**
 * Watch prediction market contract events in real-time
 * 
 * Uses WebSocket transport for instant notifications (no polling delay)
 */
export function useMarketEvents({
  marketId,
  channelId,
  onBetPlaced,
  onMarketResolved,
  onMarketVoided,
  onMarketLocked,
  enabled = true,
}: UseMarketEventsOptions = {}) {
  const queryClient = useTanstackQueryClient()

  // Invalidate relevant queries on any market event
  const invalidateMarketQueries = useCallback(() => {
    if (channelId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.markets.active(channelId) })
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.all })
  }, [queryClient, channelId])

  // Watch BetPlaced events
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: 'BetPlaced',
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint
          user?: `0x${string}`
          outcome?: bigint
          amount?: bigint
          sharesMinted?: bigint
        }
        
        // Filter by marketId if specified
        if (marketId !== undefined && args.marketId !== marketId) continue
        
        logger.debug('BetPlaced event', { marketId: args.marketId?.toString(), user: args.user })
        
        if (args.marketId !== undefined && args.user && args.outcome !== undefined && args.amount !== undefined && args.sharesMinted !== undefined) {
          onBetPlaced?.({
            marketId: args.marketId,
            user: args.user,
            outcome: args.outcome,
            amount: args.amount,
            sharesMinted: args.sharesMinted,
          })
        }
        
        invalidateMarketQueries()
      }
    },
    enabled,
  })

  // Watch MarketResolved events  
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: 'MarketResolved',
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint
          winningOutcome?: bigint
          resolver?: `0x${string}`
        }
        
        if (marketId !== undefined && args.marketId !== marketId) continue
        
        logger.debug('MarketResolved event', { marketId: args.marketId?.toString() })
        
        if (args.marketId !== undefined && args.winningOutcome !== undefined && args.resolver) {
          onMarketResolved?.({
            marketId: args.marketId,
            winningOutcome: args.winningOutcome,
            resolver: args.resolver,
          })
        }
        
        invalidateMarketQueries()
      }
    },
    enabled,
  })

  // Watch MarketVoided events
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: 'MarketVoided',
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint
          reason?: string
        }
        
        if (marketId !== undefined && args.marketId !== marketId) continue
        
        logger.debug('MarketVoided event', { marketId: args.marketId?.toString() })
        
        if (args.marketId !== undefined && args.reason !== undefined) {
          onMarketVoided?.({
            marketId: args.marketId,
            reason: args.reason,
          })
        }
        
        invalidateMarketQueries()
      }
    },
    enabled,
  })

  // Watch MarketLocked events
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: 'MarketLocked',
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint
        }
        
        if (marketId !== undefined && args.marketId !== marketId) continue
        
        logger.debug('MarketLocked event', { marketId: args.marketId?.toString() })
        
        if (args.marketId !== undefined) {
          onMarketLocked?.({
            marketId: args.marketId,
          })
        }
        
        invalidateMarketQueries()
      }
    },
    enabled,
  })
}

/**
 * Watch for a specific user's bet confirmations
 * 
 * Useful for showing instant "Bet confirmed!" feedback in the overlay
 */
export function useWatchUserBets({
  userAddress,
  marketId,
  onBetConfirmed,
  enabled = true,
}: {
  userAddress?: `0x${string}`
  marketId?: bigint
  onBetConfirmed?: (sharesMinted: bigint, outcome: bigint) => void
  enabled?: boolean
}) {
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: 'BetPlaced',
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint
          user?: `0x${string}`
          outcome?: bigint
          sharesMinted?: bigint
        }
        
        // Only trigger for this user's bets
        if (userAddress && args.user?.toLowerCase() !== userAddress.toLowerCase()) continue
        if (marketId !== undefined && args.marketId !== marketId) continue
        
        if (args.sharesMinted !== undefined && args.outcome !== undefined) {
          onBetConfirmed?.(args.sharesMinted, args.outcome)
        }
      }
    },
    enabled: enabled && !!userAddress,
  })
}

