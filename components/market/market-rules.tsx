"use client";

/**
 * Market Rules Component
 *
 * Expandable section displaying market rules/description.
 */

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface MarketRulesProps {
  description?: string;
  defaultExpanded?: boolean;
}

export function MarketRules({
  description,
  defaultExpanded = true,
}: MarketRulesProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
        type="button"
      >
        <span className="font-semibold">Rules</span>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {description || "No rules specified for this market."}
        </div>
      )}
    </div>
  );
}

