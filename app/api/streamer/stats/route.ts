import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { abstractTestnet } from '@/lib/wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'

// Create public client for reading contract data
const publicClient = createPublicClient({
  chain: abstractTestnet,
  transport: http(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (!channelId) {
      return NextResponse.json(
        { error: 'channelId is required' },
        { status: 400 }
      )
    }

    // For V1 MVP, return placeholder stats
    // In production, these would be aggregated from contract events or indexed data
    // TODO: Implement proper stats tracking via indexer or event logs
    
    const stats = {
      totalMarkets: 0,
      totalVolume: 0,
      totalFees: 0,
      activeBettors: 0,
    }

    // Try to get actual market count from contract
    try {
      const marketIndex = await publicClient.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'marketIndex',
      })
      
      // Note: This counts ALL markets, not just this streamer's
      // In production, we'd filter by creator address
      stats.totalMarkets = Number(marketIndex)
    } catch (e) {
      // Contract might not be deployed yet
      console.log('Could not fetch market index:', e)
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('Error getting streamer stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

