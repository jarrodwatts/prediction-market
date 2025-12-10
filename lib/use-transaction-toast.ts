"use client"

import { useCallback, useRef } from "react"
import { toast } from "sonner"

type TransactionType = 
  | "buy" 
  | "sell" 
  | "addLiquidity" 
  | "removeLiquidity" 
  | "claimFees" 
  | "claimLiquidity"
  | "approve"

interface TransactionMessages {
  pending: { title: string; description: string }
  success: { title: string; description: string }
  error: { title: string; description: string }
}

const transactionMessages: Record<TransactionType, TransactionMessages> = {
  buy: {
    pending: { title: "Processing Purchase", description: "Your buy order is being confirmed..." },
    success: { title: "Purchase Complete", description: "You've successfully bought shares" },
    error: { title: "Purchase Failed", description: "Unable to complete your buy order" },
  },
  sell: {
    pending: { title: "Processing Sale", description: "Your sell order is being confirmed..." },
    success: { title: "Sale Complete", description: "You've successfully sold shares" },
    error: { title: "Sale Failed", description: "Unable to complete your sell order" },
  },
  addLiquidity: {
    pending: { title: "Adding Liquidity", description: "Your deposit is being processed..." },
    success: { title: "Liquidity Added", description: "You're now earning fees as an LP" },
    error: { title: "Deposit Failed", description: "Unable to add liquidity" },
  },
  removeLiquidity: {
    pending: { title: "Withdrawing Liquidity", description: "Your withdrawal is being processed..." },
    success: { title: "Liquidity Withdrawn", description: "Your funds have been returned" },
    error: { title: "Withdrawal Failed", description: "Unable to remove liquidity" },
  },
  claimFees: {
    pending: { title: "Claiming Fees", description: "Collecting your earned fees..." },
    success: { title: "Fees Claimed", description: "Your earnings have been transferred" },
    error: { title: "Claim Failed", description: "Unable to claim fees" },
  },
  claimLiquidity: {
    pending: { title: "Claiming Liquidity", description: "Collecting your liquidity..." },
    success: { title: "Liquidity Claimed", description: "Your liquidity has been returned" },
    error: { title: "Claim Failed", description: "Unable to claim liquidity" },
  },
  approve: {
    pending: { title: "Approving USDC", description: "Granting spend permission..." },
    success: { title: "Approval Complete", description: "USDC spending approved" },
    error: { title: "Approval Failed", description: "Unable to approve USDC" },
  },
}

export function useTransactionToast() {
  const toastIdRef = useRef<string | number | null>(null)
  const currentTypeRef = useRef<TransactionType | null>(null)

  const showPending = useCallback((type: TransactionType, customDescription?: string) => {
    const messages = transactionMessages[type]
    currentTypeRef.current = type
    
    // Dismiss any existing toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
    }
    
    toastIdRef.current = toast.loading(messages.pending.title, {
      description: customDescription || messages.pending.description,
    })
    
    return toastIdRef.current
  }, [])

  const showSuccess = useCallback((type?: TransactionType, customDescription?: string) => {
    const txType = type || currentTypeRef.current
    if (!txType) return
    
    const messages = transactionMessages[txType]
    
    // Dismiss the loading toast and show success
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
    }
    
    toast.success(messages.success.title, {
      description: customDescription || messages.success.description,
    })
    
    toastIdRef.current = null
    currentTypeRef.current = null
  }, [])

  const showError = useCallback((type?: TransactionType, customDescription?: string) => {
    const txType = type || currentTypeRef.current
    if (!txType) return
    
    const messages = transactionMessages[txType]
    
    // Dismiss the loading toast and show error
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
    }
    
    // Clean up error message for display
    let description = customDescription || messages.error.description
    if (description && description.length > 150) {
      // Truncate long error messages
      const shortened = description.substring(0, 150)
      const lastSpace = shortened.lastIndexOf(" ")
      description = shortened.substring(0, lastSpace > 100 ? lastSpace : 150) + "..."
    }
    
    toast.error(messages.error.title, {
      description,
    })
    
    toastIdRef.current = null
    currentTypeRef.current = null
  }, [])

  const dismiss = useCallback(() => {
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }
    currentTypeRef.current = null
  }, [])

  return {
    showPending,
    showSuccess,
    showError,
    dismiss,
  }
}

// Standalone toast functions for simple use cases
export const txToast = {
  success: (title: string, description?: string) => {
    toast.success(title, { description })
  },
  error: (title: string, description?: string) => {
    toast.error(title, { description })
  },
  info: (title: string, description?: string) => {
    toast.info(title, { description })
  },
  warning: (title: string, description?: string) => {
    toast.warning(title, { description })
  },
  loading: (title: string, description?: string) => {
    return toast.loading(title, { description })
  },
  dismiss: (id: string | number) => {
    toast.dismiss(id)
  },
}

