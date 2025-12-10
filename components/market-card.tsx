"use client";

/**
 * Market Card Component
 *
 * Displays a market preview with:
 * - Full-width cover image
 * - Probability Bar (for binary markets)
 * - Outcome Buttons (Yes/No)
 * - Volume and liquidity stats in footer
 */

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Clock, Droplets, Trophy } from "lucide-react";
import { formatCompact, formatTimeRemaining } from "@/lib/formatters";
import type { MarketData } from "@/lib/types";
import { formatEther } from "viem";

// =============================================================================
// Market Card Component
// =============================================================================

interface MarketCardProps {
  market: MarketData;
  onClick?: () => void;
}

export function MarketCard({ market, onClick }: MarketCardProps) {
  const [imageError, setImageError] = useState(false);

  // Use onClick if provided (for Dialog), otherwise Link (for Page)
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    if (onClick) {
      return <div onClick={onClick} className="cursor-pointer h-full">{children}</div>;
    }
    return <Link href={`/markets/${market.id}`} className="block h-full">{children}</Link>;
  };

  return (
    <Wrapper>
      <Card className="group h-full flex flex-col overflow-hidden border border-border/50 bg-card py-0 gap-0 transition-all hover:border-primary/50 hover:shadow-lg dark:hover:shadow-primary/5 hover:-translate-y-1 duration-300">
        {/* Cover Image Area */}
        <div className="relative h-40 w-full z-0">
          {/* Ambient Glow Effect */}
          {market.image && !imageError && (
            <div className="absolute inset-0 -z-10 overflow-visible">
              <Image
                src={market.image}
                alt=""
                fill
                className="object-cover blur-2xl scale-110 opacity-30 dark:scale-125 dark:opacity-60 saturate-150 dark:saturate-200 brightness-125 dark:brightness-100 contrast-75 dark:contrast-100"
                aria-hidden="true"
              />
            </div>
          )}

          <div className="relative h-full w-full overflow-hidden bg-muted/50 rounded-t-xl">
            {market.image && !imageError ? (
              <Image
                src={market.image}
                alt={market.question}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105 will-change-transform"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-muted to-muted/80">
                <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
              </div>
            )}
            {/* Hover gradient overlay */}
            <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col px-4 pt-3 pb-2 relative z-10 -mt-px bg-background/40 backdrop-blur-[2px]">
          {/* Title */}
          <div className="h-10 mb-2 flex items-center">
            <h3 className="line-clamp-2 text-base font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
              {market.question}
            </h3>
          </div>

          {/* Outcome Section Placeholder */}
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
             {/* We don't have price data in the list view yet, so we show simple stats */}
             <div className="flex gap-4">
                <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4" />
                    <span>Liq: {formatCompact(Number(formatEther(market.liquidity)), { prefix: '' })} ETH</span>
                </div>
             </div>
          </div>

          {/* Footer Stats */}
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs font-medium text-muted-foreground">
            {/* Volume */}
            <div className="flex items-center gap-4">
              <span className="text-foreground/80 tabular-nums flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {formatCompact(Number(formatEther(market.balance)), { prefix: '' })} Vol
              </span>
            </div>

            {/* Right: Date/Time */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatTimeRemaining(market.closesAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}
