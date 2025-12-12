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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChart3, Clock, Droplets, Trophy } from "lucide-react";
import { formatCompact, formatPricePercent, formatTimeRemaining } from "@/lib/formatters";
import { getOutcomeColor, sortBinaryOutcomes } from "@/lib/outcome-colors";
import type { MarketData } from "@/lib/types";
import { formatEther } from "viem";

// =============================================================================
// Market Card Component
// =============================================================================

interface MarketCardProps {
  market: MarketData;
  onClick?: () => void;
}

function OutcomeRow({
  title,
  price,
  color,
}: {
  title: string;
  price: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, price * 100));

  return (
    <div className="relative overflow-hidden rounded-lg bg-muted/30 px-3 py-2">
      {/* Progress fill */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          // Stronger fill that doesn't "die out" at 100%.
          // Use color-mix so it also works with CSS variables (e.g. var(--chart-1)).
          background: `linear-gradient(90deg,
            color-mix(in srgb, ${color} 32%, transparent) 0%,
            color-mix(in srgb, ${color} 18%, transparent) 70%,
            color-mix(in srgb, ${color} 12%, transparent) 100%
          )`,
        }}
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="text-[13px] font-semibold leading-snug truncate">
            {title}
          </span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatPricePercent(price, 0)}
        </span>
      </div>
    </div>
  );
}

export function MarketCard({ market, onClick }: MarketCardProps) {
  const [imageError, setImageError] = useState(false);

  const isBinary = market.outcomeCount === 2;
  const prices = market.prices;

  const outcomeTitles =
    market.outcomes && market.outcomes.length === market.outcomeCount
      ? market.outcomes
      : market.outcomeCount === 2
        ? ["Yes", "No"]
        : Array.from({ length: market.outcomeCount }).map((_, i) => `Option ${i + 1}`);

  const outcomesForDisplay =
    prices && prices.length === market.outcomeCount
      ? outcomeTitles.map((title, idx) => ({
          id: `outcome_${idx}`,
          title,
          price: prices[idx] ?? 0,
        }))
      : null;

  const binaryOutcomes =
    isBinary && outcomesForDisplay ? sortBinaryOutcomes(outcomesForDisplay) : null;

  const card = (
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
          {/* Creator */}
          {market.creator && (
            <div className="mb-2 flex items-center gap-2">
              <Avatar className="h-6 w-6 border border-border/60">
                <AvatarImage src={market.creator.imageUrl} alt={market.creator.name} />
                <AvatarFallback className="text-[10px]">
                  {(market.creator.name || "S").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {market.creator.url ? (
                <button
                  type="button"
                  className="text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors truncate"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(market.creator!.url!, "_blank", "noreferrer");
                  }}
                >
                  {market.creator.name}
                </button>
              ) : (
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {market.creator.name}
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <div className="mb-2">
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors">
              {market.question}
            </h3>
          </div>

          {/* Outcome Section */}
          <div className="flex-1">
            {outcomesForDisplay ? (
              <div className="mt-3 space-y-2">
                {isBinary && binaryOutcomes ? (
                  <>
                    <OutcomeRow
                      title={binaryOutcomes[0].title}
                      price={binaryOutcomes[0].price}
                      color={getOutcomeColor(binaryOutcomes[0].title, 0)}
                    />
                    <OutcomeRow
                      title={binaryOutcomes[1].title}
                      price={binaryOutcomes[1].price}
                      color={getOutcomeColor(binaryOutcomes[1].title, 1)}
                    />
                  </>
                ) : (
                  (() => {
                    const sorted = [...outcomesForDisplay].sort(
                      (a, b) => b.price - a.price
                    );
                    const top = sorted.slice(0, 3);
                    const remaining = Math.max(0, sorted.length - top.length);

                    return (
                      <>
                        {top.map((o, idx) => (
                          <OutcomeRow
                            key={o.id}
                            title={o.title}
                            price={o.price}
                            color={getOutcomeColor(o.title, idx)}
                          />
                        ))}
                        {remaining > 0 && (
                          <div className="px-1 text-xs text-muted-foreground">
                            +{remaining} more outcome{remaining === 1 ? "" : "s"}
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-center text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4" />
                  <span>
                    Liq: {formatCompact(Number(formatEther(market.liquidity)), { prefix: "" })} ETH
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs font-medium text-muted-foreground">
            {/* Volume */}
            <div className="flex items-center gap-4">
              <span className="text-foreground/80 tabular-nums flex items-center gap-1">
                <Trophy className="w-3 h-3" />
                {formatCompact(Number(formatEther(market.balance)), { prefix: '' })} Vol
              </span>
              <span className="text-muted-foreground tabular-nums hidden sm:flex items-center gap-1">
                <Droplets className="w-3 h-3" />
                {formatCompact(Number(formatEther(market.liquidity)), { prefix: '' })} Liq
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
  );

  // Use onClick if provided (for Dialog), otherwise Link (for Page)
  if (onClick) {
    return (
      <div onClick={onClick} className="cursor-pointer h-full">
        {card}
      </div>
    );
  }

  return (
    <Link href={`/markets/${market.id}`} className="block h-full">
      {card}
    </Link>
  );
}
