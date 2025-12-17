/**
 * Idempotency helpers for preventing duplicate operations using Vercel KV
 */

import { kvResilient } from './kv-resilient'
import { TTL } from './config'

const OPERATION_PREFIX = 'operation:'

export type OperationStatus = 'pending' | 'completed' | 'failed'

export interface OperationState {
  status: OperationStatus
  timestamp: number
  result?: unknown
  error?: string
}

export async function checkOperation(
  operationKey: string
): Promise<OperationState | null> {
  try {
    const key = `${OPERATION_PREFIX}${operationKey}`
    return await kvResilient.get<OperationState>(key)
  } catch {
    return null
  }
}

export async function startOperation(operationKey: string): Promise<boolean> {
  try {
    const key = `${OPERATION_PREFIX}${operationKey}`
    const state: OperationState = {
      status: 'pending',
      timestamp: Date.now(),
    }
    const wasSet = await kvResilient.set(key, state, {
      ex: TTL.OPERATION,
      nx: true,
    })
    return wasSet !== null
  } catch {
    return true
  }
}

export async function completeOperation(
  operationKey: string,
  result: unknown
): Promise<void> {
  try {
    const key = `${OPERATION_PREFIX}${operationKey}`
    const state: OperationState = {
      status: 'completed',
      timestamp: Date.now(),
      result,
    }
    await kvResilient.set(key, state, { ex: TTL.OPERATION })
  } catch {
    // Non-critical
  }
}

export async function failOperation(
  operationKey: string,
  error: string
): Promise<void> {
  try {
    const key = `${OPERATION_PREFIX}${operationKey}`
    const state: OperationState = {
      status: 'failed',
      timestamp: Date.now(),
      error,
    }
    await kvResilient.set(key, state, { ex: TTL.OPERATION })
  } catch {
    // Non-critical
  }
}

/**
 * Execute an operation with idempotency guarantees.
 * Returns cached result if operation already completed.
 */
export async function withIdempotency<T>(
  operationKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const existing = await checkOperation(operationKey)

  if (existing) {
    if (existing.status === 'completed') {
      return existing.result as T
    }
    if (existing.status === 'pending') {
      throw new Error(
        `Operation ${operationKey} already in progress (started ${Date.now() - existing.timestamp}ms ago)`
      )
    }
  }

  const started = await startOperation(operationKey)
  if (!started) {
    throw new Error(`Failed to start operation ${operationKey} - already in progress`)
  }

  try {
    const result = await operation()
    await completeOperation(operationKey, result)
    return result
  } catch (error) {
    await failOperation(operationKey, error instanceof Error ? error.message : String(error))
    throw error
  }
}
