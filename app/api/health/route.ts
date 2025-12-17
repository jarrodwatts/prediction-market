/**
 * Health check endpoint
 *
 * Used by monitoring systems and load balancers to verify service health.
 * Returns 200 OK if all critical systems are operational.
 *
 * Checks:
 * - Vercel KV connectivity
 * - RPC connectivity (blockchain)
 * - Basic service functionality
 */

import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { activeChain } from '@/lib/wagmi'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: {
    kv: { status: 'ok' | 'error'; latency_ms?: number; error?: string }
    rpc: { status: 'ok' | 'error'; latency_ms?: number; block_number?: number; error?: string }
  }
  version?: string
}

/**
 * GET /api/health
 *
 * Returns service health status
 */
export async function GET() {
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      kv: { status: 'ok' },
      rpc: { status: 'ok' },
    },
  }

  // Check 1: Vercel KV connectivity
  try {
    const kvStartTime = Date.now()
    const testKey = 'health:check'
    await kv.set(testKey, Date.now(), { ex: 10 }) // 10 second TTL
    await kv.get(testKey)
    result.checks.kv.latency_ms = Date.now() - kvStartTime
  } catch (error) {
    result.checks.kv.status = 'error'
    result.checks.kv.error = error instanceof Error ? error.message : 'Unknown error'
    result.status = 'unhealthy'
  }

  // Check 2: RPC connectivity
  try {
    const rpcStartTime = Date.now()
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(activeChain.rpcUrls.default.http[0], {
        timeout: 5_000, // 5 second timeout for health check
      }),
    })

    const blockNumber = await publicClient.getBlockNumber()
    result.checks.rpc.latency_ms = Date.now() - rpcStartTime
    result.checks.rpc.block_number = Number(blockNumber)
  } catch (error) {
    result.checks.rpc.status = 'error'
    result.checks.rpc.error = error instanceof Error ? error.message : 'Unknown error'
    result.status = 'degraded' // RPC failure is degraded, not unhealthy (can still serve cached data)
  }

  // Determine overall status
  const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
