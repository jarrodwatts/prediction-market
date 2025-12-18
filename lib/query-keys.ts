/**
 * TanStack Query Key Factory
 *
 * Centralized, type-safe query keys for all queries in the application.
 * Using a factory pattern ensures consistency and enables easy cache invalidation.
 */

export const queryKeys = {
  markets: {
    all: ['markets'] as const,
    list: () => [...queryKeys.markets.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.markets.all, 'detail', id] as const,
    history: (id: string) => [...queryKeys.markets.all, 'history', id] as const,
    trades: (id: string) => [...queryKeys.markets.all, 'trades', id] as const,
    active: (channelId: string) => [...queryKeys.markets.all, 'active', channelId] as const,
    meta: (marketId: string) => [...queryKeys.markets.all, 'meta', marketId] as const,
  },
  user: {
    all: ['user'] as const,
    profile: (address: string) => [...queryKeys.user.all, 'profile', address.toLowerCase()] as const,
    cashflow: (marketId: string, address: string) => 
      [...queryKeys.user.all, 'cashflow', marketId, address.toLowerCase()] as const,
    shares: (marketId: string, address: string) =>
      [...queryKeys.user.all, 'shares', marketId, address.toLowerCase()] as const,
  },
  streamers: {
    all: ['streamers'] as const,
    byWallet: (wallet: string) => [...queryKeys.streamers.all, 'byWallet', wallet.toLowerCase()] as const,
  },
  abstract: {
    profile: (address: string) => ['abstract', 'profile', address.toLowerCase()] as const,
  },
} as const

// Type helpers for query keys
export type QueryKeys = typeof queryKeys
export type MarketQueryKeys = QueryKeys['markets']
export type UserQueryKeys = QueryKeys['user']

