import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { getActivePrediction, getPredictionData } from '@/lib/kv'
import { abstractTestnet } from '@/lib/wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'

// Create public client for reading contract data
const publicClient = createPublicClient({
  chain: abstractTestnet,
  transport: http(),
})

// CORS headers for Twitch extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=1, stale-while-revalidate=2', // Short cache for responsiveness
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (!channelId) {
      return NextResponse.json(
        { error: 'channelId is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Get active prediction for this channel
    const activePredictionId = await getActivePrediction(channelId)
    
    if (!activePredictionId) {
      return NextResponse.json(
        { error: 'No active prediction' },
        { status: 404, headers: corsHeaders }
      )
    }

    // Get prediction data
    const predictionData = await getPredictionData(activePredictionId)
    
    if (!predictionData) {
      return NextResponse.json(
        { error: 'Prediction data not found' },
        { status: 404, headers: corsHeaders }
      )
    }

    // If market is still being created on-chain (pending), return immediately with KV data
    if (!predictionData.marketId) {
      return NextResponse.json({
        id: null,
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices: predictionData.outcomes.map(() => 0.5), // Default 50/50
        state: 'pending', // Special state for UI
        closesAt: predictionData.locksAt,
        liquidity: '0',
        balance: '0',
        resolvedOutcome: null,
      }, { headers: corsHeaders })
    }

    // Get market data from contract - fetch all data in parallel
    try {
      const marketId = predictionData.marketId! // Non-null (checked above)
      
      // Batch all contract reads in parallel
      const [marketData, ...priceResults] = await Promise.all([
        publicClient.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'getMarketData',
          args: [marketId],
        }),
        // Fetch prices in parallel
        ...predictionData.outcomes.map((_, i) =>
          publicClient.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketOutcomePrice',
            args: [marketId, BigInt(i)],
          }).catch(() => BigInt(5e17)) // Default to 50% on error
        ),
      ])

      const [state, closesAt, liquidity, balance, sharesAvailable, resolvedOutcomeId] = marketData as [number, bigint, bigint, bigint, bigint, bigint]

      // Convert prices from 18 decimals to percentage
      const prices = priceResults.map(p => Number(p as bigint) / 1e18)

      // Map contract state to string
      const stateMap = ['open', 'closed', 'resolved']
      let marketState = stateMap[state] || 'unknown'
      
      // Use KV state for faster UI updates (updated immediately when Twitch locks/resolves)
      if (predictionData.state === 'locked' && marketState === 'open') {
        marketState = 'closed'
      } else if (predictionData.state === 'resolved') {
        marketState = 'resolved'
      }

      return NextResponse.json({
        id: marketId.toString(),
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices,
        state: marketState,
        closesAt: Number(closesAt),
        liquidity: liquidity.toString(),
        balance: balance.toString(),
        resolvedOutcome: marketState === 'resolved' ? Number(resolvedOutcomeId) : null,
      }, { headers: corsHeaders })
    } catch (contractError) {
      console.error('Error reading contract:', contractError)
      
      // Return prediction data without contract info (fast fallback)
      return NextResponse.json({
        id: predictionData.marketId?.toString() ?? null,
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices: predictionData.outcomes.map(() => 0.5),
        state: 'open',
        closesAt: predictionData.locksAt,
        liquidity: '0',
        balance: '0',
      }, { headers: corsHeaders })
    }
  } catch (error) {
    console.error('Error getting active market:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

