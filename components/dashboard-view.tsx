"use client";

import { useState } from "react";
import { usePublicClient } from "wagmi";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { MarketData } from "@/lib/types";
import { MarketList } from "@/components/market-list";
import { MarketFilters } from "@/components/market-filters";
import { CreateMarketDialog } from "@/components/create-market-dialog";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type StreamerProfileResponse =
  | {
      found: true;
      walletAddress: string;
      twitchUserId: string;
      twitchLogin?: string;
      twitchDisplayName?: string;
      profileImageUrl?: string;
    }
  | { found: false; walletAddress: string };

type MarketMetaResponse =
  | { found: true; marketId: string; outcomes: string[] }
  | { found: false; marketId: string };

export function DashboardView() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<"volume" | "createdAt">("createdAt");
  const client = usePublicClient();

  const { data: markets, isLoading } = useQuery({
    queryKey: ['markets-logs'],
    queryFn: async () => {
      if (!client) return [];
      
      const logs = await client.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: parseAbiItem('event MarketCreated(address indexed user, uint256 indexed marketId, uint256 outcomes, string question, string image, address token)'),
        fromBlock: 'earliest'
      });

      // Fetch current state for each market
      const marketsData = await Promise.all(logs.map(async (log) => {
        const marketId = log.args.marketId!;
        type MarketPricesResult = readonly [bigint, readonly bigint[]];
        type MarketFeesResult = readonly [unknown, unknown, `0x${string}`, `0x${string}`];

        const [block, data, pricesData, feesData] = await Promise.all([
          client.getBlock({ blockNumber: log.blockNumber }),
          client.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketData',
            args: [marketId]
          }),
          client.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketPrices',
            args: [marketId],
          }).catch(() => [0n, []] as const satisfies MarketPricesResult),
          client.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketFees',
            args: [marketId],
          }).catch(() => [null, null, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000"] as const satisfies MarketFeesResult),
        ]);

        const marketPrices = pricesData as MarketPricesResult;
        const prices = Array.isArray(marketPrices?.[1])
          ? marketPrices[1].map((p) => Number(p) / 1e18)
          : undefined;

        const distributor = (feesData as MarketFeesResult)?.[3] || undefined;

        // [state, closesAt, liquidity, balance, sharesAvailable, resolvedOutcomeId]
        return {
            id: marketId,
            question: log.args.question!,
            image: log.args.image!,
            token: log.args.token!,
            state: data[0],
            closesAt: BigInt(data[1]),
            liquidity: data[2],
            balance: data[3],
            sharesAvailable: data[4],
            resolvedOutcomeId: BigInt(data[5]),
            outcomeCount: Number(log.args.outcomes),
            createdAt: block.timestamp,
            volume: data[3], // Fallback to TVL for list view to avoid heavy log fetching
            prices,
            distributor,
        } as MarketData;
      }));

      // Resolve creator Twitch profile for any distributor wallets we can
      const distributorWallets = Array.from(
        new Set(
          marketsData
            .map((m) => m.distributor)
            .filter(
              (d): d is `0x${string}` =>
                !!d && d !== "0x0000000000000000000000000000000000000000"
            )
        )
      );

      const profiles = await Promise.all(
        distributorWallets.map(async (wallet) => {
          try {
            const res = await fetch(`/api/streamers/by-wallet?wallet=${wallet}`);
            if (!res.ok) return [wallet, null] as const;
            const json = (await res.json()) as StreamerProfileResponse;
            return [wallet, json.found ? json : null] as const;
          } catch {
            return [wallet, null] as const;
          }
        })
      );

      const profileByWallet = new Map<string, StreamerProfileResponse | null>(
        profiles.map(([wallet, profile]) => [wallet.toLowerCase(), profile])
      );

      const enriched = marketsData.map((m) => {
        const wallet = m.distributor?.toLowerCase();
        const profile = wallet ? profileByWallet.get(wallet) : null;
        if (!profile || !profile.found) return m;

        const login = profile.twitchLogin;
        const displayName = profile.twitchDisplayName || login;

        return {
          ...m,
          creator: {
            name: displayName || "Streamer",
            imageUrl: profile.profileImageUrl,
            url: login ? `https://twitch.tv/${login}` : undefined,
          },
        } as MarketData;
      });

      // For multi-outcome markets, fetch outcome titles (Twitch predictions)
      const multiOutcomeIds = enriched
        .filter((m) => m.outcomeCount > 2)
        .map((m) => m.id);

      const metaResults = await Promise.all(
        multiOutcomeIds.map(async (id) => {
          try {
            const res = await fetch(`/api/markets/meta?marketId=${id.toString()}`);
            if (!res.ok) return [id.toString(), null] as const;
            const json = (await res.json()) as MarketMetaResponse;
            return [id.toString(), json.found ? json : null] as const;
          } catch {
            return [id.toString(), null] as const;
          }
        })
      );

      const outcomesByMarketId = new Map<string, string[]>(
        metaResults
          .filter(([, meta]) => !!meta)
          .map(([id, meta]) => [id, (meta as { outcomes: string[] }).outcomes])
      );

      const withOutcomes = enriched.map((m) => {
        const outcomes = outcomesByMarketId.get(m.id.toString());
        if (!outcomes) return m;
        return { ...m, outcomes } as MarketData;
      });

      return withOutcomes.sort((a, b) => Number(b.id - a.id));
    },
    enabled: !!client,
    // Keep markets fresh for short-lived Twitch predictions
    refetchInterval: 10_000, // Poll every 10 seconds for new markets & state updates
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    staleTime: 5_000, // Consider data stale after 5 seconds
  });

  const filteredMarkets = (markets ?? [])
    .filter((market) => {
      // Only show active markets on homepage: open and not past close time.
      // state: 0 Open, 1 Closed, 2 Resolved
      if (market.state !== 0) return false;
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
      return market.closesAt > nowSeconds;
    })
    .filter((market) =>
      market.question.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === "volume") return Number(b.volume - a.volume);
      return Number(b.createdAt - a.createdAt);
    });

  return (
    <div className="mx-auto max-w-7xl py-8 space-y-8 px-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <h1 className="text-3xl font-bold tracking-tight">Prediction Market</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Market
          </Button>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Markets</h2>
            <MarketFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sort={sort}
              onSortChange={setSort}
            />
        </div>
        
        <MarketList 
            markets={filteredMarkets} 
            isLoading={isLoading} 
        />
      </div>

      <CreateMarketDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />
    </div>
  );
}
