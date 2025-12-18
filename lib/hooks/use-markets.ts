'use client'

import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from '@/lib/contract'
import { queryKeys } from '@/lib/query-keys'
import { getPrices } from '@/lib/market-math'
import type { MarketData } from '@/lib/types'

// Types for API responses
type StreamerProfileResponse =
  | {
      found: true
      walletAddress: string
      twitchUserId: string
      twitchLogin?: string
      twitchDisplayName?: string
      profileImageUrl?: string
    }
  | { found: false; walletAddress: string }

type MarketMetaResponse =
  | { found: true; marketId: string; outcomes: string[] }
  | { found: false; marketId: string }

export function useMarkets() {
  const client = usePublicClient()

  return useQuery({
    queryKey: queryKeys.markets.list(),
    queryFn: async () => {
      if (!client) return []

      // Fetch MarketCreated events
      const logs = await client.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: parseAbiItem(
          'event MarketCreated(address indexed creator, uint256 indexed marketId, uint256 outcomeCount, string question, string image, address token)'
        ),
        fromBlock: 'earliest',
      })

      // Fetch current state for each market
      const marketsData = await Promise.all(
        logs.map(async (log) => {
          const marketId = log.args.marketId!

          const [block, data, pools] = await Promise.all([
            client.getBlock({ blockNumber: log.blockNumber }),
            client.readContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'getMarketData',
              args: [marketId],
            }),
            client.readContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'getMarketPools',
              args: [marketId],
            }).catch(() => [] as readonly bigint[]),
          ])

          const prices = pools.length > 0 ? getPrices(pools) : undefined

          return {
            id: marketId,
            question: log.args.question!,
            image: log.args.image!,
            token: log.args.token!,
            state: data[0],
            closesAt: BigInt(data[1]),
            totalPot: data[2],
            pools,
            outcomeCount: Number(data[3]),
            resolvedOutcome: data[4],
            creator: data[5],
            protocolFeeBps: Number(data[6]),
            creatorFeeBps: Number(data[7]),
            createdAt: block.timestamp,
            prices,
          } as MarketData
        })
      )

      const creatorWallets = Array.from(
        new Set(
          marketsData
            .map((m) => m.creator)
            .filter(
              (c): c is `0x${string}` =>
                !!c && c !== '0x0000000000000000000000000000000000000000'
            )
        )
      )

      const profiles = await Promise.all(
        creatorWallets.map(async (wallet) => {
          try {
            const res = await fetch(`/api/streamers/by-wallet?wallet=${wallet}`)
            if (!res.ok) return [wallet, null] as const
            const json = (await res.json()) as StreamerProfileResponse
            return [wallet, json.found ? json : null] as const
          } catch {
            return [wallet, null] as const
          }
        })
      )

      const profileByWallet = new Map<string, StreamerProfileResponse | null>(
        profiles.map(([wallet, profile]) => [wallet.toLowerCase(), profile])
      )

      const enriched = marketsData.map((m) => {
        const wallet = m.creator?.toLowerCase()
        const profile = wallet ? profileByWallet.get(wallet) : null
        if (!profile || !profile.found) return m

        const login = profile.twitchLogin
        const displayName = profile.twitchDisplayName || login

        return {
          ...m,
          creatorInfo: {
            name: displayName || 'Streamer',
            imageUrl: profile.profileImageUrl,
            url: login ? `https://twitch.tv/${login}` : undefined,
          },
        } as MarketData
      })

      const multiOutcomeIds = enriched
        .filter((m) => m.outcomeCount > 2)
        .map((m) => m.id)

      const metaResults = await Promise.all(
        multiOutcomeIds.map(async (id) => {
          try {
            const res = await fetch(`/api/markets/meta?marketId=${id.toString()}`)
            if (!res.ok) return [id.toString(), null] as const
            const json = (await res.json()) as MarketMetaResponse
            return [id.toString(), json.found ? json : null] as const
          } catch {
            return [id.toString(), null] as const
          }
        })
      )

      const outcomesByMarketId = new Map<string, string[]>(
        metaResults
          .filter(([, meta]) => !!meta)
          .map(([id, meta]) => [id, (meta as { outcomes: string[] }).outcomes])
      )

      const withOutcomes = enriched.map((m) => {
        const outcomes = outcomesByMarketId.get(m.id.toString())
        if (!outcomes) return m
        return { ...m, outcomes } as MarketData
      })

      return withOutcomes.sort((a, b) => Number(b.id - a.id))
    },
    enabled: !!client,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  })
}

