'use client'

/**
 * Twitch Video Overlay - Betting UI
 * 
 * Overlay panel for placing bets on prediction markets using USDC.
 * Mirrors the TradePanel buy flow with quick preset amounts.
 * 
 * Add ?mock=true to test locally with mock data
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount, useSendCalls, useCallsStatus } from 'wagmi'
import { parseUnits, formatUnits, encodeFunctionData } from 'viem'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { calcBuyAmount, getPrice } from '@/lib/market-math'
import { getOutcomeColor, getOutcomeClasses } from '@/lib/outcome-colors'
import { cn } from '@/lib/utils'
import { CheckCircle, Clock, DollarSign, Loader2, Lock, Trophy, Wallet } from 'lucide-react'

// USDC configuration
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const USDC_DECIMALS = 6

// API Base URL for fetching market data
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return ''
  }
  return process.env.NEXT_PUBLIC_APP_URL || ''
}

// ERC20 ABI for approval and balance
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

interface MarketApiResponse {
  id: string
  twitchPredictionId: string
  question: string
  outcomes: string[]
  prices: number[]
  state: string
  closesAt: number
  liquidity: string
  balance: string
  resolvedOutcome?: number | null
  isVoided?: boolean
}

// Mock market data for local testing (use ?mock=true)
function getMockMarket(): MarketApiResponse {
  return {
    id: '1',
    twitchPredictionId: 'mock-123',
    question: 'Will I beat this boss on the first try?',
    outcomes: ['Yes', 'No'],
    prices: [0.65, 0.35],
    state: 'open',
    closesAt: Math.floor(Date.now() / 1000) + 300,
    liquidity: '1000000000',
    balance: '500000000',
  }
}

function formatUSDC(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS)
}

function parseUSDC(value: string): bigint {
  return parseUnits(value, USDC_DECIMALS)
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s >= 60 * 60) {
    const hours = Math.floor(s / 3600)
    const minutes = Math.floor((s % 3600) / 60)
    const seconds = s % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Quick bet amounts
const BET_AMOUNTS = [1, 5, 10, 25]

export default function OverlayPage() {
  const searchParams = useSearchParams()
  const isMockMode = searchParams.get('mock') === 'true'
  const testChannelId = searchParams.get('channelId')
  const isTestMode = !!testChannelId
  
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [market, setMarket] = useState<MarketApiResponse | null>(isMockMode ? getMockMarket() : null)
  const [isLoadingMarket, setIsLoadingMarket] = useState(!isMockMode)
  const [marketError, setMarketError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [txSuccess, setTxSuccess] = useState(false)
  const [isClaimTx, setIsClaimTx] = useState(false)
  const [hasClaimed, setHasClaimed] = useState(false)

  // Twitch extension context
  const { isReady, channelId, token } = useTwitchExtension()
  const effectiveIsReady = isMockMode || isTestMode || isReady
  const effectiveChannelId = isMockMode ? 'mock-channel' : (testChannelId || channelId)

  // Wallet connection
  const { login } = useLoginWithAbstract()
  const { isLoading: isWalletLoading } = useAbstractClient()
  const { address, isConnected } = useAccount()

  // Contract interactions
  const { writeContract, data: hash, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  
  // Batched calls for approve + buy
  const { sendCalls, data: batchCallsData, isPending: isBatchPending } = useSendCalls()
  const batchId = typeof batchCallsData === 'string' ? batchCallsData : batchCallsData?.id
  const { data: batchStatus } = useCallsStatus({
    id: batchId!,
    query: { 
      enabled: !!batchId,
      refetchInterval: (query) => {
        const status = query.state.data?.status
        if (status === 'success' || status === 'failure') return false
        return 1000
      },
    },
  })
  const isBatchSuccess = batchStatus?.status === 'success'

  // USDC Balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: isConnected && !!address },
  })

  // USDC Allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address!, PREDICTION_MARKET_ADDRESS],
    query: { enabled: isConnected && !!address },
  })

  // Get market shares for price calculation
  const { data: shares, refetch: refetchShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketShares',
    args: [BigInt(market?.id || '0')],
    query: { enabled: !!market?.id },
  })

  // Get fees
  const { data: fees } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketFees',
    args: [BigInt(market?.id || '0')],
    query: { enabled: !!market?.id },
  })

  // Get user's shares for this market
  const { data: userShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserMarketShares',
    args: [BigInt(market?.id || '0'), address!],
    query: { enabled: !!market?.id && isConnected && !!address },
  })

  // Calculate prices from on-chain data
  const outcomeShares = shares ? shares[1] : []
  const liquidity = shares ? shares[0] : 0n
  const buyFee = fees ? (fees[0].fee + fees[0].treasuryFee + fees[0].distributorFee) : 0n

  const outcomePrices = useMemo(() => {
    if (!outcomeShares.length || !liquidity || !market) {
      return market?.prices || [0.5, 0.5]
    }
    return Array.from({ length: market.outcomes.length }).map((_, i) => 
      getPrice(i, [...outcomeShares], liquidity)
    )
  }, [market, outcomeShares, liquidity])

  // Parse the amount input
  const amountValue = useMemo(() => {
    const parsed = parseFloat(amount)
    return isNaN(parsed) || parsed <= 0 ? 0 : parsed
  }, [amount])

  // Calculate estimated shares for bet
  const estimatedShares = useMemo(() => {
    if (!amountValue || selectedOutcome === null || !outcomeShares.length) return 0n
    try {
      const scaledAmount = parseUSDC(amountValue.toString()) * BigInt(10 ** 12)
      return calcBuyAmount(scaledAmount, selectedOutcome, [...outcomeShares], buyFee)
    } catch {
      return 0n
    }
  }, [amountValue, selectedOutcome, outcomeShares, buyFee])

  // Check if approval needed
  const needsApproval = useMemo(() => {
    if (!amountValue) return false
    if (usdcAllowance === undefined) return true
    try {
      return usdcAllowance < parseUSDC(amountValue.toString())
    } catch {
      return true
    }
  }, [amountValue, usdcAllowance])

  // Fetch active market for this channel
  useEffect(() => {
    if (isMockMode) {
      setIsLoadingMarket(false)
      return
    }
    
    if (!effectiveIsReady || !effectiveChannelId) return

    const fetchMarket = async () => {
      try {
        setIsLoadingMarket(true)
        const res = await fetch(`${getApiBaseUrl()}/api/markets/active?channelId=${effectiveChannelId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        })
        
        if (res.status === 404) {
          setMarket(null)
          setMarketError(null)
          return
        }
        
        if (!res.ok) throw new Error('Failed to fetch market')
        
        const data = await res.json()
        setMarket(data)
        setMarketError(null)
      } catch (err) {
        setMarketError('Failed to load market')
        console.error('Error fetching market:', err)
      } finally {
        setIsLoadingMarket(false)
      }
    }

    fetchMarket()
    const interval = setInterval(fetchMarket, 2000)
    return () => clearInterval(interval)
  }, [isMockMode, effectiveIsReady, effectiveChannelId, token])

  // Handle transaction success
  const handledHashRef = useRef<string | null>(null)
  const handledBatchIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isSuccess && hash && hash !== handledHashRef.current) {
      handledHashRef.current = hash
      setTxSuccess(true)
      setIsPending(false)
      setAmount('')
      setSelectedOutcome(null)
      refetchBalance()
      refetchAllowance()
      refetchShares()
      
      if (isClaimTx) {
        setHasClaimed(true)
        setIsClaimTx(false)
        if (effectiveChannelId) {
          fetch(`${getApiBaseUrl()}/api/admin/clear-prediction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: effectiveChannelId }),
          }).catch(console.error)
        }
      } else {
        setTimeout(() => setTxSuccess(false), 3000)
      }
    }
  }, [isSuccess, hash, refetchBalance, refetchAllowance, refetchShares, isClaimTx, effectiveChannelId])

  useEffect(() => {
    if (isBatchSuccess && batchId && batchId !== handledBatchIdRef.current) {
      handledBatchIdRef.current = batchId
      setTxSuccess(true)
      setIsPending(false)
      setAmount('')
      setSelectedOutcome(null)
      refetchBalance()
      refetchAllowance()
      refetchShares()
      setTimeout(() => setTxSuccess(false), 3000)
    }
  }, [isBatchSuccess, batchId, refetchBalance, refetchAllowance, refetchShares])

  const handleBuy = () => {
    if (!amountValue || selectedOutcome === null || !market) return
    
    setIsPending(true)
    
    try {
      const amountBigInt = parseUSDC(amountValue.toString())
      
      if (needsApproval) {
        sendCalls({
          calls: [
            {
              to: USDC_ADDRESS,
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
                functionName: 'buy',
                args: [BigInt(market.id), BigInt(selectedOutcome), 0n, amountBigInt],
              }),
            },
          ],
        })
      } else {
        writeContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'buy',
          args: [BigInt(market.id), BigInt(selectedOutcome), 0n, amountBigInt],
        })
      }
    } catch (e) {
      console.error('Error placing bet:', e)
      setIsPending(false)
    }
  }

  // Handle quick amount button click
  const handleQuickAmount = (amt: number) => {
    setAmount(amt.toString())
  }

  // Handle percentage of balance click
  const handlePercentage = (pct: number) => {
    if (!usdcBalance) return
    const bal = Number(formatUSDC(usdcBalance))
    const newAmount = Math.floor(bal * pct * 100) / 100
    setAmount(newAmount.toString())
  }

  // Update "now" every second so countdown ticks in real time
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const interval = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const timeRemaining = useMemo(() => {
    if (!market?.closesAt) return null
    const remaining = market.closesAt - nowSec
    if (remaining <= 0) return 'Closed'
    return formatCountdown(remaining)
  }, [market?.closesAt, nowSec])

  const isLoading = isWritePending || isBatchPending || isConfirming || isPending
  
  // Check market state
  const isTimePassed = market?.closesAt ? nowSec > market.closesAt : false
  const isMarketClosed = market?.state === 'closed' || (market?.state === 'open' && isTimePassed)
  const isMarketResolved = market?.state === 'resolved'
  const isMarketPending = market?.state === 'pending'

  // Calculate order summary values
  const pricePerShare = selectedOutcome !== null ? outcomePrices[selectedOutcome] : 0
  const estShares = Number(formatUnits(estimatedShares, 18))
  const potentialReturn = estShares
  const potentialReturnPct = amountValue > 0 ? ((potentialReturn / amountValue - 1) * 100) : 0

  // Common panel wrapper - fills the Video Component iframe
  const PanelWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="h-full w-full overflow-auto bg-card">
      <div className="min-h-full">
        {children}
      </div>
    </div>
  )

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

  // Market resolved state (includes voided)
  if (isMarketResolved) {
    // Market is voided if API says so, OR if resolved but no valid winning outcome
    const isVoided = market.isVoided === true || (market.resolvedOutcome === null || market.resolvedOutcome === undefined)
    // userShares returns: { liquidity: bigint, outcomes: bigint[] } or [bigint, bigint[]]
    // Handle both named property access and array index access
    const getUserOutcomeShares = (): readonly bigint[] | undefined => {
      if (!userShares) return undefined
      // Check for named property first (wagmi with named ABI outputs)
      if ('outcomes' in userShares && Array.isArray(userShares.outcomes)) {
        return userShares.outcomes as readonly bigint[]
      }
      // Fallback to array index access
      if (Array.isArray(userShares[1])) {
        return userShares[1] as readonly bigint[]
      }
      return undefined
    }
    const userOutcomeShares = getUserOutcomeShares()
    
    // For voided markets, users can reclaim all their shares
    // For resolved markets, only the winning outcome shares matter
    const totalUserShares = userOutcomeShares 
      ? userOutcomeShares.reduce((sum: bigint, s: bigint) => sum + s, 0n) 
      : 0n
    const hasShares = totalUserShares > 0n

    const winningOutcomeIndex = market.resolvedOutcome ?? 0
    const winningOutcome = market.outcomes[winningOutcomeIndex] || 'Unknown'
    const winnerColor = getOutcomeColor(winningOutcome, winningOutcomeIndex)
    const winningSharesRaw = userOutcomeShares?.[winningOutcomeIndex] ?? 0n
    const hasWinningShares = winningSharesRaw > 0n

    const handleClaimWinnings = () => {
      if (!market?.id) return
      setIsPending(true)
      setIsClaimTx(true)
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimWinnings',
        args: [BigInt(market.id)]
      })
    }

    // For voided markets, claim each outcome separately
    const handleClaimVoided = async () => {
      if (!market?.id || !userOutcomeShares) return
      setIsPending(true)
      setIsClaimTx(true)
      
      // Find first outcome with shares to claim
      for (let i = 0; i < userOutcomeShares.length; i++) {
        if (userOutcomeShares[i] > 0n) {
          writeContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'claimVoidedOutcomeShares',
            args: [BigInt(market.id), BigInt(i)]
          })
          break
        }
      }
    }

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
          <label className="text-sm text-muted-foreground">Select outcome</label>
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
                  Balance: {usdcBalance !== undefined ? Number(formatUSDC(usdcBalance)).toFixed(2) : '0'} USDC
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
                  {isConfirming ? 'Confirming...' : 'Processing...'}
                </>
              ) : txSuccess ? (
                'Bet Placed!'
              ) : (
                'Buy'
              )}
            </button>

            {/* Order Summary */}
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Price per share</span>
                <span className="text-foreground">${pricePerShare.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Est. Shares</span>
                <span className="text-foreground">{estShares.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payout if win</span>
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
