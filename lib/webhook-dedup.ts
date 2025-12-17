/**
 * Distributed webhook deduplication using Vercel KV
 */

import { kvResilient } from './kv-resilient'
import { TTL } from './config'

const DEDUP_PREFIX = 'webhook:processed:'

/**
 * Mark a webhook as processed and check for duplicates.
 * Returns { isNew: true } if first time, { isNew: false } if duplicate.
 */
export async function markWebhookProcessed(
  messageId: string,
  timestamp?: string
): Promise<{ isNew: boolean; reason?: string }> {
  try {
    // Validate timestamp to prevent replay attacks
    if (timestamp) {
      const webhookTime = new Date(timestamp).getTime()
      const now = Date.now()
      const timeDiff = now - webhookTime

      // Reject webhooks older than 10 minutes (Twitch spec)
      if (timeDiff > TTL.WEBHOOK_TIMESTAMP_WINDOW_MS) {
        return {
          isNew: false,
          reason: `Webhook timestamp too old: ${timeDiff}ms ago`,
        }
      }

      // Reject webhooks from the future (clock skew tolerance: 1 minute)
      if (timeDiff < -60000) {
        return {
          isNew: false,
          reason: `Webhook timestamp in future: ${Math.abs(timeDiff)}ms ahead`,
        }
      }
    }

    // Atomic check-and-set operation
    // Returns 1 if key was set (new message), 0 if already exists (duplicate)
    const key = `${DEDUP_PREFIX}${messageId}`
    const wasSet = await kvResilient.set(key, Date.now(), {
      ex: TTL.WEBHOOK_DEDUP,
      nx: true, // Only set if not exists (atomic)
    })

    if (wasSet) {
      return { isNew: true }
    } else {
      return { isNew: false, reason: 'Duplicate message ID' }
    }
  } catch (error) {
    // If KV fails, log error but allow processing to continue
    // Better to risk duplicate processing than to drop webhooks
    console.error('Webhook deduplication check failed:', error)
    return { isNew: true, reason: 'Dedup check failed, allowing through' }
  }
}

