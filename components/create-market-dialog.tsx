"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useState, useCallback, useMemo } from "react"
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi"
import { useQueryClient } from "@tanstack/react-query"
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract"
import { USDC } from "@/lib/tokens"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { parseError } from "@/lib/errors"
import { queryKeys } from "@/lib/query-keys"
import { z } from "zod"

// Form validation schema
const createMarketSchema = z.object({
  question: z
    .string()
    .min(10, "Question must be at least 10 characters")
    .max(200, "Question must be at most 200 characters"),
  image: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  duration: z
    .string()
    .regex(/^\d+$/, "Duration must be a positive number")
    .refine((val) => parseInt(val) >= 1 && parseInt(val) <= 365, "Duration must be between 1 and 365 days"),
})

type FormData = z.infer<typeof createMarketSchema>
type FieldErrors = Partial<Record<keyof FormData, string>>

interface CreateMarketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateMarketDialog({ open, onOpenChange }: CreateMarketDialogProps) {
  const [question, setQuestion] = useState("")
  const [image, setImage] = useState("")
  const [duration, setDuration] = useState("7")
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const { isConnected, address } = useAccount()
  const queryClient = useQueryClient()

  const { writeContract, isPending: isWritePending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: undefined, // We handle success via onSuccess callback
  })

  // Derive error message from writeError - no useEffect needed
  const error = useMemo(() => {
    if (writeError) {
      const parsed = parseError(writeError, "createMarket")
      return parsed.suggestion 
        ? `${parsed.message} ${parsed.suggestion}`
        : parsed.message
    }
    return null
  }, [writeError])

  // Reset form state
  const resetForm = useCallback(() => {
    setQuestion("")
    setImage("")
    setDuration("7")
    setFieldErrors({})
    reset()
  }, [reset])

  // Handle dialog close - reset state
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      resetForm()
    }
    onOpenChange(isOpen)
  }, [onOpenChange, resetForm])

  // Validate form and return errors
  const validateForm = useCallback((): { valid: true; data: FormData } | { valid: false; errors: FieldErrors } => {
    const result = createMarketSchema.safeParse({
      question,
      image: image || undefined,
      duration,
    })

    if (!result.success) {
      const errors: FieldErrors = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormData
        if (!errors[field]) {
          errors[field] = issue.message
        }
      }
      return { valid: false, errors }
    }

    return { valid: true, data: result.data }
  }, [question, image, duration])

  // Real-time validation for better UX
  const currentErrors = useMemo(() => {
    const validation = validateForm()
    return validation.valid ? {} : validation.errors
  }, [validateForm])

  const handleCreate = useCallback(() => {
    setFieldErrors({})

    if (!isConnected || !address) {
      return // Will show via UI state
    }

    const validation = validateForm()
    if (!validation.valid) {
      setFieldErrors(validation.errors)
      return
    }

    try {
      const closesAt = BigInt(Math.floor(Date.now() / 1_000) + (Number(validation.data.duration) * 24 * 60 * 60))
      
      const params = {
        question: validation.data.question,
        image: validation.data.image || "",
        outcomeCount: 2n,
        closesAt,
        token: USDC.address,
        protocolFeeBps: 100,
        creatorFeeBps: 100,
        creator: address,
      }

      writeContract(
        {
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'createMarket',
          args: [params],
        },
        {
          onSuccess: () => {
            // Invalidate markets query to refresh the list
            queryClient.invalidateQueries({ queryKey: queryKeys.markets.list() })
            // Reset form and close dialog
            handleOpenChange(false)
          },
        }
      )
    } catch (err: unknown) {
      console.error("Error creating market:", err)
    }
  }, [isConnected, address, validateForm, writeContract, queryClient, handleOpenChange])

  const isLoading = isWritePending || isConfirming
  const hasFieldErrors = Object.keys(currentErrors).length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Market</DialogTitle>
          <DialogDescription>
            Deploy a new binary (Yes/No) prediction market. Bets use USDC.
          </DialogDescription>
        </DialogHeader>
        
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              placeholder="Will ETH hit $10k?"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value)
                if (fieldErrors.question) setFieldErrors(prev => ({ ...prev, question: undefined }))
              }}
              aria-invalid={!!fieldErrors.question}
            />
            {fieldErrors.question && (
              <p className="text-xs text-destructive">{fieldErrors.question}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image">Image URL (optional)</Label>
            <Input
              id="image"
              placeholder="https://..."
              value={image}
              onChange={(e) => {
                setImage(e.target.value)
                if (fieldErrors.image) setFieldErrors(prev => ({ ...prev, image: undefined }))
              }}
              aria-invalid={!!fieldErrors.image}
            />
            {fieldErrors.image && (
              <p className="text-xs text-destructive">{fieldErrors.image}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="duration">Duration (Days)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              max="365"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value)
                if (fieldErrors.duration) setFieldErrors(prev => ({ ...prev, duration: undefined }))
              }}
              aria-invalid={!!fieldErrors.duration}
            />
            {fieldErrors.duration && (
              <p className="text-xs text-destructive">{fieldErrors.duration}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button 
            onClick={handleCreate} 
            disabled={isLoading || !question || hasFieldErrors || !isConnected}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isConfirming ? "Confirming..." : isWritePending ? "Check Wallet..." : "Create Market"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
