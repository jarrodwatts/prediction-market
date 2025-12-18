/**
 * Zod validation schemas for API endpoints
 *
 * Provides type-safe input validation with user-friendly error messages.
 */

import { z } from 'zod'

// =============================================================================
// Primitive Schemas
// =============================================================================

/**
 * Ethereum-compatible address validation (supports EOAs and smart contract wallets like AGW)
 *
 * Note: This validates the format only. Both EOAs and smart contract wallets (like Abstract Global Wallet)
 * use the same address format (0x + 40 hex characters).
 */
export const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .transform((addr) => addr.toLowerCase() as `0x${string}`)

/**
 * Twitch channel ID (numeric string)
 */
export const twitchChannelIdSchema = z
  .string()
  .regex(/^\d+$/, 'Invalid Twitch channel ID')
  .min(1, 'Channel ID is required')

/**
 * Market ID validation
 */
export const marketIdSchema = z
  .string()
  .regex(/^\d+$/, 'Invalid market ID')
  .transform((val) => BigInt(val))

/**
 * API Endpoint Schemas
 */

export const streamerSettingsPostSchema = z.object({
  channelId: twitchChannelIdSchema,
  walletAddress: ethereumAddressSchema,
})

export const streamerSettingsGetSchema = z.object({
  channelId: twitchChannelIdSchema,
})

export const clearPredictionSchema = z.object({
  channelId: twitchChannelIdSchema,
})

export const updateSubscriptionsSchema = z.object({
  channelId: twitchChannelIdSchema,
  webhookUrl: z.string().url('Invalid webhook URL'),
})

export const marketActiveSchema = z.object({
  channelId: twitchChannelIdSchema,
})

export const marketMetaSchema = z.object({
  marketId: marketIdSchema,
})

export const streamerByWalletSchema = z.object({
  wallet: ethereumAddressSchema,
})

export const subscribeBodySchema = z.object({
  walletAddress: ethereumAddressSchema,
})

/**
 * Type exports for use in API routes
 */
export type StreamerSettingsPost = z.infer<typeof streamerSettingsPostSchema>
export type StreamerSettingsGet = z.infer<typeof streamerSettingsGetSchema>
export type ClearPrediction = z.infer<typeof clearPredictionSchema>
export type UpdateSubscriptions = z.infer<typeof updateSubscriptionsSchema>
export type MarketActive = z.infer<typeof marketActiveSchema>
export type MarketMeta = z.infer<typeof marketMetaSchema>
export type StreamerByWallet = z.infer<typeof streamerByWalletSchema>
export type SubscribeBody = z.infer<typeof subscribeBodySchema>

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Streamer profile response from /api/streamers/by-wallet
 */
export const streamerProfileResponseSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    walletAddress: z.string(),
    twitchUserId: z.string(),
    twitchLogin: z.string().optional(),
    twitchDisplayName: z.string().optional(),
    profileImageUrl: z.string().url().optional(),
  }),
  z.object({
    found: z.literal(false),
    walletAddress: z.string(),
  }),
])

/**
 * Market meta response from /api/markets/meta
 */
export const marketMetaResponseSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    marketId: z.string(),
    outcomes: z.array(z.string()),
  }),
  z.object({
    found: z.literal(false),
    marketId: z.string(),
  }),
])

/**
 * Active market response from /api/markets/active
 */
export const activeMarketResponseSchema = z.object({
  id: z.string().nullable(),
  twitchPredictionId: z.string(),
  question: z.string(),
  outcomes: z.array(z.string()),
  prices: z.array(z.number()),
  pools: z.array(z.string()),
  state: z.enum(['pending', 'open', 'locked', 'resolved', 'voided']),
  closesAt: z.number(),
  totalPot: z.string(),
  resolvedOutcome: z.number().nullable().optional(),
  isVoided: z.boolean().optional(),
  protocolFeeBps: z.number(),
  creatorFeeBps: z.number(),
})

/**
 * Abstract profile response
 */
export const abstractProfileResponseSchema = z.object({
  address: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  profilePictureUrl: z.string().url().nullable().optional(),
  tier: z.string().nullable().optional(),
})

/**
 * EventSub subscription result
 */
export const eventSubResultSchema = z.object({
  type: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
})

/**
 * Subscribe response from /api/twitch/subscribe
 */
export const subscribeResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(eventSubResultSchema).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
})

// Response type exports
export type StreamerProfileResponse = z.infer<typeof streamerProfileResponseSchema>
export type MarketMetaResponse = z.infer<typeof marketMetaResponseSchema>
export type ActiveMarketResponse = z.infer<typeof activeMarketResponseSchema>
export type AbstractProfileResponse = z.infer<typeof abstractProfileResponseSchema>
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>