export function useMarket(id: bigint) {
  const client = usePublicClient()

  return useQuery({
    queryKey: queryKeys.markets.detail(id.toString()),
    queryFn: async () => {
      if (!client) throw new Error('No client')

      const [data, pools, metaResponse] = await Promise.all([
        client.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'getMarketData',
          args: [id],
        }),
        client.readContract({
          address: PREDICTION_MARKET_ADDRESS,
          abi: PREDICTION_MARKET_ABI,
          functionName: 'getMarketPools',
          args: [id],
        }).catch(() => [] as readonly bigint[]),
        fetch(`/api/markets/meta?marketId=${id.toString()}`)
          .then((r) => r.json())
          .catch(() => null) as Promise<{ found: boolean; outcomes?: string[] } | null>,
      ])

      const logs = await client.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: parseAbiItem(
          'event MarketCreated(address indexed creator, uint256 indexed marketId, uint256 outcomeCount, string question, string image, address token)'
        ),
        args: { marketId: id },
        fromBlock: 'earliest',
      })

      if (logs.length === 0) {
        throw new Error('Market creation log not found')
      }

      const creationLog = logs[0]
      const block = await client.getBlock({ blockNumber: creationLog.blockNumber })

      const prices = pools.length > 0 ? getPrices(pools) : undefined
      const outcomes = metaResponse?.found && metaResponse.outcomes ? metaResponse.outcomes : undefined

      return {
        id,
        question: creationLog.args.question!,
        image: creationLog.args.image!,
        token: creationLog.args.token!,
        state: data[0],
        closesAt: data[1],
        totalPot: data[2],
        pools,
        outcomeCount: Number(data[3]),
        resolvedOutcome: data[4],
        creator: data[5],
        protocolFeeBps: Number(data[6]),
        creatorFeeBps: Number(data[7]),
        createdAt: block.timestamp,
        prices,
        outcomes,
      } as MarketData
    },
    enabled: !!client,
    refetchInterval: 10_000,
  })
}

export function useMarketHistory(marketId: bigint) {
  const client = usePublicClient()

  return useQuery({
    queryKey: queryKeys.markets.history(marketId.toString()),
    queryFn: async () => {
      if (!client) return []

      // Fetch market data to get outcome count
      const marketData = await client.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'getMarketData',
        args: [marketId],
      })
      const outcomeCount = Number(marketData[3])

      // Fetch BetPlaced events
      const logs = await client.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: parseAbiItem(
          'event BetPlaced(address indexed user, uint256 indexed marketId, uint256 indexed outcomeId, uint256 amount, uint256 shares, uint256 timestamp)'
        ),
        args: { marketId },
        fromBlock: 'earliest',
      })

      // Sort logs by timestamp
      const sortedLogs = [...logs].sort((a, b) =>
        Number(a.args.timestamp ?? 0n) - Number(b.args.timestamp ?? 0n)
      )

      // Build cumulative pool snapshots
      const pools: bigint[] = Array(outcomeCount).fill(0n)
      const chartData: Record<string, unknown>[] = []

      for (const log of sortedLogs) {
        const outcomeId = Number(log.args.outcomeId ?? 0)
        const shares = log.args.shares ?? 0n
        const timestamp = Number(log.args.timestamp ?? 0n) * 1000

        // Update cumulative pools
        pools[outcomeId] = (pools[outcomeId] ?? 0n) + shares

        // Calculate total pot and prices
        const totalPot = pools.reduce((sum, p) => sum + p, 0n)

        // Create chart data point with outcome_X keys
        const dataPoint: Record<string, unknown> = { timestamp }
        for (let i = 0; i < outcomeCount; i++) {
          const price = totalPot > 0n
            ? Number(pools[i]) / Number(totalPot)
            : 1 / outcomeCount
          dataPoint[`outcome_${i}`] = price
        }

        chartData.push(dataPoint)
      }

      return chartData
    },
    enabled: !!client,
    refetchInterval: 10_000,
  })
}

export function useActiveMarket(channelId: string | null, token?: string) {
  return useQuery({
    queryKey: queryKeys.markets.active(channelId || ''),
    queryFn: async () => {
      if (!channelId) return null

      const res = await fetch(`/api/markets/active?channelId=${channelId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })

      if (res.status === 404) {
        return null
      }

      if (!res.ok) {
        throw new Error('Failed to fetch market')
      }

      return res.json()
    },
    enabled: !!channelId,
    refetchInterval: 2000,
  })
}

export function useUserShares(marketId: bigint, userAddress: `0x${string}` | undefined) {
  const client = usePublicClient()

  return useQuery({
    queryKey: queryKeys.user.shares(marketId.toString(), userAddress || ''),
    queryFn: async () => {
      if (!client || !userAddress) return null

      const shares = await client.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'getUserShares',
        args: [marketId, userAddress],
      })

      return shares
    },
    enabled: !!client && !!userAddress,
    refetchInterval: 5_000,
  })
}

export function useClaimableAmount(marketId: bigint, userAddress: `0x${string}` | undefined) {
  const client = usePublicClient()

  return useQuery({
    queryKey: ['claimable', marketId.toString(), userAddress || ''],
    queryFn: async () => {
      if (!client || !userAddress) return null

      const result = await client.readContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'getClaimableAmount',
        args: [marketId, userAddress],
      })

      return {
        amount: result[0],
        canClaim: result[1],
      }
    },
    enabled: !!client && !!userAddress,
    refetchInterval: 5_000,
  })
}
