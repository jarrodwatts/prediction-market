'use client'

/**
 * Market Action Hooks
 * 
 * Uses async/await pattern for single transactions (cleaner than Effects).
 * Batch transactions still use Effect for polling-based status.
 */

import { useCallback, useRef, useEffect, useState } from 'react'
import { useWriteContract, useSendCalls, useCallsStatus, useAccount } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData } from 'viem'
import { config } from '@/lib/wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { queryKeys } from '@/lib/query-keys'
import { useTransactionToast } from '@/lib/use-transaction-toast'
import { USDC, ERC20_ABI, parseUSDC } from '@/lib/tokens'

type TxType = 'bet' | 'claimWinnings' | 'claimRefund' | 'approve'

interface MutationOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

/**
 * Hook for market actions
 */
export function useMarketAction(marketId: bigint, options?: MutationOptions) {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const txToast = useTransactionToast()
  
  // Single transactions use async pattern (no Effects needed)
  const { writeContractAsync, isPending: isWritePending, reset: resetWrite } = useWriteContract()
  const [isConfirming, setIsConfirming] = useState(false)
  
  // Batched calls still use polling-based status (needs Effect)
  const { sendCalls, data: batchCallsData, isPending: isBatchPending, error: batchError, reset: resetBatch } = useSendCalls()
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
  const isBatchFailed = batchStatus?.status === 'failure'
  const isBatchConfirming = !!batchId && batchStatus?.status === 'pending'
  
  // Track batch transaction handling (single tx now handled via async/await)
  const txTypeRef = useRef<TxType | null>(null)
  const handledBatchIdRef = useRef<string | null>(null)
  const handledBatchErrorRef = useRef<Error | null>(null)
  const handledBatchFailureRef = useRef<string | null>(null)
  
  const isLoading = isWritePending || isConfirming || isBatchPending || isBatchConfirming
  
  // Invalidate relevant queries after successful transaction
  const invalidateQueries = useCallback(() => {
    const marketIdStr = marketId.toString()
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.list() })
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.detail(marketIdStr) })
    queryClient.invalidateQueries({ queryKey: queryKeys.markets.history(marketIdStr) })
    if (address) {
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.user.shares(marketIdStr, address) 
      })
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.user.cashflow(marketIdStr, address) 
      })
    }
  }, [queryClient, marketId, address])
  
  // Handle batch transaction success (still needs Effect for polling)
  useEffect(() => {
    if (isBatchSuccess && batchId && batchId !== handledBatchIdRef.current) {
      handledBatchIdRef.current = batchId
      
      if (txTypeRef.current) {
        txToast.showSuccess(txTypeRef.current)
        txTypeRef.current = null
      }
      
      invalidateQueries()
      options?.onSuccess?.()
    }
  }, [isBatchSuccess, batchId, txToast, invalidateQueries, options])
  
  // Handle batch errors (still needs Effect for polling)
  useEffect(() => {
    if (batchError && batchError !== handledBatchErrorRef.current) {
      handledBatchErrorRef.current = batchError
      if (txTypeRef.current) {
        txToast.showError(txTypeRef.current, batchError)
        txTypeRef.current = null
      }
      options?.onError?.(batchError)
    }
  }, [batchError, txToast, options])
  
  // Handle batch failure from status (still needs Effect for polling)
  useEffect(() => {
    if (isBatchFailed && batchId && batchId !== handledBatchFailureRef.current) {
      handledBatchFailureRef.current = batchId
      if (txTypeRef.current) {
        txToast.showError(txTypeRef.current, 'Transaction failed on chain')
        txTypeRef.current = null
      }
      options?.onError?.(new Error('Transaction failed on chain'))
    }
  }, [isBatchFailed, batchId, txToast, options])
  
  // Reset state for new transaction
  const reset = useCallback(() => {
    txTypeRef.current = null
    handledBatchIdRef.current = null
    handledBatchErrorRef.current = null
    handledBatchFailureRef.current = null
    setIsConfirming(false)
    resetWrite()
    resetBatch()
  }, [resetWrite, resetBatch])
  
  /**
   * Place a bet on an outcome (final, cannot be cancelled)
   */
  const bet = useCallback(async (
    outcomeId: number,
    amount: string,
    needsApproval: boolean,
    outcomeTitle?: string
  ) => {
    reset()
    txToast.showPending('bet', `Betting $${amount} on ${outcomeTitle ?? `Outcome ${outcomeId + 1}`}`)
    
    try {
      const amountBigInt = parseUSDC(amount)
      
      if (needsApproval) {
        // Batch calls - uses polling-based status, handled by Effect
        txTypeRef.current = 'bet'
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
                args: [marketId, BigInt(outcomeId), amountBigInt],
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
          args: [marketId, BigInt(outcomeId), amountBigInt],
        })
        setIsConfirming(true)
        await waitForTransactionReceipt(config, { hash })
        setIsConfirming(false)
        txToast.showSuccess('bet')
        invalidateQueries()
        options?.onSuccess?.()
      }
    } catch (e) {
      setIsConfirming(false)
      txToast.showError('bet', e)
      options?.onError?.(e)
    }
  }, [marketId, writeContractAsync, sendCalls, txToast, reset, invalidateQueries, options])
  
  /**
   * Claim winnings after market resolution.
   * Only callable if you bet on the winning outcome.
   */
  const claimWinnings = useCallback(async () => {
    reset()
    txToast.showPending('claimWinnings')
    
    try {
      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimWinnings',
        args: [marketId],
      })
      setIsConfirming(true)
      await waitForTransactionReceipt(config, { hash })
      setIsConfirming(false)
      txToast.showSuccess('claimWinnings')
      invalidateQueries()
      options?.onSuccess?.()
    } catch (e) {
      setIsConfirming(false)
      txToast.showError('claimWinnings', e)
      options?.onError?.(e)
    }
  }, [marketId, writeContractAsync, txToast, reset, invalidateQueries, options])
  
  /**
   * Claim refund for a voided market.
   * Returns your original bet amount for the specified outcome.
   */
  const claimRefund = useCallback(async (outcomeId: number) => {
    reset()
    txToast.showPending('claimRefund', 'Claiming refund...')
    
    try {
      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimRefund',
        args: [marketId, BigInt(outcomeId)],
      })
      setIsConfirming(true)
      await waitForTransactionReceipt(config, { hash })
      setIsConfirming(false)
      txToast.showSuccess('claimRefund')
      invalidateQueries()
      options?.onSuccess?.()
    } catch (e) {
      setIsConfirming(false)
      txToast.showError('claimRefund', e)
      options?.onError?.(e)
    }
  }, [marketId, writeContractAsync, txToast, reset, invalidateQueries, options])
  
  /**
   * Approve USDC spending for the prediction market contract.
   */
  const approve = useCallback(async () => {
    reset()
    txToast.showPending('approve')
    
    try {
      const hash = await writeContractAsync({
        address: USDC.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PREDICTION_MARKET_ADDRESS, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
      })
      setIsConfirming(true)
      await waitForTransactionReceipt(config, { hash })
      setIsConfirming(false)
      txToast.showSuccess('approve')
      invalidateQueries()
      options?.onSuccess?.()
    } catch (e) {
      setIsConfirming(false)
      txToast.showError('approve', e)
      options?.onError?.(e)
    }
  }, [writeContractAsync, txToast, reset, invalidateQueries, options])
  
  return {
    bet,
    claimWinnings,
    claimRefund,
    approve,
    // State
    isLoading,
    reset,
  }
}
