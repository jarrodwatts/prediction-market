"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface MarketFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function MarketFilters({ searchQuery, onSearchChange }: MarketFiltersProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
    </div>
  );
}

