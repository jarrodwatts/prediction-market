"use client";

/**
 * Trades Panel Component
 *
 * Collapsible panel showing live feed of bets placed on a market.
 * Supports real-time updates via WebSocket.
 */

import { useState, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { useChainId } from "wagmi";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useMarketTrades, Trade } from "@/lib/hooks/use-market-trades";
import { useAbsProfiles } from "@/lib/hooks/use-abs-profiles";
import { getExplorerTxUrl } from "@/lib/explorer";
import { formatTimeAgo } from "@/lib/formatters";
import { formatCompact } from "@/lib/formatters";
import { getOutcomeColor } from "@/lib/outcome-colors";

interface TradesPanelProps {
  marketId: bigint;
  outcomes: string[];
  defaultExpanded?: boolean;
}

export function TradesPanel({
  marketId,
  outcomes,
  defaultExpanded = true,
}: TradesPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const chainId = useChainId();

  // Fetch trades
  const { trades, isLoading } = useMarketTrades({ marketId, enabled: isExpanded });

  // Get unique addresses for profile fetching
  const addresses = trades.map((t) => t.user);
  const { profiles } = useAbsProfiles(addresses);

  // Force re-render for relative timestamps every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isExpanded) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [isExpanded]);

  const getProfile = useCallback(
    (address: string) => profiles.get(address.toLowerCase()),
    [profiles]
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
        type="button"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold">Trades</span>
          {trades.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {trades.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : trades.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No trades yet
            </div>
          ) : (
            <>
              {/* Column Headers */}
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30">
                <span>Account</span>
                <span>Outcome</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Time</span>
                <span className="w-4" />
              </div>

              {/* Trades List */}
              <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
                {trades.map((trade) => (
                  <TradeRow
                    key={trade.txHash}
                    trade={trade}
                    profile={getProfile(trade.user)}
                    outcomeName={outcomes[trade.outcomeId] ?? `Option ${trade.outcomeId + 1}`}
                    outcomeColor={getOutcomeColor(
                      outcomes[trade.outcomeId] ?? "",
                      trade.outcomeId
                    )}
                    chainId={chainId}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface TradeRowProps {
  trade: Trade;
  profile: { name: string | null; profilePictureUrl: string | null } | null | undefined;
  outcomeName: string;
  outcomeColor: string;
  chainId: number;
}

function TradeRow({ trade, profile, outcomeName, outcomeColor, chainId }: TradeRowProps) {
  // Use profile name if it exists and isn't just the address
  const profileName = profile?.name;
  const isNameJustAddress = profileName?.startsWith("0x") && profileName.length === 42;
  const truncatedAddress = `${trade.user.slice(0, 4)}...${trade.user.slice(-4)}`;
  const displayName = (profileName && !isNameJustAddress) ? profileName : truncatedAddress;
  const avatarUrl = profile?.profilePictureUrl;
  const txUrl = getExplorerTxUrl(trade.txHash, chainId);
  // Convert from 6 decimals (USDC)
  const amount = Number(trade.amount) / 1_000_000;

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center px-4 py-2.5 hover:bg-muted/50 transition-colors">
      {/* Account */}
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-6 w-6 shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarImage
            src={`https://avatar.vercel.sh/${trade.user}`}
            alt="Avatar"
          />
          <AvatarFallback className="text-[10px]">
            {trade.user.slice(2, 4).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{displayName}</span>
      </div>

      {/* Outcome */}
      <div className="min-w-0">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium truncate"
          style={{
            backgroundColor: `${outcomeColor}20`,
            color: outcomeColor,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: outcomeColor }}
          />
          <span className="truncate">{outcomeName}</span>
        </span>
      </div>

      {/* Amount */}
      <span className="text-sm font-medium tabular-nums text-right">
        {formatCompact(amount)}
      </span>

      {/* Time */}
      <span className="text-xs text-muted-foreground text-right whitespace-nowrap">
        {formatTimeAgo(trade.timestamp)}
      </span>

      {/* Tx Link */}
      <a
        href={txUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title="View transaction"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
