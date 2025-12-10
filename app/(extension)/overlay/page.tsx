'use client'

/**
 * Twitch Video Overlay - Betting UI
 * 
 * Compact overlay that appears on the streamer's video, allowing viewers
 * to place bets on prediction markets using USDC.
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
import { cn } from '@/lib/utils'
import { Loader2, Wallet, ChevronDown, ChevronUp, X } from 'lucide-react'

// USDC configuration
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const USDC_DECIMALS = 6

// API Base URL for fetching market data
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || ''

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
    closesAt: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
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

// Quick bet amounts
const BET_AMOUNTS = [1, 5, 10, 25]

export default function OverlayPage() {
  // Check for mock mode (?mock=true for local testing)
  const searchParams = useSearchParams()
  const isMockMode = searchParams.get('mock') === 'true'
  
  const [isExpanded, setIsExpanded] = useState(isMockMode) // Auto-expand in mock mode
  const [selectedOutcome, setSelectedOutcome] = useState<number | null>(null)
  const [betAmount, setBetAmount] = useState<number | null>(null)
  const [market, setMarket] = useState<MarketApiResponse | null>(isMockMode ? getMockMarket() : null)
  const [isLoadingMarket, setIsLoadingMarket] = useState(!isMockMode)
  const [marketError, setMarketError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [txSuccess, setTxSuccess] = useState(false)

  // Twitch extension context (skipped in mock mode)
  const { isReady, channelId, token, minimize } = useTwitchExtension()
  const effectiveIsReady = isMockMode || isReady
  const effectiveChannelId = isMockMode ? 'mock-channel' : channelId

  // Wallet connection
  const { login, logout } = useLoginWithAbstract()
  const { data: abstractClient, isLoading: isWalletLoading } = useAbstractClient()
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

  // Calculate estimated shares for bet
  const estimatedShares = useMemo(() => {
    if (!betAmount || selectedOutcome === null || !outcomeShares.length) return 0n
    try {
      const scaledAmount = parseUSDC(betAmount.toString()) * BigInt(10 ** 12)
      return calcBuyAmount(scaledAmount, selectedOutcome, [...outcomeShares], buyFee)
    } catch {
      return 0n
    }
  }, [betAmount, selectedOutcome, outcomeShares, buyFee])

  // Check if approval needed
  const needsApproval = useMemo(() => {
    if (!betAmount || !usdcAllowance) return false
    try {
      return usdcAllowance < parseUSDC(betAmount.toString())
    } catch {
      return false
    }
  }, [betAmount, usdcAllowance])

  // Fetch active market for this channel (skip in mock mode)
  useEffect(() => {
    // In mock mode, we already have the market data
    if (isMockMode) {
      setIsLoadingMarket(false)
      return
    }
    
    if (!isReady || !channelId) return

    const fetchMarket = async () => {
      try {
        setIsLoadingMarket(true)
        const res = await fetch(`${API_BASE_URL}/api/markets/active?channelId=${channelId}`, {
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
    const interval = setInterval(fetchMarket, 5000) // Poll every 5 seconds
    return () => clearInterval(interval)
  }, [isMockMode, isReady, channelId, token])

  // Handle transaction success
  const handledHashRef = useRef<string | null>(null)
  const handledBatchIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isSuccess && hash && hash !== handledHashRef.current) {
      handledHashRef.current = hash
      setTxSuccess(true)
      setIsPending(false)
      setBetAmount(null)
      setSelectedOutcome(null)
      refetchBalance()
      refetchAllowance()
      refetchShares()
      setTimeout(() => setTxSuccess(false), 3000)
    }
  }, [isSuccess, hash, refetchBalance, refetchAllowance, refetchShares])

  useEffect(() => {
    if (isBatchSuccess && batchId && batchId !== handledBatchIdRef.current) {
      handledBatchIdRef.current = batchId
      setTxSuccess(true)
      setIsPending(false)
      setBetAmount(null)
      setSelectedOutcome(null)
      refetchBalance()
      refetchAllowance()
      refetchShares()
      setTimeout(() => setTxSuccess(false), 3000)
    }
  }, [isBatchSuccess, batchId, refetchBalance, refetchAllowance, refetchShares])

  const handleBuy = () => {
    if (!betAmount || selectedOutcome === null || !market) return
    
    setIsPending(true)
    
    try {
      const amountBigInt = parseUSDC(betAmount.toString())
      
      if (needsApproval) {
        // Batch approve + buy
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

  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (!market?.closesAt) return null
    const now = Math.floor(Date.now() / 1000)
    const remaining = market.closesAt - now
    if (remaining <= 0) return 'Closed'
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [market?.closesAt])

  // Update timer every second
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const isLoading = isWritePending || isBatchPending || isConfirming || isPending

  // No market state - show minimal badge
  if (!market || market.state !== 'open') {
    return (
      <div className="fixed bottom-20 right-5">
        <div className="flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-md rounded-full text-white/50 text-sm">
          <span className="text-lg">🎯</span>
          <span>No active prediction</span>
        </div>
      </div>
    )
  }

  // Minimized state
  if (!isExpanded) {
    return (
      <div className="fixed bottom-20 right-5">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-black/85 backdrop-blur-md rounded-full text-white hover:bg-black/95 transition-all hover:scale-105 border border-white/10"
        >
          <span className="text-lg">🎯</span>
          <span className="font-semibold">{Math.round(Math.max(...outcomePrices) * 100)}%</span>
          <ChevronUp className="w-4 h-4 text-white/60" />
        </button>
      </div>
    )
  }

  // Expanded state
  return (
    <div className="fixed bottom-20 right-5 w-80">
      <div className="bg-black/92 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 bg-white/5 border-b border-white/10">
          <span className="text-lg">🎯</span>
          <span className="flex-1 font-semibold text-sm text-white truncate">
            {market.question}
          </span>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            <ChevronDown className="w-4 h-4 text-white/60" />
          </button>
        </div>

        {/* Outcomes */}
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            {market.outcomes.map((outcome, idx) => {
              const price = outcomePrices[idx] || 0.5
              const isYes = idx === 0
              const isSelected = selectedOutcome === idx
              
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedOutcome(idx)}
                  className={cn(
                    'flex-1 p-3 rounded-xl border-2 transition-all text-center',
                    isSelected
                      ? isYes
                        ? 'border-emerald-500 bg-emerald-500/20'
                        : 'border-red-500 bg-red-500/20'
                      : 'border-white/10 bg-white/5 hover:bg-white/10',
                  )}
                >
                  <div className="text-sm font-semibold text-white">{outcome}</div>
                  <div className={cn(
                    'text-2xl font-bold',
                    isYes ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {Math.round(price * 100)}%
                  </div>
                </button>
              )
            })}
          </div>

          {/* Wallet Connection or Bet UI */}
          {!isConnected ? (
            <button
              onClick={() => login()}
              disabled={isWalletLoading}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold text-white transition-colors flex items-center justify-center gap-2"
            >
              {isWalletLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wallet className="w-4 h-4" />
              )}
              Connect Wallet
            </button>
          ) : selectedOutcome !== null ? (
            <>
              {/* Bet Amount Buttons */}
              <div className="flex gap-2">
                {BET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount)}
                    className={cn(
                      'flex-1 py-2 rounded-lg font-semibold text-sm transition-all',
                      betAmount === amount
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/10 text-white/80 hover:bg-white/20'
                    )}
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              {/* Estimated Return */}
              {betAmount && estimatedShares > 0n && (
                <div className="text-xs text-white/60 text-center">
                  Est. {Number(formatUnits(estimatedShares, 18)).toFixed(2)} shares
                  {' • '}
                  Potential ${(Number(formatUnits(estimatedShares, 18))).toFixed(2)} payout
                </div>
              )}

              {/* Buy Button */}
              <button
                onClick={handleBuy}
                disabled={!betAmount || isLoading}
                className={cn(
                  'w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2',
                  betAmount
                    ? selectedOutcome === 0
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                    : 'bg-white/20 cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isConfirming ? 'Confirming...' : 'Processing...'}
                  </>
                ) : txSuccess ? (
                  '✓ Bet Placed!'
                ) : betAmount ? (
                  `Buy ${market.outcomes[selectedOutcome]} for $${betAmount}`
                ) : (
                  'Select Amount'
                )}
              </button>
            </>
          ) : (
            <div className="text-center text-white/50 text-sm py-2">
              Select an outcome to bet
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-3 py-2 bg-white/5 border-t border-white/10 text-xs text-white/50">
          <div>
            {isConnected && usdcBalance !== undefined && (
              <span>💰 ${Number(formatUSDC(usdcBalance)).toFixed(2)}</span>
            )}
          </div>
          <div>
            ⏱️ {timeRemaining || '--:--'}
          </div>
        </div>
      </div>
    </div>
  )
}

