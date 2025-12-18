"use client";

/**
 * Dashboard View
 *
 * Main dashboard displaying active prediction markets.
 * Refactored to use the centralized useMarkets hook.
 */

import { useState, useMemo } from "react";
import { MarketList } from "@/components/market-list";
import { MarketFilters } from "@/components/market-filters";
import { CreateMarketDialog } from "@/components/create-market-dialog";
import { useMarkets } from "@/lib/hooks/use-markets";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DashboardView() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<"volume" | "createdAt">("createdAt");

  // Use the centralized markets hook
  const { data: markets, isLoading } = useMarkets();

  // Use a stable reference for current time to satisfy purity rules
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const nowSeconds = BigInt(now);

  // Filter and sort markets
  const filteredMarkets = useMemo(() => {
    if (!markets) return [];
    
    return markets
      .filter((market) => {
        // Only show active markets on homepage: open and not past close time.
        // state: 0 Open, 1 Closed, 2 Resolved
        if (market.state !== 0) return false;
        return market.closesAt > nowSeconds;
      })
      .filter((market) =>
        market.question.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        if (sort === "volume") return Number(b.totalPot - a.totalPot);
        return Number(b.createdAt - a.createdAt);
      });
  }, [markets, searchQuery, sort]);

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
