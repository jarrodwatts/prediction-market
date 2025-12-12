"use client";

import { Input } from "@/components/ui/input";
import { Clock, Search, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarketFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sort: "volume" | "createdAt";
  onSortChange: (sort: "volume" | "createdAt") => void;
}

export function MarketFilters({
  searchQuery,
  onSearchChange,
  sort,
  onSortChange,
}: MarketFiltersProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search markets..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-1 p-1 bg-muted/30 rounded-lg border border-border/40 w-full md:w-auto overflow-x-auto">
        <button
          onClick={() => onSortChange("createdAt")}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex-1 md:flex-initial whitespace-nowrap",
            sort === "createdAt"
              ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>New</span>
        </button>
        <button
          onClick={() => onSortChange("volume")}
          className={cn(
            "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex-1 md:flex-initial whitespace-nowrap",
            sort === "volume"
              ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          <span>Popular</span>
        </button>
      </div>
    </div>
  );
}

