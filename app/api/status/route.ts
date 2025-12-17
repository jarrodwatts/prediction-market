/**
 * System status endpoint (admin only)
 *
 * Provides detailed system status including:
 * - Service health
 * - Configuration status
 * - Recent operations
 * - System metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/auth'
import { kv } from '@vercel/kv'
import { createPublicClient, http } from 'viem'
import { activeChain } from '@/lib/wagmi'
import { BLOCKCHAIN, NETWORK, MARKET } from '@/lib/config'
import { PREDICTION_MARKET_ADDRESS } from '@/lib/contract'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

interface SystemStatus {
  timestamp: string
  environment: {
    network: 'mainnet' | 'testnet'
    is_production: boolean
    chain_id: number
    chain_name: string
  }
  configuration: {
    market_address: string
    usdc_address: string
    protocol_fee_bps: number
    creator_fee_bps: number
  }
  health: {
    kv: { status: 'ok' | 'error'; error?: string }
    rpc: { status: 'ok' | 'error'; block_number?: number; error?: string }
    backend_wallet: { status: 'ok' | 'error'; balance?: string; error?: string }
  }
  metrics?: {
    total_markets?: number
  }
}

/**
 * GET /api/status
 *
 * Returns detailed system status (admin only)
 */
export async function GET(request: NextRequest) {
  // Require admin authentication
  const { error: authError } = await requireAdmin(request)
  if (authError) return authError

  const status: SystemStatus = {
    timestamp: new Date().toISOString(),
    environment: {
      network: NETWORK.IS_MAINNET ? 'mainnet' : 'testnet',
      is_production: NETWORK.IS_PRODUCTION,
      chain_id: activeChain.id,
      chain_name: activeChain.name,
    },
    configuration: {
      market_address: PREDICTION_MARKET_ADDRESS,
      usdc_address: BLOCKCHAIN.USDC_ADDRESS,
      protocol_fee_bps: MARKET.FEES_BPS.PROTOCOL,
      creator_fee_bps: MARKET.FEES_BPS.CREATOR,
    },
    health: {
      kv: { status: 'ok' },
      rpc: { status: 'ok' },
      backend_wallet: { status: 'ok' },
    },
  }

  // Check KV health
  try {
    await kv.ping()
  } catch (error) {
    status.health.kv.status = 'error'
    status.health.kv.error = error instanceof Error ? error.message : 'Unknown error'
  }

  // Check RPC and get blockchain metrics
  try {
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(activeChain.rpcUrls.default.http[0], {
        timeout: 10_000,
      }),
    })

    const blockNumber = await publicClient.getBlockNumber()
    status.health.rpc.block_number = Number(blockNumber)

    // Get total markets count
    try {
      const marketIndex = await publicClient.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: [
          {
            type: 'function',
            name: 'marketIndex',
            inputs: [],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
          },
        ] as const,
        functionName: 'marketIndex',
      })

      status.metrics = {
        total_markets: Number(marketIndex),
      }
    } catch {
      // Non-critical - just skip metrics
    }

    // Check backend wallet balance
    try {
      const { privateKeyToAccount } = await import('viem/accounts')
      const privateKey = BLOCKCHAIN.BACKEND_WALLET_PRIVATE_KEY
      const account = privateKeyToAccount(privateKey as `0x${string}`)

      const balance = await publicClient.readContract({
        address: BLOCKCHAIN.USDC_ADDRESS,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ type: 'uint256' }],
            stateMutability: 'view',
          },
        ] as const,
        functionName: 'balanceOf',
        args: [account.address],
      })

      status.health.backend_wallet.balance = balance.toString()
    } catch (error) {
      status.health.backend_wallet.status = 'error'
      status.health.backend_wallet.error =
        error instanceof Error ? error.message : 'Unknown error'
    }
  } catch (error) {
    status.health.rpc.status = 'error'
    status.health.rpc.error = error instanceof Error ? error.message : 'Unknown error'
  }

  return NextResponse.json(status, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
