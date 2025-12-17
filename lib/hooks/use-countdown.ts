'use client'

import { useState, useEffect } from 'react'

/**
 * Returns the number of seconds remaining until the target timestamp.
 */
export function useCountdown(targetTimestamp: number | null): number {
  const [remaining, setRemaining] = useState(() => {
    if (!targetTimestamp) return 0
    return Math.max(0, targetTimestamp - Math.floor(Date.now() / 1_000))
  })

  useEffect(() => {
    if (!targetTimestamp) {
      setRemaining(0)
      return
    }

    const update = () => {
      setRemaining(Math.max(0, targetTimestamp - Math.floor(Date.now() / 1_000)))
    }

    update()
    const interval = setInterval(update, 1_000)
    return () => clearInterval(interval)
  }, [targetTimestamp])

  return remaining
}

/**
 * Format countdown seconds into a string like "5:23" or "1:30:45"
 */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  
  if (s >= 60 * 60) {
    const hours = Math.floor(s / 3_600)
    const minutes = Math.floor((s % 3_600) / 60)
    const seconds = s % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

