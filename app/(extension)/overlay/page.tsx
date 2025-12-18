'use client'

/**
 * Twitch Video Overlay - Betting UI
 * 
 * Overlay panel for placing bets on prediction markets using USDC.
 * Refactored to use TanStack Query for polling and cleaner patterns.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useWriteContract, useReadContract, useAccount, useSendCalls, useCallsStatus } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatUnits, encodeFunctionData } from 'viem'
import { config } from '@/lib/wagmi'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { calcBuyAmount, getPrice } from '@/lib/market-math'
import { getOutcomeColor, getOutcomeClasses } from '@/lib/outcome-colors'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { USDC, ERC20_ABI, parseUSDC } from '@/lib/tokens'
import { useCountdown, formatCountdown } from '@/lib/hooks/use-countdown'
import { useUsdcBalance } from '@/lib/hooks/use-usdc-balance'
import { INTERVALS, TRADING } from '@/lib/constants'
import type { MarketApiResponse } from '@/lib/types'
import { useMarketEvents, useWatchUserBets } from '@/lib/hooks/use-market-events'
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
    pools: ['650000000000000000000', '350000000000000000000'],
    state: 'open',
    closesAt: Math.floor(Date.now() / 1_000) + 300,
    totalPot: '1000000000000000000000',
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

  // Contract interactions - use async pattern for cleaner handling
  const { writeContractAsync, isPending: isWritePending, reset: resetWrite } = useWriteContract()
  const [isConfirming, setIsConfirming] = useState(false)
  
  // Batched calls for approve + buy (still needs Effect for status polling)
  const { sendCalls, data: batchCallsData, isPending: isBatchPending, reset: resetBatch } = useSendCalls()
  const batchId = typeof batchCallsData === 'string' ? batchCallsData : batchCallsData?.id
  const { data: batchStatus } = useCallsStatus({
    id: batchId!,
    query: { 
      enabled: !!batchId,
      refetchInterval: (query) => {
        const status = query.state.data?.status
        if (status === 'success' || status === 'failure') return false
        return 1_000
      },
    },
  })
  const isBatchSuccess = batchStatus?.status === 'success'

  // Track handled batch transactions (single tx now handled via async/await)
  const handledBatchIdRef = useRef<string | null>(null)
  const isClaimTxRef = useRef(false)

  // Fetch active market using useQuery - replaces manual setInterval polling
  // With WebSocket events, we can reduce polling frequency since events trigger instant updates
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
    // Reduced from 3s to 10s - WebSocket events handle real-time updates now
    refetchInterval: INTERVALS.BALANCE_REFRESH,
  })

  // Real-time contract event subscriptions via WebSocket
  // Automatically invalidates queries when events occur (no polling delay)
  useMarketEvents({
    marketId: market?.id ? BigInt(market.id) : undefined,
    channelId: effectiveChannelId || undefined,
    enabled: !isMockMode && !!market?.id,
  })

  // Watch for current user's bet confirmations for instant feedback
  useWatchUserBets({
    userAddress: address,
    marketId: market?.id ? BigInt(market.id) : undefined,
    onBetConfirmed: (sharesMinted) => {
      // Instant success feedback when bet is confirmed on-chain
      setTxSuccess(true)
      setTimeout(() => setTxSuccess(false), 3_000)
    },
    enabled: !isMockMode && isConnected && !!address && !!market?.id,
  })

  // USDC Balance and Allowance - using centralized hook
  const { balance: usdcBalance, allowance: usdcAllowance, balanceFormatted } = useUsdcBalance()

  // Get market pools
  const { data: pools } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketPools',
    args: [BigInt(market?.id || '0')],
    query: { enabled: !!market?.id },
  })

  // Get user's shares
  const { data: userShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserShares',
    args: [BigInt(market?.id || '0'), address!],
    query: { enabled: !!market?.id && isConnected && !!address },
  })

  const outcomeShares = pools ?? []
  // Fee from API response (in basis points)
  const totalFeeBps = BigInt((market?.protocolFeeBps ?? 0) + (market?.creatorFeeBps ?? 0))

  const outcomePrices = useMemo(() => {
    if (!outcomeShares.length || !market) {
      return market?.prices || [0.5, 0.5]
    }
    return Array.from({ length: market.outcomes.length }).map((_, i) => 
      getPrice(i, [...outcomeShares])
    )
  }, [market, outcomeShares])

  // Parse the amount input
  const amountValue = useMemo(() => {
    const parsed = parseFloat(amount)
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed
  }, [amount])

  // Calculate estimated payout
  const estimatedShares = useMemo(() => {
    if (!amountValue || selectedOutcome === null || !outcomeShares.length) return 0n
    try {
      const scaledAmount = parseUSDC(amountValue.toString()) * BigInt(10 ** 12)
      return calcBuyAmount(scaledAmount, selectedOutcome, [...outcomeShares], totalFeeBps)
    } catch {
      return 0n
    }
  }, [amountValue, selectedOutcome, outcomeShares, totalFeeBps])

  // Check if approval needed - derived state
  const needsApproval = useMemo(() => {
    if (!amountValue) return false
    if (usdcAllowance === undefined) return true
    try {
      return usdcAllowance < parseUSDC(amountValue.toString())
    } catch {
      return true
    }
  }, [amountValue, usdcAllowance])

  // Invalidate queries and reset state after success
  const handleTxSuccess = useCallback((isClaim = false) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.active(effectiveChannelId || '') })
    setTxSuccess(true)
    setAmount('')
    setSelectedOutcome(null)
    setIsConfirming(false)
    
    if (isClaim) {
      setHasClaimed(true)
      if (effectiveChannelId) {
        fetch(`${getApiBaseUrl()}/api/admin/clear-prediction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: effectiveChannelId }),
        }).catch(console.error)
      }
    } else {
      setTimeout(() => setTxSuccess(false), 3_000)
    }
    
    resetWrite()
    resetBatch()
  }, [queryClient, effectiveChannelId, resetWrite, resetBatch])

  // Handle batch transaction success (still needs Effect for polling-based status)
  useEffect(() => {
    if (isBatchSuccess && batchId && batchId !== handledBatchIdRef.current) {
      handledBatchIdRef.current = batchId
      handleTxSuccess(isClaimTxRef.current)
      isClaimTxRef.current = false
    }
  }, [isBatchSuccess, batchId, handleTxSuccess])

  const handleBuy = useCallback(async () => {
    if (!amountValue || selectedOutcome === null || !market || !market.id) return
    
    try {
      const amountBigInt = parseUSDC(amountValue.toString())
      const marketId = BigInt(market.id)
      
      if (needsApproval) {
        // Batch calls - uses polling-based status, handled by Effect
        sendCalls({
          calls: [
            {
              to: USDC.address,
              data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [PREDICTION_MARKET_ADDRESS, amountBigInt],
              }),
            },
            {
              to: PREDICTION_MARKET_ADDRESS,
              data: encodeFunctionData({
                abi: PREDICTION_MARKET_ABI,
                functionName: 'bet',
                args: [marketId, BigInt(selectedOutcome), amountBigInt],
              }),
            },
          ],
        })
      } else {
        // Single tx - use async pattern for cleaner handling
        const hash = await writeContractAsync({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'bet',
          args: [marketId, BigInt(selectedOutcome), amountBigInt],
        })
        setIsConfirming(true)
        await waitForTransactionReceipt(config, { hash })
        handleTxSuccess()
      }
    } catch (e) {
      console.error('Error placing bet:', e)
      setIsConfirming(false)
    }
  }, [amountValue, selectedOutcome, market, needsApproval, sendCalls, writeContractAsync, handleTxSuccess])

  const handleClaimWinnings = useCallback(async () => {
    if (!market?.id) return
    
    try {
      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimWinnings',
        args: [BigInt(market.id)]
      })
      setIsConfirming(true)
      await waitForTransactionReceipt(config, { hash })
      handleTxSuccess(true) // isClaim = true
    } catch (e) {
      console.error('Error claiming winnings:', e)
      setIsConfirming(false)
    }
  }, [market?.id, writeContractAsync, handleTxSuccess])

  const handleClaimVoided = useCallback(async () => {
    if (!market?.id || !userShares) return
    const userOutcomeShares = userShares as readonly bigint[]
    
    // Find first outcome with shares to claim refund
    for (let i = 0; i < userOutcomeShares.length; i++) {
      if (userOutcomeShares[i] > 0n) {
        try {
          const hash = await writeContractAsync({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'claimRefund',
            args: [BigInt(market.id), BigInt(i)]
          })
          setIsConfirming(true)
          await waitForTransactionReceipt(config, { hash })
          handleTxSuccess(true) // isClaim = true
        } catch (e) {
          console.error('Error claiming refund:', e)
          setIsConfirming(false)
        }
        break
      }
    }
  }, [market?.id, userShares, writeContractAsync, handleTxSuccess])

  // Handle quick amount button click
  const handleQuickAmount = (amt: number) => setAmount(amt.toString())

  // Handle percentage of balance click
  const handlePercentage = (pct: number) => {
    if (!usdcBalance) return
    const bal = balanceFormatted
    const newAmount = Math.floor(bal * pct * 100) / 100
    setAmount(newAmount.toString())
  }

  // Countdown timer
  const remainingSeconds = useCountdown(market?.closesAt ?? null)
  const timeRemaining = !market?.closesAt ? null : remainingSeconds <= 0 ? 'Closed' : formatCountdown(remainingSeconds)

  const isLoading = isWritePending || isBatchPending || isConfirming
  
  // Check market state
  const isTimePassed = remainingSeconds <= 0
  const isMarketClosed = market?.state === 'locked' || (market?.state === 'open' && isTimePassed)
  const isMarketResolved = market?.state === 'resolved'
  const isMarketPending = market?.state === 'pending'

  // Calculate order summary values
  const pricePerShare = selectedOutcome !== null ? outcomePrices[selectedOutcome] : 0
  const estShares = Number(formatUnits(estimatedShares, 18))
  const potentialReturn = estShares
  const potentialReturnPct = amountValue > 0 ? ((potentialReturn / amountValue - 1) * 100) : 0

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

  // Loading state
  if (isLoadingMarket && !isMockMode) {
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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

              {/* Percentage buttons */}
              <div className="flex gap-2">
                {[0.25, 0.5, 1].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handlePercentage(pct)}
                    className="flex-1 rounded-md border border-border bg-muted/30 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50"
                  >
                    {pct * 100}%
                  </button>
                ))}
              </div>
            </div>

            {/* Buy Button */}
            <button
              onClick={handleBuy}
              disabled={!amountValue || selectedOutcome === null || isLoading}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-50',
                selectedOutcome === 0 ? 'bg-emerald-600 hover:bg-emerald-500' : 
                selectedOutcome === 1 ? 'bg-rose-600 hover:bg-rose-500' : 
                'bg-primary'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isConfirming ? 'Confirming...' : 'Placing bet...'}
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
                  ${potentialReturn.toFixed(2)} ({potentialReturnPct >= 0 ? '+' : ''}{potentialReturnPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </PanelWrapper>
  )
}
