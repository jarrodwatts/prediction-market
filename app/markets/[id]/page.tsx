"use client";

import { useState } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { MarketHeader } from "@/components/market/market-header";
import { OutcomeLegend } from "@/components/market/outcome-legend";
import { PriceChart } from "@/components/market/price-chart";
import { MarketRules } from "@/components/market/market-rules";
import { MarketTimeline } from "@/components/market/market-timeline";
import { TradePanel } from "@/components/market/trade-panel";
import { useQuery } from "@tanstack/react-query";
import { MarketData } from "@/lib/types";
import { parseAbiItem } from "viem";

export default function MarketDetailPage() {
  const params = useParams();
  const id = BigInt(params.id as string);
  const publicClient = usePublicClient();
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  const { data: market, isLoading, error } = useQuery({
    queryKey: ['market', id.toString()],
    refetchInterval: 10000, // Refresh every 10 seconds to catch state changes
    queryFn: async () => {
        if (!publicClient) throw new Error("No client");

        // Fetch market data from contract
        const data = await publicClient.readContract({
            address: PREDICTION_MARKET_ADDRESS,
            abi: PREDICTION_MARKET_ABI,
            functionName: 'getMarketData',
            args: [id]
        });

        // Fetch logs to get question and image
        // We filter logs for this specific market ID to find the creation event
        const logs = await publicClient.getLogs({
            address: PREDICTION_MARKET_ADDRESS,
            event: parseAbiItem('event MarketCreated(address indexed user, uint256 indexed marketId, uint256 outcomes, string question, string image, address token)'),
            args: { marketId: id },
            fromBlock: 'earliest'
        });

        if (logs.length === 0) {
            throw new Error("Market creation log not found");
        }

        // Fetch ALL MarketActionTx logs (without filtering by marketId in the RPC call)
        // Then filter in JS - this is more reliable across different RPC providers
        const [creationLog, allActionLogs] = await Promise.all([
            Promise.resolve(logs[0]),
            publicClient.getLogs({
                address: PREDICTION_MARKET_ADDRESS,
                event: {
                    type: 'event',
                    name: 'MarketActionTx',
                    inputs: [
                        { name: 'user', type: 'address', indexed: true },
                        { name: 'action', type: 'uint8', indexed: true },
                        { name: 'marketId', type: 'uint256', indexed: true },
                        { name: 'outcomeId', type: 'uint256', indexed: false },
                        { name: 'shares', type: 'uint256', indexed: false },
                        { name: 'value', type: 'uint256', indexed: false },
                        { name: 'timestamp', type: 'uint256', indexed: false },
                    ],
                },
                fromBlock: 'earliest'
            })
        ]);

        // Filter logs for this specific market
        const actionLogs = allActionLogs.filter(log => log.args.marketId === id);

        const block = await publicClient.getBlock({ blockNumber: creationLog.blockNumber });

        // Calculate volume (buy + sell)
        // Action 0 = Buy, 1 = Sell
        const volume = actionLogs.reduce((acc, log) => {
            const action = Number(log.args.action);
            if (action === 0 || action === 1) {
                return acc + (log.args.value || 0n);
            }
            return acc;
        }, 0n);

        return {
            id,
            question: creationLog.args.question!,
            image: creationLog.args.image!,
            token: "ETH", // Default for now
            state: data[0],
            closesAt: data[1],
            liquidity: data[2],
            balance: data[3],
            sharesAvailable: data[4],
            resolvedOutcomeId: data[5],
            outcomeCount: Number(creationLog.args.outcomes),
            createdAt: block.timestamp,
            volume: volume
        } as MarketData;
    },
    enabled: !!publicClient
  });

  if (isLoading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    );
  }

  if (error || !market) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <h1 className="text-xl font-bold">Market not found</h1>
            <Link href="/" className="text-primary hover:underline">Back to Markets</Link>
        </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      {/* Back Link */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Markets
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left Column - Chart and Info */}
        <div className="space-y-6 min-w-0">
          {/* Market Header */}
          <MarketHeader market={market} />

          {/* Outcome Legend */}
          <OutcomeLegend outcomes={["Yes", "No"]} />

          {/* Price Chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <PriceChart marketId={market.id} outcomeCount={market.outcomeCount} selectedOutcome={selectedOutcome} />
          </div>

          {/* Rules Section */}
          <MarketRules
            description={`Market Question: ${market.question}\n\nThis market will resolve based on the outcome of the event.`}
          />
        </div>

        {/* Right Column - Trade Panel and Timeline */}
        <div className="space-y-6 min-w-0 lg:sticky lg:top-20 lg:self-start">
          <TradePanel market={market} selectedOutcome={selectedOutcome} onOutcomeChange={setSelectedOutcome} />

          {/* Timeline Section */}
          <MarketTimeline market={market} />
        </div>
      </div>
    </div>
  );
}

