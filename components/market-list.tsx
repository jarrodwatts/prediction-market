"use client";

/**
 * Market List Component
 *
 * Displays a grid of market cards with loading and empty states.
 */

import { MarketCard } from "./market-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { MarketData } from "@/lib/types";

// =============================================================================
// Loading Skeleton
// =============================================================================

function MarketCardSkeleton() {
  return (
    <Card className="h-full flex flex-col overflow-hidden border border-border/50 py-0 gap-0">
      {/* Cover Image Skeleton */}
      <Skeleton className="h-40 w-full rounded-none" />

      <div className="flex flex-1 flex-col px-4 pt-3 pb-2">
        {/* Title Skeleton */}
        <div className="mb-2 space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Outcome Section Skeleton */}
        <div className="flex-1 space-y-2 mt-2">
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>

        {/* Footer Skeleton */}
        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </Card>
  );
}

export function MarketListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <MarketCardSkeleton key={i} />
      ))}
    </div>
  );
}

// =============================================================================
// Market List Component
// =============================================================================

interface MarketListProps {
  markets: MarketData[];
  isLoading?: boolean;
  onMarketClick?: (market: MarketData) => void;
}

export function MarketList({
  markets,
  isLoading,
  onMarketClick
}: MarketListProps) {
  if (isLoading) {
    return <MarketListSkeleton />;
  }

  if (markets.length === 0) {
    return (
      <EmptyState
        title="No markets found"
        description="Try adjusting your filters or check back later."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Market Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {markets.map((market) => (
          <MarketCard 
            key={market.id.toString()} 
            market={market} 
            onClick={onMarketClick ? () => onMarketClick(market) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

