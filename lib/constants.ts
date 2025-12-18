/**
 * Application Constants
 */

// =============================================================================
// Polling & Refresh Intervals
// =============================================================================

export const INTERVALS = {
  /** Default polling interval for market data (ms) */
  MARKET_POLL: 5_000,
  /** Balance refresh interval (ms) */
  BALANCE_REFRESH: 10_000,
  /** 
   * Active market polling in overlay (ms)
   * Note: With WebSocket events enabled, this is a fallback only.
   * Real-time updates come via contract event subscriptions.
   */
  OVERLAY_POLL: 3_000,
  /** Price history refresh interval (ms) */
  PRICE_HISTORY_POLL: 30_000,
} as const

// =============================================================================
// Token Decimals
// =============================================================================

export const DECIMALS = {
  /** USDC token decimals */
  USDC: 6,
  /** Outcome share decimals (ERC20 standard) */
  SHARES: 18,
} as const

// =============================================================================
// Trading Constants
// =============================================================================

export const TRADING = {
  /** Quick bet amounts for overlay */
  BET_AMOUNTS: [1, 5, 10, 25] as const,
  /** Percentage options for balance selection */
  PERCENTAGE_OPTIONS: [0.25, 0.5, 1] as const,
} as const
