"use client";

import { useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { MarketData } from "@/lib/types";
import { MarketCard } from "@/components/market-card";
import { MarketDetailDialog } from "@/components/market-detail-dialog";
import { CreateMarketDialog } from "@/components/create-market-dialog";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardView() {
  const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
        const data = await client.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketData',
            args: [marketId]
        });

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
            outcomeCount: Number(log.args.outcomes)
        } as MarketData;
      }));

      return marketsData.sort((a, b) => Number(b.id - a.id));
    },
    enabled: !!client
  });

  const handleMarketClick = (market: MarketData) => {
    setSelectedMarket(market);
    setDialogOpen(true);
  };

  const totalVolume = markets?.reduce((acc, m) => acc + m.balance, 0n) ?? 0n;
  const activeMarkets = markets?.filter(m => m.state === 0).length ?? 0;

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header Stats */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <h1 className="text-3xl font-bold tracking-tight">Prediction Market Admin</h1>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Market
          </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-card rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground">Total Markets</h3>
            <div className="text-2xl font-bold">{markets?.length ?? 0}</div>
        </div>
        <div className="p-6 bg-card rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground">Active Markets</h3>
            <div className="text-2xl font-bold">{activeMarkets}</div>
        </div>
        <div className="p-6 bg-card rounded-lg border shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground">Total Volume (TVL)</h3>
            <div className="text-2xl font-bold">{Number(totalVolume) / 1e18} ETH</div>
        </div>
      </div>

      {/* Market Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Markets</h2>
        {isLoading ? (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets?.map((market) => (
                <MarketCard 
                    key={market.id.toString()} 
                    market={market} 
                    onClick={() => handleMarketClick(market)} 
                />
            ))}
            </div>
        )}
      </div>

      <MarketDetailDialog 
        market={selectedMarket} 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
      />

      <CreateMarketDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />
    </div>
  );
}

