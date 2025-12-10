"use client";

/**
 * Market Header Component
 *
 * Displays the market title, image, volume, and expiry information.
 * Used at the top of the market detail page.
 */

import { useState } from "react";
import Image from "next/image";
import { formatCompact, formatTimeRemaining, formatShortDate } from "@/lib/formatters";
import type { MarketData } from "@/lib/types";
import { formatEther } from "viem";
import { Trophy, BarChart3 } from "lucide-react";

interface MarketHeaderProps {
  market: MarketData;
}

export function MarketHeader({ market }: MarketHeaderProps) {
  const [imageError, setImageError] = useState(false);
  
  // Check if market has ended
  const now = Date.now();
  const closesAtMs = Number(market.closesAt) * 1000;
  const isEnded = market.state >= 1 || (closesAtMs > 0 && now >= closesAtMs);
  const timeRemaining = formatTimeRemaining(market.closesAt);

  return (
    <div className="flex items-start gap-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {market.image && !imageError ? (
          <Image
            src={market.image}
            alt={market.question}
            fill
            className="object-cover"
            sizes="56px"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <BarChart3 className="h-6 w-6 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight">{market.question}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">
              {formatCompact(Number(formatEther(market.volume || 0n)), { prefix: '' })} Vol
            </span>
          </span>
          <span>|</span>
          <span>{isEnded ? "Ended" : `Ends ${timeRemaining}`}</span>
          <span>|</span>
          <span>Published {formatShortDate(new Date(Number(market.createdAt) * 1000).toISOString())}</span>
        </div>
      </div>
    </div>
  );
}

