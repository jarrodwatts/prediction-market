/**
 * Hook to fetch and watch market trades for the trades panel
 */

import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useWatchContractEvent, useChainId } from "wagmi";
import { parseAbiItem } from "viem";
import { PREDICTION_MARKET_ADDRESS, PREDICTION_MARKET_ABI } from "@/lib/contract";
import { queryKeys } from "@/lib/query-keys";

export interface Trade {
  user: `0x${string}`;
  outcomeId: number;
  amount: bigint;
  shares: bigint;
  timestamp: number;
  txHash: `0x${string}`;
  blockNumber: bigint;
}

const BET_PLACED_EVENT = parseAbiItem(
  "event BetPlaced(address indexed user, uint256 indexed marketId, uint256 indexed outcomeId, uint256 amount, uint256 shares, uint256 timestamp)"
);

interface UseMarketTradesOptions {
  marketId: bigint;
  enabled?: boolean;
}

/**
 * Hook to fetch historical trades and watch for real-time updates
 */
export function useMarketTrades({ marketId, enabled = true }: UseMarketTradesOptions) {
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Live trades that come in via WebSocket (prepended to the list)
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);

  // Fetch all historical trades for this market
  const { data: historicalTrades, isLoading } = useQuery({
    queryKey: [...queryKeys.markets.trades(marketId.toString()), chainId],
    queryFn: async () => {
      if (!publicClient) throw new Error("No public client");

      const logs = await publicClient.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: BET_PLACED_EVENT,
        args: { marketId },
        fromBlock: "earliest",
      });

      // Convert logs to Trade objects
      const trades: Trade[] = logs.map((log) => ({
        user: log.args.user as `0x${string}`,
        outcomeId: Number(log.args.outcomeId ?? 0),
        amount: log.args.amount ?? 0n,
        shares: log.args.shares ?? 0n,
        timestamp: Number(log.args.timestamp ?? 0),
        txHash: log.transactionHash as `0x${string}`,
        blockNumber: log.blockNumber,
      }));

      // Sort by timestamp descending (newest first)
      trades.sort((a, b) => b.timestamp - a.timestamp);

      return trades;
    },
    enabled: enabled && !!publicClient,
    staleTime: 60_000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // Watch for new BetPlaced events in real-time
  useWatchContractEvent({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    eventName: "BetPlaced",
    onLogs(logs) {
      for (const log of logs) {
        const args = log.args as {
          marketId?: bigint;
          user?: `0x${string}`;
          outcomeId?: bigint;
          amount?: bigint;
          shares?: bigint;
          timestamp?: bigint;
        };

        // Only track trades for this market
        if (args.marketId !== marketId) continue;

        const newTrade: Trade = {
          user: args.user as `0x${string}`,
          outcomeId: Number(args.outcomeId ?? 0),
          amount: args.amount ?? 0n,
          shares: args.shares ?? 0n,
          timestamp: Number(args.timestamp ?? 0),
          txHash: log.transactionHash as `0x${string}`,
          blockNumber: log.blockNumber,
        };

        // Add to live trades (prepend, avoiding duplicates)
        setLiveTrades((prev) => {
          if (prev.some((t) => t.txHash === newTrade.txHash)) return prev;
          return [newTrade, ...prev];
        });
      }
    },
    enabled: enabled,
  });

  // Clear live trades when marketId changes
  useEffect(() => {
    setLiveTrades([]);
  }, [marketId]);

  // Combine live trades with historical trades
  const allTrades = useCallback(() => {
    const historical = historicalTrades ?? [];

    // Merge and dedupe by txHash, keeping live trades first
    const seen = new Set<string>();
    const merged: Trade[] = [];

    for (const trade of liveTrades) {
      if (!seen.has(trade.txHash)) {
        seen.add(trade.txHash);
        merged.push(trade);
      }
    }

    for (const trade of historical) {
      if (!seen.has(trade.txHash)) {
        seen.add(trade.txHash);
        merged.push(trade);
      }
    }

    // Sort by timestamp descending
    merged.sort((a, b) => b.timestamp - a.timestamp);

    return merged;
  }, [historicalTrades, liveTrades]);

  return {
    trades: allTrades(),
    isLoading,
  };
}
