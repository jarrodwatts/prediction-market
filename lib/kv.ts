import { kv } from '@vercel/kv'

/**
 * Prediction data stored in KV
 */
export interface PredictionData {
  marketId: bigint
  channelId: string
  question: string
  outcomes: string[]
  outcomeMap: Record<string, number> // Twitch outcome ID -> our index
  locksAt: number // Unix timestamp
  createdAt: number
}

/**
 * Channel configuration stored in Twitch Config Service
 * This interface is for reference - actual storage is in Twitch
 */
export interface ChannelConfig {
  walletAddress: string
  defaultLiquidity: string // USDC amount as string
}

/**
 * Store prediction -> market mapping when a prediction begins
 */
export async function storePredictionMapping(
  twitchPredictionId: string,
  data: PredictionData
): Promise<void> {
  // Store with 24h TTL (predictions should resolve within this time)
  await kv.set(
    `prediction:${twitchPredictionId}`,
    {
      ...data,
      marketId: data.marketId.toString(), // BigInt can't be serialized directly
    },
    { ex: 86400 }
  )
  
  // Also store active prediction for the channel
  await kv.set(
    `channel:${data.channelId}:active_prediction`,
    twitchPredictionId,
    { ex: 86400 }
  )
}

/**
 * Get prediction data by Twitch prediction ID
 */
export async function getPredictionData(
  twitchPredictionId: string
): Promise<PredictionData | null> {
  const data = await kv.get<Omit<PredictionData, 'marketId'> & { marketId: string }>(
    `prediction:${twitchPredictionId}`
  )
  
  if (!data) return null
  
  return {
    ...data,
    marketId: BigInt(data.marketId),
  }
}

/**
 * Get the active prediction for a channel
 */
export async function getActivePrediction(
  channelId: string
): Promise<string | null> {
  return kv.get<string>(`channel:${channelId}:active_prediction`)
}

/**
 * Clear the active prediction for a channel (after resolution/cancellation)
 */
export async function clearActivePrediction(channelId: string): Promise<void> {
  await kv.del(`channel:${channelId}:active_prediction`)
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
  }
): Promise<void> {
  await kv.set(`streamer:${twitchUserId}`, data)
}

/**
 * Get streamer session data
 */
export async function getStreamerSession(twitchUserId: string): Promise<{
  accessToken: string
  refreshToken: string
  walletAddress: string
  expiresAt: number
} | null> {
  return kv.get(`streamer:${twitchUserId}`)
}

/**
 * Delete prediction mapping (for cleanup)
 */
export async function deletePredictionMapping(twitchPredictionId: string): Promise<void> {
  const data = await getPredictionData(twitchPredictionId)
  if (data) {
    await kv.del(`prediction:${twitchPredictionId}`)
    await clearActivePrediction(data.channelId)
  }
}

