"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useMarketHistory } from "@/lib/hooks/use-markets";
import { getOutcomeColor } from "@/lib/outcome-colors";
import { formatDynamicChartDate, formatTooltipDate } from "@/lib/formatters";
import { Loader2 } from "lucide-react";

type TimeFrame = "24h" | "7d" | "30d" | "all";

interface PriceChartProps {
  marketId: bigint;
  outcomeCount: number;
  selectedOutcome?: number;
  outcomeTitles?: string[];
}

export function PriceChart({ marketId, outcomeCount, selectedOutcome = 0, outcomeTitles }: PriceChartProps) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("all");

  // Use centralized market history hook
  const { data: chartData, isLoading } = useMarketHistory(marketId);

  // Use a stable reference for current time to satisfy purity rules
  const [now] = useState(() => Date.now());

  // Filter data based on timeframe
  const filteredData = useMemo(() => {
      if (!chartData) return [];
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
              });
          }
      }

      return filtered;
  }, [chartData, timeFrame, now]);

  // Helper to get outcome title
  const getOutcomeTitle = (index: number) => {
    if (outcomeTitles && outcomeTitles[index]) return outcomeTitles[index];
    if (outcomeCount === 2) return index === 0 ? "Yes" : "No";
    return `Option ${index + 1}`;
  };

  // Build chart config
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    Array.from({ length: outcomeCount }).forEach((_, index) => {
      const title = getOutcomeTitle(index);
      config[`outcome_${index}`] = {
        label: title,
        color: getOutcomeColor(title, index),
      };
    });
    return config;
  }, [outcomeCount, outcomeTitles]);

  const hasData = filteredData.length > 0;
  const lastIdx = filteredData.length - 1;

  const selectedKey = `outcome_${selectedOutcome}`;
  const selectedPct = hasData
    ? Math.round((((filteredData[lastIdx] as Record<string, unknown>)?.[selectedKey] as number) ?? 0) * 100)
    : null;

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
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold tabular-nums">
              {selectedPct === null ? "—" : `${selectedPct}%`}
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {getOutcomeTitle(selectedOutcome)}
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
            margin={{ top: 10, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.28} />
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
                const outcomeTitle = getOutcomeTitle(index);
                return (
                  <Line
                    key={index}
                    type="monotone"
                    dataKey={`outcome_${index}`}
                    stroke={`var(--color-outcome_${index})`}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeOpacity={isSelected ? 1 : 0.55}
                    dot={(dotProps: any) => {
                      // Render a label at the last data point (Kalshi-style).
                      if (!hasData) return null;
                      if (dotProps.index !== lastIdx) return null;

                      const cx = dotProps.cx as number | undefined;
                      const cy = dotProps.cy as number | undefined;
                      const v = dotProps.value as number | undefined;
                      if (cx == null || cy == null || typeof v !== "number") return null;

                      const pct = Math.round(v * 100);
                      const dy = index % 2 === 0 ? -10 : 16;

                      return (
                        <g>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={2.5}
                            fill={`var(--color-outcome_${index})`}
                          />
                          <text
                            x={cx}
                            y={cy}
                            dx={-10}
                            dy={dy}
                            textAnchor="end"
                            fontSize={12}
                            fontWeight={600}
                            fill={`var(--color-outcome_${index})`}
                          >
                            {outcomeTitle} {pct}%
                          </text>
                        </g>
                      );
                    }}
                    style={
                      {
                        filter: isSelected ? `drop-shadow(0 4px 6px var(--color-outcome_${index}))` : 'none',
                        zIndex: isSelected ? 10 : 0,
                      } as CSSProperties
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
