import { kvResilient } from './kv-resilient'
import { TTL } from './config'

/**
 * Prediction data stored in KV
 */
export interface PredictionData {
  marketId: bigint | null // null while market is being created on-chain
  channelId: string
  question: string
  outcomes: string[]
  outcomeMap: Record<string, number> // Twitch outcome ID -> our index
  locksAt: number // Unix timestamp
  createdAt: number
  state?: 'pending' | 'active' | 'locked' | 'resolved' | 'failed' // Track state for fast responses
  pendingLock?: boolean // Flag if lock event received before market created
}

/**
 * Channel configuration stored in Twitch Config Service
 * This interface is for reference - actual storage is in Twitch
 */
export interface ChannelConfig {
  walletAddress: string
}

/**
 * Store prediction -> market mapping when a prediction begins
 * Called immediately when Twitch prediction starts (before on-chain creation)
 */
export async function storePredictionMapping(
  twitchPredictionId: string,
  data: PredictionData
): Promise<void> {
  // Store with 24h TTL (predictions should resolve within this time)
  await kvResilient.set(
    `prediction:${twitchPredictionId}`,
    {
      ...data,
      marketId: data.marketId?.toString() ?? null, // BigInt can't be serialized directly
    },
    { ex: TTL.PREDICTION }
  )

  // Also store active prediction for the channel
  await kvResilient.set(
    `channel:${data.channelId}:active_prediction`,
    twitchPredictionId,
    { ex: TTL.PREDICTION }
  )
}

/**
 * Update prediction data (e.g., when market is created on-chain)
 */
export async function updatePredictionMapping(
  twitchPredictionId: string,
  updates: Partial<PredictionData>
): Promise<void> {
  const existing = await getPredictionData(twitchPredictionId)
  if (!existing) return
  
  await kvResilient.set(
    `prediction:${twitchPredictionId}`,
    {
      ...existing,
      ...updates,
      marketId: updates.marketId?.toString() ?? existing.marketId?.toString() ?? null,
    },
    { ex: TTL.PREDICTION }
  )
}

/**
 * Get prediction data by Twitch prediction ID
 */
export async function getPredictionData(
  twitchPredictionId: string
): Promise<PredictionData | null> {
  const data = await kvResilient.get<Omit<PredictionData, 'marketId'> & { marketId: string | null }>(
    `prediction:${twitchPredictionId}`
  )
  
  if (!data) return null
  
  return {
    ...data,
    marketId: data.marketId ? BigInt(data.marketId) : null,
  }
}

/**
 * Get the active prediction for a channel
 */
export async function getActivePrediction(
  channelId: string
): Promise<string | null> {
  return kvResilient.get<string>(`channel:${channelId}:active_prediction`)
}

/**
 * Clear the active prediction for a channel (after resolution/cancellation)
 */
export async function clearActivePrediction(channelId: string): Promise<void> {
  await kvResilient.del(`channel:${channelId}:active_prediction`)
}

/**
 * Store streamer session data (Twitch access token for EventSub)
 */
export async function storeStreamerSession(
  twitchUserId: string,
  data: {
    accessToken: string
    refreshToken: string
    walletAddress: string
    expiresAt: number
    twitchLogin?: string
    twitchDisplayName?: string
    profileImageUrl?: string
  }
): Promise<void> {
  await kvResilient.set(`streamer:${twitchUserId}`, data)
}

/**
 * Get streamer session data
 */
export async function getStreamerSession(twitchUserId: string): Promise<{
  accessToken: string
  refreshToken: string
  walletAddress: string
  expiresAt: number
  twitchLogin?: string
  twitchDisplayName?: string
  profileImageUrl?: string
} | null> {
  return kvResilient.get(`streamer:${twitchUserId}`)
}

/**
 * Store a reverse-lookup from walletAddress -> Twitch profile metadata.
 * This enables the frontend to show "created by <streamer>" on market cards.
 */
export async function storeWalletStreamerProfile(
  walletAddress: string,
  data: {
    twitchUserId: string
    twitchLogin?: string
    twitchDisplayName?: string
    profileImageUrl?: string
  }
): Promise<void> {
  await kvResilient.set(`wallet:${walletAddress.toLowerCase()}:streamer`, data)
}

export async function getWalletStreamerProfile(walletAddress: string): Promise<{
  twitchUserId: string
  twitchLogin?: string
  twitchDisplayName?: string
  profileImageUrl?: string
} | null> {
  return kvResilient.get(`wallet:${walletAddress.toLowerCase()}:streamer`)
}

/**
 * Store market metadata keyed by marketId.
 * Primarily used to recover Twitch outcome titles for multi-outcome markets.
 */
export async function storeMarketOutcomes(
  marketId: bigint,
  outcomes: string[]
): Promise<void> {
  await kvResilient.set(
    `market:${marketId.toString()}:outcomes`,
    { outcomes },
    // Keep a bit longer than prediction TTL so list views can still render nicely
    { ex: TTL.MARKET_OUTCOMES }
  )
}

export async function getMarketOutcomes(
  marketId: bigint
): Promise<{ outcomes: string[] } | null> {
  return kvResilient.get(`market:${marketId.toString()}:outcomes`)
}

/**
 * Delete prediction mapping (for cleanup)
 */
export async function deletePredictionMapping(twitchPredictionId: string): Promise<void> {
  const data = await getPredictionData(twitchPredictionId)
  if (data) {
    await kvResilient.del(`prediction:${twitchPredictionId}`)
    await clearActivePrediction(data.channelId)
  }
}

