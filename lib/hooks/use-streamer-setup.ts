'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export type SubscriptionStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; count: number; total: number }
  | { state: 'error'; message: string }

interface UseStreamerSetupOptions {
  channelId: string | null
  walletAddress: string | null
}

interface UseStreamerSetupReturn {
  subscriptionStatus: SubscriptionStatus
  saveAndSubscribe: () => Promise<void>
  retry: () => void
}

/**
 * Hook for streamer setup logic - saves wallet and subscribes to EventSub
 *
 * Shared between /streamer page and /ext-config extension page
 */
export function useStreamerSetup({
  channelId,
  walletAddress,
}: UseStreamerSetupOptions): UseStreamerSetupReturn {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({ state: 'idle' })

  // Track if we've already saved for this wallet+channel combo
  const savedRef = useRef<string | null>(null)

  const saveAndSubscribe = useCallback(async () => {
    if (!walletAddress || !channelId) return

    // Create a unique key for this wallet+channel combo
    const saveKey = `${walletAddress}-${channelId}`

    // Skip if we've already saved for this combination
    if (savedRef.current === saveKey) return
    savedRef.current = saveKey

    try {
      // Save wallet address
      await fetch('/api/streamer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          walletAddress,
        }),
      })

      // Register EventSub subscriptions
      setSubscriptionStatus({ state: 'loading' })
      const subRes = await fetch('/api/twitch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })

      const subData = await subRes.json()
      if (subRes.ok && subData.success) {
        const successCount = subData.results?.filter((r: { success: boolean }) => r.success).length ?? 0
        const totalCount = subData.results?.length ?? 4
        setSubscriptionStatus({ state: 'success', count: successCount, total: totalCount })
      } else {
        setSubscriptionStatus({
          state: 'error',
          message: subData.error || subData.message || 'Failed to subscribe to Twitch events.',
        })
      }
    } catch {
      setSubscriptionStatus({ state: 'error', message: 'Failed to complete setup. Please try again.' })
      // Reset the saved ref so user can retry
      savedRef.current = null
    }
  }, [walletAddress, channelId])

  const retry = useCallback(() => {
    savedRef.current = null
    setSubscriptionStatus({ state: 'idle' })
    saveAndSubscribe()
  }, [saveAndSubscribe])

  // Auto-save when both wallet and channel are available
  useEffect(() => {
    if (walletAddress && channelId) {
      saveAndSubscribe()
    }
  }, [walletAddress, channelId, saveAndSubscribe])

  return {
    subscriptionStatus,
    saveAndSubscribe,
    retry,
  }
}
