'use client'

/**
 * Twitch Video Overlay - Betting UI
 *
 * Overlay panel for placing bets on prediction markets using USDC.
 * Uses the shared TradePanel component for consistent behavior with the main app.
 */

import { Suspense, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { getOutcomeColor } from '@/lib/outcome-colors'
import { queryKeys } from '@/lib/query-keys'
import { USDC } from '@/lib/tokens'
import { INTERVALS } from '@/lib/constants'
import { MarketState, type MarketApiResponse, type MarketData } from '@/lib/types'
import { TradePanel } from '@/components/market/trade-panel'
import { Loader2 } from 'lucide-react'

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card p-4">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

// API Base URL for fetching market data
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return ''
  }
  return process.env.NEXT_PUBLIC_APP_URL || ''
}

// Mock market data for local testing (use ?mock=true)
function getMockMarket(): MarketApiResponse {
  return {
    id: '1',
    twitchPredictionId: 'mock-123',
    question: 'Will I beat this boss on the first try?',
    outcomes: ['Yes', 'No'],
    prices: [0.65, 0.35],
    pools: ['650000000', '350000000'],
    state: 'open',
    closesAt: Math.floor(Date.now() / 1_000) + 300,
    totalPot: '1000000000',
    protocolFeeBps: 100,
    creatorFeeBps: 100,
  }
}

/**
 * Convert API response to MarketData format expected by TradePanel
 */
function apiResponseToMarketData(api: MarketApiResponse): MarketData | null {
  // Can't convert if no ID (still pending creation)
  if (!api.id) return null

  const stateMap: Record<string, number> = {
    pending: MarketState.OPEN,
    open: MarketState.OPEN,
    locked: MarketState.LOCKED,
    resolved: MarketState.RESOLVED,
    voided: MarketState.VOIDED,
  }

  return {
    id: BigInt(api.id),
    question: api.question,
    image: '',
    token: USDC.address,
    state: (stateMap[api.state] ?? MarketState.OPEN) as 0 | 1 | 2 | 3,
    closesAt: BigInt(api.closesAt),
    totalPot: BigInt(api.totalPot),
    pools: api.pools.map(p => BigInt(p)),
    outcomeCount: api.outcomes.length,
    outcomes: api.outcomes,
    resolvedOutcome: BigInt(api.resolvedOutcome ?? 0),
    creator: '0x0000000000000000000000000000000000000000',
    protocolFeeBps: api.protocolFeeBps,
    creatorFeeBps: api.creatorFeeBps,
    createdAt: 0n,
    prices: api.prices,
  }
}

// Main page component with Suspense wrapper
export default function OverlayPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OverlayContent />
    </Suspense>
  )
}

function OverlayContent() {
  const searchParams = useSearchParams()
  const isMockMode = searchParams.get('mock') === 'true'
  const testChannelId = searchParams.get('channelId')
  const isTestMode = !!testChannelId

  const [selectedOutcome, setSelectedOutcome] = useState<number>(0)

  // Twitch extension context
  const { isReady, channelId, token } = useTwitchExtension()
  const effectiveIsReady = isMockMode || isTestMode || isReady
  const effectiveChannelId = isMockMode ? 'mock-channel' : (testChannelId || channelId)

  const queryClient = useQueryClient()

  // Fetch active market using useQuery
  // Using fetchStatus to distinguish between initial load vs background refetch
  const { data: market, status, fetchStatus } = useQuery({
    queryKey: queryKeys.markets.active(effectiveChannelId || ''),
    queryFn: async () => {
      if (isMockMode) return getMockMarket()
      if (!effectiveChannelId) return null

      const res = await fetch(`${getApiBaseUrl()}/api/markets/active?channelId=${effectiveChannelId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to fetch market')

      return res.json() as Promise<MarketApiResponse>
    },
    enabled: effectiveIsReady && !!effectiveChannelId,
    refetchInterval: INTERVALS.BALANCE_REFRESH,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  })

  // Only show loading on true initial load (no cached data and actively fetching)
  // This is more robust than tracking state which can reset on remount
  const isInitialLoading = status === 'pending' && fetchStatus === 'fetching' && !isMockMode

  // Convert API response to MarketData for TradePanel
  const marketData = useMemo(() => {
    if (!market) return null
    return apiResponseToMarketData(market)
  }, [market])

  // Clear prediction mapping after claim (Twitch-specific)
  const handleClearPrediction = useCallback(() => {
    if (effectiveChannelId) {
      fetch(`${getApiBaseUrl()}/api/admin/clear-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: effectiveChannelId }),
      }).catch(console.error)
    }
  }, [effectiveChannelId])

  // Callback for successful bets - invalidate queries to refresh data
  const handleBetSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.active(effectiveChannelId || '') })
  }, [queryClient, effectiveChannelId])

  // Check if market is in pending state (no ID yet)
  const isMarketPending = market?.state === 'pending' || (market && !market.id)

  // Loading state - ONLY show spinner on true initial load (no cached data)
  // Using TanStack Query's status/fetchStatus is more reliable than local state
  if (isInitialLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // No market state
  if (!market) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          No active prediction
        </div>
      </div>
    )
  }

  // Market pending state - keep this separate since we don't have a valid market ID
  if (isMarketPending) {
    return (
      <div className="h-full w-full overflow-auto bg-card">
        <div className="min-h-full">
          <div className="border-b border-border/40 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating market...
            </div>
            <h2 className="mt-2 font-semibold text-foreground">{market.question}</h2>
          </div>
          <div className="p-4 space-y-3">
            {market.outcomes.map((outcome, idx) => {
              const baseColor = getOutcomeColor(outcome, idx)
              return (
                <div
                  key={idx}
                  className="relative flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3 opacity-60"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: baseColor }} />
                    <span className="font-medium">{outcome}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">50.0%</span>
                </div>
              )
            })}
            <p className="text-center text-xs text-muted-foreground">Betting opens shortly</p>
          </div>
        </div>
      </div>
    )
  }

  // If we couldn't convert to MarketData (shouldn't happen after pending check)
  if (!marketData) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          Market loading...
        </div>
      </div>
    )
  }

  // All other states (open, closed, resolved, voided) - use TradePanel
  return (
    <div className="h-full w-full overflow-auto bg-card">
      <TradePanel
        market={marketData}
        selectedOutcome={selectedOutcome}
        onOutcomeChange={setSelectedOutcome}
        embedded={true}
        variant="compact"
        quickAmountMode="fixed"
        showCountdown={true}
        closesAt={market.closesAt}
        sortOutcomes={false}
        onBetSuccess={handleBetSuccess}
        onClaimSuccess={handleClearPrediction}
        isPending={market?.state === 'pending'}
      />
    </div>
  )
}
