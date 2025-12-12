"use client"

import { useCallback, useRef } from "react"
import { toast } from "sonner"
import { parseError, isUserRejection } from "@/lib/errors"

type TransactionType = 
  | "buy" 
  | "sell" 
  | "addLiquidity" 
  | "removeLiquidity" 
  | "claimFees" 
  | "claimLiquidity"
  | "claimWinnings"
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
  claimWinnings: {
    pending: { title: "Claiming Winnings", description: "Collecting your winnings..." },
    success: { title: "Winnings Claimed", description: "Your winnings have been transferred" },
    error: { title: "Claim Failed", description: "Unable to claim winnings" },
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

  const showError = useCallback((type?: TransactionType, error?: unknown) => {
    const txType = type || currentTypeRef.current
    if (!txType) return
    
    const messages = transactionMessages[txType]
    
    // Dismiss the loading toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
    }
    
    // Check if user cancelled - show a gentler message or skip toast entirely
    if (error && isUserRejection(error)) {
      toast.info("Transaction Cancelled", {
        description: "You cancelled the transaction.",
      })
      toastIdRef.current = null
      currentTypeRef.current = null
      return
    }
    
    // Parse the error for user-friendly messaging
    if (error) {
      const parsed = parseError(error, txType)
      toast.error(parsed.title, {
        description: parsed.suggestion 
          ? `${parsed.message} ${parsed.suggestion}`
          : parsed.message,
      })
    } else {
      // Fallback to default error message
      toast.error(messages.error.title, {
        description: messages.error.description,
      })
    }
    
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
  error: (title: string, descriptionOrError?: string | unknown) => {
    // If second argument is a string, use it directly
    if (typeof descriptionOrError === "string") {
      toast.error(title, { description: descriptionOrError })
      return
    }
    // If it's an error object, parse it
    if (descriptionOrError) {
      const parsed = parseError(descriptionOrError, title)
      toast.error(parsed.title, {
        description: parsed.suggestion 
          ? `${parsed.message} ${parsed.suggestion}`
          : parsed.message,
      })
    } else {
      toast.error(title)
    }
  },
  /** Show a user-friendly error toast from any error */
  fromError: (error: unknown, context?: string) => {
    if (isUserRejection(error)) {
      toast.info("Transaction Cancelled", {
        description: "You cancelled the transaction.",
      })
      return
    }
    const parsed = parseError(error, context)
    toast.error(parsed.title, {
      description: parsed.suggestion 
        ? `${parsed.message} ${parsed.suggestion}`
        : parsed.message,
    })
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

