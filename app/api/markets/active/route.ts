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

    // Get market data from contract
    try {
      const marketData = await publicClient.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'getMarketData',
        args: [predictionData.marketId],
      })

      const [state, closesAt, liquidity, balance, sharesAvailable, resolvedOutcomeId] = marketData as [number, bigint, bigint, bigint, bigint, bigint]

      // Get prices for each outcome
      const prices: number[] = []
      for (let i = 0; i < predictionData.outcomes.length; i++) {
        try {
          const price = await publicClient.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketOutcomePrice',
            args: [predictionData.marketId, BigInt(i)],
          })
          // Price is in 18 decimals, convert to percentage
          prices.push(Number(price) / 1e18)
        } catch {
          prices.push(0.5) // Default to 50% if price unavailable
        }
      }

      // Map contract state to string
      const stateMap = ['open', 'closed', 'resolved']
      const marketState = stateMap[state] || 'unknown'

      return NextResponse.json({
        id: predictionData.marketId.toString(),
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices,
        state: marketState,
        closesAt: Number(closesAt),
        liquidity: liquidity.toString(),
        balance: balance.toString(),
      }, { headers: corsHeaders })
    } catch (contractError) {
      console.error('Error reading contract:', contractError)
      
      // Return prediction data without contract info
      return NextResponse.json({
        id: predictionData.marketId.toString(),
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

