"use client";

/**
 * Price Chart Component
 *
 * Displays historical price data for market outcomes.
 * Adapted to use on-chain event logs.
 */

import { useMemo, useState } from "react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { getPrice } from "@/lib/market-math";
import { getOutcomeColor } from "@/lib/outcome-colors";
import { formatDynamicChartDate, formatTooltipDate } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

type TimeFrame = "24h" | "7d" | "30d" | "all";

interface PriceChartProps {
  marketId: bigint;
  outcomeCount: number;
  selectedOutcome?: number;
}

export function PriceChart({ marketId, outcomeCount, selectedOutcome = 0 }: PriceChartProps) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("all");
  const client = usePublicClient();

  const { data: chartData, isLoading } = useQuery({
      queryKey: ['market-history', marketId.toString()],
      queryFn: async () => {
          if (!client) return [];
          
          const logs = await client.getLogs({
              address: PREDICTION_MARKET_ADDRESS,
              event: parseAbiItem('event MarketOutcomeShares(uint256 indexed marketId, uint256 timestamp, uint256[] outcomeShares, uint256 liquidity)'),
              args: { marketId },
              fromBlock: 'earliest'
          });

          return logs.map(log => {
              const timestamp = Number(log.args.timestamp) * 1000;
              const shares = log.args.outcomeShares!;
              const liquidity = log.args.liquidity!;
              
              const prices: Record<string, number | string> = {
                  time: timestamp, // Keep as number for sorting/filtering
                  timestamp 
              };

              for (let i = 0; i < shares.length; i++) {
                  prices[`outcome_${i}`] = getPrice(i, [...shares], liquidity);
              }

              return prices;
          });
      },
      enabled: !!client
  });

  // Filter data based on timeframe
  const filteredData = useMemo(() => {
      if (!chartData) return [];
      const now = Date.now();
      let cutoff = 0;
      
      switch (timeFrame) {
          case '24h': cutoff = now - 24 * 60 * 60 * 1000; break;
          case '7d': cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
          case '30d': cutoff = now - 30 * 24 * 60 * 60 * 1000; break;
          default: cutoff = 0;
      }

      const filtered = chartData.filter(d => (d.timestamp as number) >= cutoff);

      // Add current data point to extend line to now
      if (filtered.length > 0) {
          const lastPoint = filtered[filtered.length - 1];
          // Only add if last point is older than 1 minute to avoid dupes
          if (now - (lastPoint.timestamp as number) > 60 * 1000) {
              filtered.push({
                  ...lastPoint,
                  timestamp: now,
                  time: now
              });
          }
      }

      return filtered;
  }, [chartData, timeFrame]);

  // Build chart config
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    Array.from({ length: outcomeCount }).forEach((_, index) => {
      const title = index === 0 ? "Yes" : "No"; // Default for binary
      config[`outcome_${index}`] = {
        label: title,
        color: getOutcomeColor(title, index),
      };
    });
    return config;
  }, [outcomeCount]);

  const hasData = filteredData.length > 0;

  // Calculate the actual time span of displayed data for dynamic formatting
  const dataTimeSpanMs = useMemo(() => {
    if (filteredData.length < 2) return 0;
    const first = filteredData[0].timestamp as number;
    const last = filteredData[filteredData.length - 1].timestamp as number;
    return last - first;
  }, [filteredData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {hasData && (
          <div className="flex items-baseline gap-2">
             <span className="text-3xl font-bold">
               {Math.round((filteredData[filteredData.length - 1][`outcome_0`] as number) * 100)}%
             </span>
             <span className="text-sm font-medium text-emerald-500">
               {/* Change logic placeholder */}
               +0.0% ({timeFrame})
             </span>
          </div>
        )}
        <Tabs
          value={timeFrame}
          onValueChange={(v) => setTimeFrame(v as TimeFrame)}
        >
          <TabsList>
            <TabsTrigger value="24h" className="text-xs">24H</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">7D</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">30D</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
         <div className="flex h-[240px] items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
         </div>
      ) : hasData ? (
        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <LineChart
            data={filteredData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis
              dataKey="timestamp"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={dataTimeSpanMs < 60 * 60 * 1000 ? 60 : 80}
              tickFormatter={(value) => formatDynamicChartDate(value / 1000, dataTimeSpanMs)}
              fontSize={11}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${Math.round(value * 100)}%`}
              domain={[0, 1]}
              fontSize={11}
              width={35}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatTooltipDate(value / 1000)}
                  indicator="dot"
                />
              }
            />
            {Array.from({ length: outcomeCount }).map((_, index) => {
                const isSelected = index === selectedOutcome; // We need to pass selectedOutcome from props
                return (
                  <Line
                    key={index}
                    type="monotone"
                    dataKey={`outcome_${index}`}
                    stroke={`var(--color-outcome_${index})`}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeOpacity={isSelected ? 1 : 0.3}
                    dot={false}
                    style={
                      {
                        filter: isSelected ? `drop-shadow(0 4px 6px var(--color-outcome_${index}))` : 'none',
                        zIndex: isSelected ? 10 : 0,
                      } as React.CSSProperties
                    }
                  />
                );
            })}
          </LineChart>
        </ChartContainer>
      ) : (
        <div className="flex h-[240px] items-center justify-center rounded-lg border bg-muted/20 text-muted-foreground text-sm">
          No price history available
        </div>
      )}
    </div>
  );
}
