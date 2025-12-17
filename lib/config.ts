/**
 * Application configuration
 *
 * Centralizes environment variables, constants, and configuration values
 * for easier maintenance and testing.
 */

import { parseUnits } from 'viem'
import { MissingConfigError } from './errors/backend'

// ============================================
// Environment Variables (with validation)
// ============================================

/**
 * Get required environment variable or throw
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new MissingConfigError(key)
  }
  return value
}

/**
 * Get optional environment variable with default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue
}

// ============================================
// Network Configuration
// ============================================

export const NETWORK = {
  IS_MAINNET: process.env.NEXT_PUBLIC_NETWORK === 'mainnet',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
} as const

// ============================================
// Blockchain Configuration
// ============================================

export const BLOCKCHAIN = {
  // USDC contract address
  USDC_ADDRESS: getOptionalEnv(
    'NEXT_PUBLIC_USDC_ADDRESS',
    '0x0000000000000000000000000000000000000000'
  ) as `0x${string}`,

  // Protocol treasury address (receives protocol fees)
  PROTOCOL_TREASURY_ADDRESS: getOptionalEnv(
    'PROTOCOL_TREASURY_ADDRESS',
    '0x0000000000000000000000000000000000000000'
  ) as `0x${string}`,

  // Backend wallet private key (for creating/managing markets)
  get BACKEND_WALLET_PRIVATE_KEY(): string {
    return getRequiredEnv('BACKEND_WALLET_PRIVATE_KEY')
  },

  // RPC configuration (optimized for Abstract L2 with 200ms block times)
  RPC: {
    TIMEOUT_MS: 30_000, // 30 seconds (sufficient for Abstract's fast blocks)
    RETRY_COUNT: 3,
    RETRY_DELAY_MS: 500,
    CONFIRMATIONS: 1, // Wait for 1 confirmation
  },

  // Transaction timeouts
  TX: {
    WAIT_TIMEOUT_MS: 30_000, // 30 seconds to wait for transaction
  },
} as const

// ============================================
// Market Configuration
// ============================================

export const MARKET = {
  // Fee structure (in basis points where 10^18 = 100%)
  FEES: {
    PROTOCOL_FEE: parseUnits('0.015', 18), // 1.5% to protocol treasury
    STREAMER_FEE: parseUnits('0.015', 18), // 1.5% to streamer (market creator)
  },
  // Fee structure in basis points (for contract interaction)
  FEES_BPS: {
    PROTOCOL: 150, // 1.5% = 150 basis points
    CREATOR: 150,  // 1.5% = 150 basis points
  },
} as const

// ============================================
// Twitch Configuration
// ============================================

export const TWITCH = {
  // OAuth credentials
  get CLIENT_ID(): string {
    return getRequiredEnv('TWITCH_CLIENT_ID')
  },
  get CLIENT_SECRET(): string {
    return getRequiredEnv('TWITCH_CLIENT_SECRET')
  },
  get WEBHOOK_SECRET(): string {
    return getRequiredEnv('TWITCH_WEBHOOK_SECRET')
  },

  // Webhook URL (constructed from NEXTAUTH_URL)
  get WEBHOOK_URL(): string {
    const baseUrl = getRequiredEnv('NEXTAUTH_URL')
    return `${baseUrl}/api/twitch/webhook`
  },
} as const

// ============================================
// Authentication Configuration
// ============================================

export const AUTH = {
  // NextAuth configuration
  get NEXTAUTH_SECRET(): string {
    return getRequiredEnv('NEXTAUTH_SECRET')
  },
  get NEXTAUTH_URL(): string {
    return getRequiredEnv('NEXTAUTH_URL')
  },

  // Admin API token (optional - admin endpoints disabled if not set)
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
} as const

// ============================================
// CORS Configuration
// ============================================

export const CORS = {
  ALLOWED_ORIGINS: [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
  ].filter(Boolean) as string[],

  MAX_AGE_SECONDS: 86400, // 24 hours
} as const

// ============================================
// Cache/Storage TTLs (in seconds)
// ============================================

export const TTL = {
  // Webhook deduplication (1 hour)
  WEBHOOK_DEDUP: 3600,

  // Operation idempotency (1 hour)
  OPERATION: 3600,

  // Prediction data in KV (24 hours)
  PREDICTION: 86400,

  // Market outcomes (14 days)
  MARKET_OUTCOMES: 86400 * 14,

  // Webhook timestamp window for replay protection (10 minutes)
  WEBHOOK_TIMESTAMP_WINDOW_MS: 10 * 60 * 1000,
} as const

// ============================================
// Vercel KV Configuration
// ============================================

export const KV = {
  get REST_API_URL(): string {
    return getRequiredEnv('KV_REST_API_URL')
  },
  get REST_API_TOKEN(): string {
    return getRequiredEnv('KV_REST_API_TOKEN')
  },
} as const

// ============================================
// App URLs
// ============================================

export const APP = {
  PUBLIC_URL: getOptionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
} as const

// ============================================
// Type Exports
// ============================================

export type NetworkConfig = typeof NETWORK
export type BlockchainConfig = typeof BLOCKCHAIN
export type MarketConfig = typeof MARKET
export type TwitchConfig = typeof TWITCH
export type AuthConfig = typeof AUTH
export type CorsConfig = typeof CORS
export type TtlConfig = typeof TTL
