'use client'

/**
 * Market Action Hooks
 */

import { useCallback, useRef, useEffect } from 'react'
import { useWriteContract, useWaitForTransactionReceipt, useSendCalls, useCallsStatus, useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { encodeFunctionData } from 'viem'
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
  
  const { writeContract, data: hash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  
  // Batched calls for approve + action (AGW feature)
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
  
  // Track current transaction type and prevent double handling
  const txTypeRef = useRef<TxType | null>(null)
  const handledHashRef = useRef<string | null>(null)
  const handledBatchIdRef = useRef<string | null>(null)
  const handledErrorRef = useRef<Error | null>(null)
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
  
  // Handle single transaction success
  useEffect(() => {
    if (isSuccess && hash && hash !== handledHashRef.current) {
      handledHashRef.current = hash
      
      if (txTypeRef.current) {
        txToast.showSuccess(txTypeRef.current)
        txTypeRef.current = null
      }
      
      invalidateQueries()
      options?.onSuccess?.()
    }
  }, [isSuccess, hash, txToast, invalidateQueries, options])
  
  // Handle batch transaction success
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
  
  // Handle write errors
  useEffect(() => {
    if (writeError && writeError !== handledErrorRef.current) {
      handledErrorRef.current = writeError
      if (txTypeRef.current) {
        txToast.showError(txTypeRef.current, writeError)
        txTypeRef.current = null
      }
      options?.onError?.(writeError)
    }
  }, [writeError, txToast, options])
  
  // Handle batch errors
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
  
  // Handle batch failure from status
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
    handledHashRef.current = null
    handledBatchIdRef.current = null
    handledErrorRef.current = null
    handledBatchErrorRef.current = null
    handledBatchFailureRef.current = null
    resetWrite()
    resetBatch()
  }, [resetWrite, resetBatch])
  
  /**
   * Place a bet on an outcome (final, cannot be cancelled)
   */
  const bet = useCallback((
    outcomeId: number,
    amount: string,
    needsApproval: boolean,
    outcomeTitle?: string
  ) => {
    reset()
    txTypeRef.current = 'bet'
    txToast.showPending('bet', `Betting $${amount} on ${outcomeTitle ?? `Outcome ${outcomeId + 1}`}`)
    
    try {
      const amountBigInt = parseUSDC(amount)
      
      if (needsApproval) {
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
        writeContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'bet',
          args: [marketId, BigInt(outcomeId), amountBigInt],
        })
      }
    } catch (e) {
      txToast.showError('bet', e)
      txTypeRef.current = null
    }
  }, [marketId, writeContract, sendCalls, txToast, reset])
  
  /**
   * Claim winnings after market resolution.
   * Only callable if you bet on the winning outcome.
   */
  const claimWinnings = useCallback(() => {
    reset()
    txTypeRef.current = 'claimWinnings'
    txToast.showPending('claimWinnings')
    
    try {
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimWinnings',
        args: [marketId],
      })
    } catch (e) {
      txToast.showError('claimWinnings', e)
      txTypeRef.current = null
    }
  }, [marketId, writeContract, txToast, reset])
  
  /**
   * Claim refund for a voided market.
   * Returns your original bet amount for the specified outcome.
   */
  const claimRefund = useCallback((outcomeId: number) => {
    reset()
    txTypeRef.current = 'claimRefund'
    txToast.showPending('claimRefund', 'Claiming refund...')
    
    try {
      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'claimRefund',
        args: [marketId, BigInt(outcomeId)],
      })
    } catch (e) {
      txToast.showError('claimRefund', e)
      txTypeRef.current = null
    }
  }, [marketId, writeContract, txToast, reset])
  
  /**
   * Approve USDC spending for the prediction market contract.
   */
  const approve = useCallback(() => {
    reset()
    txTypeRef.current = 'approve'
    txToast.showPending('approve')
    
    try {
      writeContract({
        address: USDC.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PREDICTION_MARKET_ADDRESS, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
      })
    } catch (e) {
      txToast.showError('approve', e)
      txTypeRef.current = null
    }
  }, [writeContract, txToast, reset])
  
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
