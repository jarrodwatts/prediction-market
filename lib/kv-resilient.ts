/**
 * Resilient KV operations with retry logic
 *
 * Provides fault-tolerant wrappers around Vercel KV operations with:
 * - Exponential backoff retry logic
 * - Configurable retry attempts
 * - Best-effort operations for non-critical data
 * - Structured logging for debugging
 */

import { kv } from '@vercel/kv'
import { logger } from './logger'

/**
 * Configuration for KV retries
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
}

/**
 * Execute KV operation with exponential backoff retry
 *
 * @param operation - The KV operation to execute
 * @param operationName - Name for logging (e.g., "get:prediction:123")
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = RETRY_CONFIG.maxRetries
): Promise<T> {
  let delay = RETRY_CONFIG.initialDelayMs
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (attempt < maxRetries - 1) {
        logger.warn('KV operation failed, retrying', {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        })

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay))

        // Exponential backoff
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs)
      }
    }
  }

  // All retries failed
  logger.error(`KV operation failed after ${maxRetries} retries`, lastError, {
    operation: operationName,
  })
  throw lastError
}

/**
 * Resilient KV operations with retry logic
 *
 * Drop-in replacement for direct kv operations with automatic retries.
 */
export const kvResilient = {
  /**
   * Get value from KV with retry
   */
  get: <T>(key: string) => withRetry(() => kv.get<T>(key), `get:${key}`),

  /**
   * Set value in KV with retry
   */
  set: (key: string, value: unknown, options?: { ex?: number; nx?: boolean }) => {
    // Build options object only with defined values to satisfy strict typing
    const kvOptions: Parameters<typeof kv.set>[2] = options?.ex
      ? options.nx
        ? { ex: options.ex, nx: options.nx }
        : { ex: options.ex }
      : options?.nx
        ? { nx: options.nx }
        : undefined
    return withRetry(() => kv.set(key, value, kvOptions), `set:${key}`)
  },

  /**
   * Delete keys from KV with retry
   */
  del: (...keys: string[]) => withRetry(() => kv.del(...keys), `del:${keys.join(',')}`),

  /**
   * Ping KV to check connection with retry
   */
  ping: () => withRetry(() => kv.ping(), 'ping'),

  /**
   * Scan keys in KV with retry
   */
  scan: (cursor: number, options?: { match?: string; count?: number }) =>
    withRetry(() => kv.scan(cursor, options ?? {}), 'scan'),

  /**
   * List push with retry
   */
  lpush: (key: string, ...values: unknown[]) =>
    withRetry(() => kv.lpush(key, ...values), `lpush:${key}`),

  /**
   * List range with retry
   */
  lrange: (key: string, start: number, stop: number) =>
    withRetry(() => kv.lrange(key, start, stop), `lrange:${key}`),

  /**
   * List trim with retry
   */
  ltrim: (key: string, start: number, stop: number) =>
    withRetry(() => kv.ltrim(key, start, stop), `ltrim:${key}`),

  /**
   * List remove with retry
   */
  lrem: (key: string, count: number, value: unknown) =>
    withRetry(() => kv.lrem(key, count, value), `lrem:${key}`),

  /**
   * Set expiry with retry
   */
  expire: (key: string, seconds: number) =>
    withRetry(() => kv.expire(key, seconds), `expire:${key}`),
}

/**
 * Best-effort KV operations (don't throw on failure)
 *
 * Use for non-critical operations like caching where failure is acceptable.
 * Returns fallback value if operation fails after retries.
 *
 * @param operation - The KV operation to execute
 * @param fallback - Value to return if operation fails
 * @param operationName - Name for logging
 * @returns Result of operation or fallback value
 *
 * @example
 * ```typescript
 * // Cache profile (nice-to-have, not critical)
 * await kvBestEffort(
 *   () => storeWalletStreamerProfile(...),
 *   undefined,
 *   'cache-profile'
 * )
 * ```
 */
export async function kvBestEffort<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<T> {
  try {
    return await withRetry(operation, operationName)
  } catch (error) {
    logger.warn('KV best-effort operation failed, using fallback', {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}
