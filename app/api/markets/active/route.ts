import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { getActivePrediction, getPredictionData } from '@/lib/kv'
import { abstractTestnet } from '@/lib/wagmi'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { validateSearchParams } from '@/lib/middleware/validation'
import { marketActiveSchema } from '@/lib/validation/schemas'
import { getCorsHeaders } from '@/lib/middleware/cors'
import { checkRateLimit } from '@/lib/rate-limit'
import { getPrices } from '@/lib/market-math'

// Create public client for reading contract data
const publicClient = createPublicClient({
  chain: abstractTestnet,
  transport: http(),
})

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = {
    ...getCorsHeaders(origin, 'GET, OPTIONS'),
    'Cache-Control': 'public, max-age=86400', // Cache preflight for 24h
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = {
    ...getCorsHeaders(origin, 'GET, OPTIONS'),
    'Cache-Control': 'public, max-age=1, stale-while-revalidate=2', // Short cache for responsiveness
  }

  // Rate limit check BEFORE processing request
  const rateLimitResponse = await checkRateLimit(request, 'public')
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Validate query parameters
    const { data: params, error: validationError } = validateSearchParams(
      request,
      marketActiveSchema
    )
    if (validationError) {
      return NextResponse.json(
        validationError.body,
        { status: validationError.status, headers: corsHeaders }
      )
    }

    const { channelId } = params

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
      const defaultPrices = predictionData.outcomes.map(() => 1 / predictionData.outcomes.length)
      return NextResponse.json({
        id: null,
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices: defaultPrices, // Equal probability before any bets
        pools: predictionData.outcomes.map(() => '0'),
        state: 'pending', // Special state for UI
        closesAt: predictionData.locksAt,
        totalPot: '0',
        resolvedOutcome: null,
        isVoided: false,
        protocolFeeBps: 150, // Default 1.5%
        creatorFeeBps: 150, // Default 1.5%
      }, { headers: corsHeaders })
    }

    // Get market data from contract - fetch all data in parallel
    try {
      const marketId = predictionData.marketId! // Non-null (checked above)
      
      // Batch all contract reads in parallel
      const [marketData, pools] = await Promise.all([
        publicClient.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'getMarketData',
          args: [marketId],
        }),
        publicClient.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'getMarketPools',
          args: [marketId],
        }).catch(() => [] as readonly bigint[]),
      ])

      // getMarketData returns: state, closesAt, totalPot, outcomeCount, resolvedOutcome, creator, protocolFeeBps, creatorFeeBps
      const [state, closesAt, totalPot, , resolvedOutcome, , protocolFeeBps, creatorFeeBps] = marketData as [
        number, bigint, bigint, bigint, bigint, string, number, number
      ]

      // Calculate prices from pool ratios
      const prices = pools.length > 0 ? getPrices(pools) : predictionData.outcomes.map(() => 1 / predictionData.outcomes.length)

      // Map contract state to string: 0=Open, 1=Locked, 2=Resolved, 3=Voided
      const stateMap = ['open', 'locked', 'resolved', 'voided']
      let marketState = stateMap[state] || 'unknown'
      
      // Use KV state for faster UI updates (updated immediately when Twitch locks/resolves)
      if (predictionData.state === 'locked' && marketState === 'open') {
        marketState = 'locked'
      } else if (predictionData.state === 'resolved') {
        marketState = 'resolved'
      }

      // Check if market is voided (state === 3)
      const isVoided = state === 3

      return NextResponse.json({
        id: marketId.toString(),
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices,
        pools: pools.map(p => p.toString()),
        state: marketState,
        closesAt: Number(closesAt),
        totalPot: totalPot.toString(),
        resolvedOutcome: marketState === 'resolved' && !isVoided ? Number(resolvedOutcome) : null,
        isVoided,
        protocolFeeBps,
        creatorFeeBps,
      }, { headers: corsHeaders })
    } catch (contractError) {
      console.error('Error reading contract:', contractError)
      
      // Return prediction data without contract info (fast fallback)
      const fallbackState = predictionData.state === 'resolved' ? 'resolved' : 
                            predictionData.state === 'locked' ? 'locked' : 'open'
      const defaultPrices = predictionData.outcomes.map(() => 1 / predictionData.outcomes.length)
      
      return NextResponse.json({
        id: predictionData.marketId?.toString() ?? null,
        twitchPredictionId: activePredictionId,
        question: predictionData.question,
        outcomes: predictionData.outcomes,
        prices: defaultPrices,
        pools: predictionData.outcomes.map(() => '0'),
        state: fallbackState,
        closesAt: predictionData.locksAt,
        totalPot: '0',
        resolvedOutcome: null,
        isVoided: false, // Can't determine without contract data
        protocolFeeBps: 150,
        creatorFeeBps: 150,
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
