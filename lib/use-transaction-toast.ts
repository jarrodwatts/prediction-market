"use client"

import { useCallback, useRef } from "react"
import { toast } from "sonner"
import { parseError, isUserRejection } from "@/lib/errors"

type TransactionType = 
  | "bet"
  | "claimWinnings"
  | "claimRefund"
  | "approve"

interface TransactionMessages {
  pending: { title: string; description: string }
  success: { title: string; description: string }
  error: { title: string; description: string }
}

const transactionMessages: Record<TransactionType, TransactionMessages> = {
  bet: {
    pending: { title: "Placing Bet", description: "Your bet is being confirmed..." },
    success: { title: "Bet Placed", description: "Your bet has been successfully placed" },
    error: { title: "Bet Failed", description: "Unable to place your bet" },
  },
  claimWinnings: {
    pending: { title: "Claiming Winnings", description: "Collecting your winnings..." },
    success: { title: "Winnings Claimed", description: "Your winnings have been transferred" },
    error: { title: "Claim Failed", description: "Unable to claim winnings" },
  },
  claimRefund: {
    pending: { title: "Claiming Refund", description: "Processing your refund..." },
    success: { title: "Refund Claimed", description: "Your funds have been returned" },
    error: { title: "Refund Failed", description: "Unable to claim refund" },
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
