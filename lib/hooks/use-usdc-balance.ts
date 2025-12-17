'use client'

import { useReadContract, useAccount } from 'wagmi'
import { USDC, ERC20_ABI, formatUSDC } from '@/lib/tokens'
import { PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { INTERVALS } from '@/lib/constants'

interface UseUsdcBalanceReturn {
  balance: bigint | undefined
  allowance: bigint | undefined
  balanceFormatted: number
  allowanceFormatted: number
  isLoading: boolean
  hasSufficientAllowance: (amount: bigint) => boolean
}

export function useUsdcBalance(options?: {
  refetchInterval?: number
}): UseUsdcBalanceReturn {
  const { address, isConnected } = useAccount()
  const refetchInterval = options?.refetchInterval ?? INTERVALS.BALANCE_REFRESH

  const { data: balance, isLoading: isBalanceLoading } = useReadContract({
    address: USDC.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval,
    },
  })

  const { data: allowance, isLoading: isAllowanceLoading } = useReadContract({
    address: USDC.address,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, PREDICTION_MARKET_ADDRESS] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval,
    },
  })

  const balanceFormatted = balance !== undefined ? parseFloat(formatUSDC(balance)) : 0
  const allowanceFormatted = allowance !== undefined ? parseFloat(formatUSDC(allowance)) : 0

  const hasSufficientAllowance = (amount: bigint): boolean => {
    if (allowance === undefined) return false
    return allowance >= amount
  }

  return {
    balance,
    allowance,
    balanceFormatted,
    allowanceFormatted,
    isLoading: isBalanceLoading || isAllowanceLoading,
    hasSufficientAllowance,
  }
}

