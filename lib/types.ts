/**
 * Application Types
 */

// =============================================================================
// Market Types
// =============================================================================

/** Market state enum values from the smart contract */
export const MarketState = {
  OPEN: 0,
  LOCKED: 1,
  RESOLVED: 2,
  VOIDED: 3,
} as const

export type MarketStateValue = (typeof MarketState)[keyof typeof MarketState]

/** API response state strings */
export type MarketStateString = 'pending' | 'open' | 'locked' | 'resolved' | 'voided'

/**
 * On-chain market data structure
 */
export interface MarketData {
  id: bigint
  question: string
  image: string
  token: string
  /** Market state: 0 = Open, 1 = Locked, 2 = Resolved, 3 = Voided */
  state: MarketStateValue
  closesAt: bigint
  /** Total pot (sum of all bets) */
  totalPot: bigint
  /** Pools per outcome (amount bet on each outcome) */
  pools: readonly bigint[]
  outcomeCount: number
  resolvedOutcome: bigint
  /** Address that created the market (receives creator fees) */
  creator: `0x${string}`
  /** Protocol fee in basis points */
  protocolFeeBps: number
  /** Creator fee in basis points */
  creatorFeeBps: number
  createdAt: bigint

  /**
   * Optional computed fields for list views.
   * - prices are normalized 0-1 (probabilities) per outcome
   * - outcomes are the outcome titles from KV
   */
  prices?: number[]
  outcomes?: string[]
  creatorInfo?: MarketCreator
}

/**
 * Market creator display info
 */
export interface MarketCreator {
  name: string
  imageUrl?: string
  url?: string
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Active market response from /api/markets/active
 * Used by overlay and other real-time market displays
 */
export interface MarketApiResponse {
  /** On-chain market ID (null if still pending creation) */
  id: string | null
  /** Twitch prediction ID */
  twitchPredictionId: string
  /** Market question */
  question: string
  /** Outcome titles */
  outcomes: string[]
  prices: number[]
  /** Pool sizes per outcome (as strings for bigint compat) */
  pools: string[]
  /** Market state */
  state: MarketStateString
  /** Unix timestamp when market closes */
  closesAt: number
  /** Total pot / volume (as string for bigint compat) */
  totalPot: string
  /** Resolved outcome index (null if not resolved) */
  resolvedOutcome?: number | null
  /** Whether market was voided/cancelled */
  isVoided?: boolean
  /** Protocol fee in basis points */
  protocolFeeBps: number
  /** Creator fee in basis points */
  creatorFeeBps: number
}

// =============================================================================
// User Types
// =============================================================================

/**
 * User's position in a market
 */
export interface UserPosition {
  shares: readonly bigint[]
  /** Whether user has already claimed winnings/refunds per outcome */
  claimed: boolean[]
}

/**
 * User claim status for a market
 */
export interface UserClaimStatus {
  /** Total claimable amount */
  amount: bigint
  /** Whether user can claim (has unclaimed winnings/refunds) */
  canClaim: boolean
}

// =============================================================================
// Outcome Types
// =============================================================================

/**
 * Outcome option for selectors
 */
export interface OutcomeOption {
  title: string
  idx: number
  price: number
  /** Pool size for this outcome */
  pool: bigint
}

/**
 * Sorted outcome for display (with ID for keying)
 */
export interface DisplayOutcome {
  id: string
  title: string
  price: number
  /** Pool size for this outcome */
  pool?: bigint
}

// =============================================================================
// Transaction Types
// =============================================================================

/**
 * Parameters for placing a bet
 */
export interface BetParams {
  marketId: bigint
  outcomeId: number
  amount: bigint
}

/**
 * Parameters for creating a market
 */
export interface CreateMarketParams {
  question: string
  image: string
  outcomeCount: number
  closesAt: number
  token: `0x${string}`
  protocolFeeBps: number
  creatorFeeBps: number
  creator: `0x${string}`
}
