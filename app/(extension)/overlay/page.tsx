'use client'

/**
 * Twitch Video Overlay - Betting UI
 * 
 * Overlay panel for placing bets on prediction markets using USDC.
 * Uses shared hooks for trading logic to stay consistent with the main market page.
 */

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useAccount } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { getOutcomeColor, getOutcomeClasses } from '@/lib/outcome-colors'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { USDC } from '@/lib/tokens'
import { useCountdown, formatCountdown } from '@/lib/hooks/use-countdown'
import { useTradingPanel } from '@/lib/hooks/use-trading-panel'
import { useMarketAction } from '@/lib/hooks/use-market-actions'
import { useWatchUserBets } from '@/lib/hooks/use-market-events'
import { INTERVALS, TRADING } from '@/lib/constants'
import type { MarketApiResponse } from '@/lib/types'
import { CheckCircle, Clock, DollarSign, Loader2, Lock, Trophy, Wallet } from 'lucide-react'

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

// Quick bet amounts from centralized constants
const BET_AMOUNTS = TRADING.BET_AMOUNTS

export default function OverlayPage() {
  const searchParams = useSearchParams()
  const isMockMode = searchParams.get('mock') === 'true'
  const testChannelId = searchParams.get('channelId')
  const isTestMode = !!testChannelId
  
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [txSuccess, setTxSuccess] = useState(false)
  const [hasClaimed, setHasClaimed] = useState(false)

  // Twitch extension context
  const { isReady, channelId, token } = useTwitchExtension()
  const effectiveIsReady = isMockMode || isTestMode || isReady
  const effectiveChannelId = isMockMode ? 'mock-channel' : (testChannelId || channelId)

  // Wallet connection
  const { login } = useLoginWithAbstract()
  const { isLoading: isWalletLoading } = useAbstractClient()
  const { address, isConnected } = useAccount()
  const queryClient = useQueryClient()

  // Fetch active market using useQuery
  const { data: market, isLoading: isLoadingMarket } = useQuery({
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
  })

  // Fee from API response (in basis points)
  const totalFeeBps = BigInt((market?.protocolFeeBps ?? 0) + (market?.creatorFeeBps ?? 0))

  // Shared trading panel hook - handles contract reads, calculations, and real-time updates
  const {
    pools,
    userShares,
    balanceFormatted,
    outcomePrices,
    estimatedPayout,
    needsApproval,
  } = useTradingPanel({
    marketId: market?.id ? BigInt(market.id) : undefined,
    outcomeCount: market?.outcomes.length ?? 2,
    totalFeeBps,
    selectedOutcome,
    amount,
    channelId: effectiveChannelId || undefined,
    enableEvents: !isMockMode && !!market?.id,
  })

  // Shared market action hook for transactions
  const marketAction = useMarketAction(market?.id ? BigInt(market.id) : 0n, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.markets.active(effectiveChannelId || '') })
      setTxSuccess(true)
      setAmount('')
      setSelectedOutcome(null)
      setTimeout(() => setTxSuccess(false), 3_000)
    },
  })

  // Watch for current user's bet confirmations for instant feedback
  useWatchUserBets({
    userAddress: address,
    marketId: market?.id ? BigInt(market.id) : undefined,
    onBetConfirmed: () => {
      setTxSuccess(true)
      setTimeout(() => setTxSuccess(false), 3_000)
    },
    enabled: !isMockMode && isConnected && !!address && !!market?.id,
  })

  // Handle buy action using shared hook
  const handleBuy = useCallback(() => {
    if (!amount || selectedOutcome === null || !market?.outcomes[selectedOutcome]) return
    marketAction.bet(selectedOutcome, amount, needsApproval, market.outcomes[selectedOutcome])
  }, [amount, selectedOutcome, market, needsApproval, marketAction])

  // Handle claim winnings
  const handleClaimWinnings = useCallback(async () => {
    if (!market?.id) return
    await marketAction.claimWinnings()
    setHasClaimed(true)
    // Clear prediction mapping after claim
    if (effectiveChannelId) {
      fetch(`${getApiBaseUrl()}/api/admin/clear-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: effectiveChannelId }),
      }).catch(console.error)
    }
  }, [market?.id, marketAction, effectiveChannelId])

  // Handle claim refund for voided markets
  const handleClaimVoided = useCallback(async () => {
    if (!market?.id || !userShares) return
    const userOutcomeShares = userShares as readonly bigint[]
    
    // Find first outcome with shares to claim refund
    for (let i = 0; i < userOutcomeShares.length; i++) {
      if (userOutcomeShares[i] > 0n) {
        await marketAction.claimRefund(i)
        setHasClaimed(true)
        // Clear prediction mapping after claim
        if (effectiveChannelId) {
          fetch(`${getApiBaseUrl()}/api/admin/clear-prediction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: effectiveChannelId }),
          }).catch(console.error)
        }
        break
      }
    }
  }, [market?.id, userShares, marketAction, effectiveChannelId])

  // Handle quick amount button click
  const handleQuickAmount = (amt: number) => setAmount(amt.toString())

  // Countdown timer
  const remainingSeconds = useCountdown(market?.closesAt ?? null)
  const timeRemaining = !market?.closesAt ? null : remainingSeconds <= 0 ? 'Closed' : formatCountdown(remainingSeconds)

  const isLoading = marketAction.isLoading
  
  // Check market state
  const isTimePassed = remainingSeconds <= 0
  const isMarketClosed = market?.state === 'locked' || (market?.state === 'open' && isTimePassed)
  const isMarketResolved = market?.state === 'resolved'
  const isMarketPending = market?.state === 'pending'

  // Calculate order summary values - use USDC decimals (6), not 18
  const amountValue = useMemo(() => {
    const parsed = parseFloat(amount)
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed
  }, [amount])
  
  const pricePerShare = selectedOutcome !== null ? (outcomePrices[selectedOutcome] ?? 0) : 0
  const estPayoutFormatted = Number(formatUnits(estimatedPayout, USDC.decimals))
  const potentialReturnPct = amountValue > 0 ? ((estPayoutFormatted / amountValue - 1) * 100) : 0

  const getUserOutcomeShares = (): readonly bigint[] | undefined => {
    if (!userShares) return undefined
    return userShares as readonly bigint[]
  }

  // Common panel wrapper
  const PanelWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="h-full w-full overflow-auto bg-card">
      <div className="min-h-full">
        {children}
      </div>
    </div>
  )

  // Loading state - only show spinner on initial load when no cached data exists
  // This implements "stale-while-revalidate" pattern for smoother UX
  if (isLoadingMarket && !market && !isMockMode) {
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

  // Market pending state
  if (isMarketPending) {
    return (
      <PanelWrapper>
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
      </PanelWrapper>
    )
  }

  // Market closed state
  if (isMarketClosed) {
    return (
      <PanelWrapper>
        <div className="border-b border-border/40 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Betting closed
          </div>
          <h2 className="mt-2 font-semibold text-foreground">{market.question}</h2>
        </div>
        <div className="p-4 space-y-3">
          {market.outcomes.map((outcome, idx) => {
            const price = outcomePrices[idx] || 0.5
            const baseColor = getOutcomeColor(outcome, idx)
            const pct = Math.round(price * 100)
            return (
              <div
                key={idx}
                className="relative overflow-hidden rounded-lg border border-border/50 bg-muted/20 p-3"
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg,
                      color-mix(in srgb, ${baseColor} 20%, transparent) 0%,
                      color-mix(in srgb, ${baseColor} 10%, transparent) 100%
                    )`,
                  }}
                />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: baseColor }} />
                    <span className="font-medium">{outcome}</span>
                  </div>
                  <span className="font-mono font-semibold">{pct}.0%</span>
                </div>
              </div>
            )
          })}
          <p className="text-center text-sm text-muted-foreground">Awaiting results...</p>
        </div>
      </PanelWrapper>
    )
  }

  // Market resolved state
  if (isMarketResolved) {
    const isVoided = market.isVoided === true || (market.resolvedOutcome === null || market.resolvedOutcome === undefined)
    const userOutcomeShares = getUserOutcomeShares()
    const totalUserShares = userOutcomeShares 
      ? userOutcomeShares.reduce((sum: bigint, s: bigint) => sum + s, 0n) 
      : 0n
    const hasShares = totalUserShares > 0n

    const winningOutcomeIndex = market.resolvedOutcome ?? 0
    const winningOutcome = market.outcomes[winningOutcomeIndex] || 'Unknown'
    const winnerColor = getOutcomeColor(winningOutcome, winningOutcomeIndex)
    const winningSharesRaw = userOutcomeShares?.[winningOutcomeIndex] ?? 0n
    const hasWinningShares = winningSharesRaw > 0n

    // Voided market UI
    if (isVoided) {
      return (
        <PanelWrapper>
          <div className="border-b border-border/40 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Prediction canceled
            </div>
            <h2 className="mt-2 font-semibold text-foreground">{market.question}</h2>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              This prediction was canceled by the streamer. You can reclaim your original investment.
            </p>
            {hasShares && isConnected && !hasClaimed && (
              <button
                onClick={handleClaimVoided}
                disabled={isLoading}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all disabled:cursor-not-allowed",
                  isLoading 
                    ? "bg-muted text-muted-foreground" 
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Reclaim Funds
              </button>
            )}
            {hasClaimed && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/10 py-3 text-primary">
                <CheckCircle className="h-4 w-4" />
                Funds reclaimed!
              </div>
            )}
            {!isConnected && hasShares && (
              <button
                onClick={login}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-3 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <Wallet className="h-4 w-4" />
                Connect wallet to reclaim
              </button>
            )}
            {isConnected && !hasShares && (
              <p className="text-center text-sm text-muted-foreground">
                You have no shares to reclaim.
              </p>
            )}
          </div>
        </PanelWrapper>
      )
    }

    // Normal resolved market UI
    return (
      <PanelWrapper>
        <div className="border-b border-border/40 p-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: winnerColor }}>
            <Trophy className="h-4 w-4" />
            {winningOutcome} wins
          </div>
          <h2 className="mt-2 font-semibold text-foreground">{market.question}</h2>
        </div>
        <div className="p-4 space-y-4">
          {hasWinningShares && isConnected && !hasClaimed && (
            <button
              onClick={handleClaimWinnings}
              disabled={isLoading}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all disabled:cursor-not-allowed",
                isLoading
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              )}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Claim Winnings
            </button>
          )}
          {hasClaimed && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-3 text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              Winnings claimed!
            </div>
          )}
          {!isConnected && (
            <button
              onClick={login}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-3 text-sm text-muted-foreground hover:bg-muted/50"
            >
              <Wallet className="h-4 w-4" />
              Connect wallet to claim
            </button>
          )}
          {isConnected && !hasWinningShares && !hasClaimed && (
            <p className="text-center text-sm text-muted-foreground">
              You didn&apos;t bet on the winning outcome.
            </p>
          )}
        </div>
      </PanelWrapper>
    )
  }

  // Active market - main buy UI
  return (
    <PanelWrapper>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 p-4">
        <h2 className="flex-1 font-semibold text-foreground line-clamp-2">{market.question}</h2>
        <div className="ml-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{timeRemaining}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Outcome Selection */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground mb-1">Select outcome</label>
          <div className="space-y-2">
            {market.outcomes.map((outcome, idx) => {
              const price = outcomePrices[idx] || 0.5
              const isSelected = selectedOutcome === idx
              const baseColor = getOutcomeColor(outcome, idx)
              const colors = getOutcomeClasses(outcome)
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedOutcome(idx)}
                  className={cn(
                    'relative flex w-full items-center justify-between rounded-lg border p-3 transition-all',
                    isSelected
                      ? 'border-transparent ring-2 ring-offset-1 ring-offset-background'
                      : 'border-border hover:border-border/80 bg-card/50',
                    isSelected && colors.bgLight
                  )}
                  style={{
                    boxShadow: isSelected ? `0 0 0 2px ${baseColor}` : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: baseColor }} />
                    <span className="font-medium">{outcome}</span>
                  </div>
                  <span className="font-mono font-medium">{(price * 100).toFixed(1)}%</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Wallet Connection or Trade UI */}
        {!isConnected ? (
          <button
            onClick={login}
            disabled={isWalletLoading}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all disabled:cursor-not-allowed",
              isWalletLoading
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isWalletLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Connect Wallet
          </button>
        ) : (
          <>
            {/* Amount Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Amount (USDC)</label>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wallet className="h-3 w-3" />
                  Balance: {balanceFormatted.toFixed(2)} USDC
                </span>
              </div>
              
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {BET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleQuickAmount(amt)}
                    className={cn(
                      'flex-1 rounded-md border py-1.5 text-sm font-medium transition-colors',
                      amount === amt.toString()
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-muted/30 text-foreground hover:bg-muted/50'
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Buy Button */}
            <button
              onClick={handleBuy}
              disabled={!amountValue || selectedOutcome === null || isLoading}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold transition-all disabled:cursor-not-allowed',
                (!amountValue || selectedOutcome === null || isLoading)
                  ? 'bg-muted text-muted-foreground opacity-100' // Explicitly set muted colors for better contrast
                  : (selectedOutcome === 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 
                     selectedOutcome === 1 ? 'bg-rose-600 hover:bg-rose-500 text-white' : 
                     'bg-primary text-primary-foreground')
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Placing bet...
                </>
              ) : txSuccess ? (
                'Bet Placed!'
              ) : (
                'Place Bet'
              )}
            </button>

            {/* Order Summary */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Current odds</span>
                <span className="text-foreground">{(pricePerShare * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Est. payout if win</span>
                <span className={cn("font-medium", potentialReturnPct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  ${estPayoutFormatted.toFixed(2)} ({potentialReturnPct >= 0 ? '+' : ''}{potentialReturnPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </PanelWrapper>
  )
}
