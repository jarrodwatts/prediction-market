"use client";

/**
 * Market Detail Page
 *
 * Detailed view of a single prediction market.
 * Uses the centralized useMarket hook for data fetching.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MarketHeader } from "@/components/market/market-header";
import { OutcomeLegend } from "@/components/market/outcome-legend";
import { PriceChart } from "@/components/market/price-chart";
import { MarketRules } from "@/components/market/market-rules";
import { MarketTimeline } from "@/components/market/market-timeline";
import { TradePanel } from "@/components/market/trade-panel";
import { TradesPanel } from "@/components/market/trades-panel";
import { useMarket } from "@/lib/hooks/use-markets";

export default function MarketDetailPage() {
  const params = useParams();
  const id = BigInt(params.id as string);
  const [selectedOutcome, setSelectedOutcome] = useState(0);

  // Use centralized market hook
  const { data: market, isLoading, error } = useMarket(id);

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

  // Use actual outcome names from API if available, otherwise fallback to defaults
  const outcomeTitles =
    market.outcomes && market.outcomes.length === market.outcomeCount
      ? market.outcomes
      : market.outcomeCount === 2
        ? ["Yes", "No"]
        : Array.from({ length: market.outcomeCount }).map((_, i) => `Option ${i + 1}`);

  const now = Date.now();
  const closesAtMs = Number(market.closesAt) * 1_000;
  const isClosed = market.state >= 1 || (closesAtMs > 0 && now >= closesAtMs);
  const isResolved = market.state === 2;
  const isReadOnly = isClosed || isResolved;

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
          {/* Market Header + Legend (carded for cohesion) */}
          <div className="rounded-xl border border-border bg-card p-4">
            <MarketHeader market={market} />
            <div className="mt-3">
              <OutcomeLegend outcomes={outcomeTitles} />
            </div>
          </div>

          {/* Price Chart */}
          <div className="rounded-xl border border-border bg-card p-4">
            <PriceChart marketId={market.id} outcomeCount={market.outcomeCount} selectedOutcome={selectedOutcome} outcomeTitles={outcomeTitles} />
          </div>

          {/* Outcomes (Kalshi-style density under chart) - Hidden for now */}
          {/* <div className="rounded-xl border border-border bg-card">
            <button
              onClick={() => setOutcomesExpanded(!outcomesExpanded)}
              className="flex w-full items-center justify-between p-4 text-left"
              type="button"
            >
              <span className="font-semibold">Outcomes</span>
              {outcomesExpanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
            {outcomesExpanded && (
              <div className="divide-y divide-border border-t border-border">
                {outcomeTitles.map((title, idx) => {
                  const pct =
                    market.prices && typeof market.prices[idx] === "number"
                      ? Math.round(market.prices[idx]! * 100)
                      : null;
                  const dot = getOutcomeColor(title, idx);

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: dot }}
                          aria-hidden="true"
                        />
                        <span className="font-medium truncate">{title}</span>
                      </div>

                      <div className="text-base font-semibold tabular-nums">
                        {pct === null ? "—" : `${pct}%`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div> */}

          {/* Rules Section */}
          <MarketRules
            description={`Market Question: ${market.question}\n\nThis market will resolve based on the outcome of the event.`}
          />

          {/* Trades Feed */}
          <TradesPanel
            marketId={market.id}
            outcomes={outcomeTitles}
          />
        </div>

        {/* Right Column - Trade Panel and Timeline */}
        <div className="space-y-6 min-w-0 lg:sticky lg:top-20 lg:self-start" id="trade-panel">
          {isReadOnly ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <TradePanel
                market={market}
                selectedOutcome={selectedOutcome}
                onOutcomeChange={setSelectedOutcome}
                embedded
              />
              <div className="border-t border-border">
                <MarketTimeline market={market} embedded defaultExpanded />
              </div>
            </div>
          ) : (
            <>
              <TradePanel market={market} selectedOutcome={selectedOutcome} onOutcomeChange={setSelectedOutcome} />
              <MarketTimeline market={market} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

