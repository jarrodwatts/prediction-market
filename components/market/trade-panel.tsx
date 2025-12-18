"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, DollarSign, Wallet, Coins, Lock, Clock } from "lucide-react";
import { useReadContract, useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseAbiItem } from "viem";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import type { MarketData } from "@/lib/types";
import { getOutcomeColor, getOutcomeClasses } from "@/lib/outcome-colors";
import { cn } from "@/lib/utils";
import { useMarketAction } from "@/lib/hooks/use-market-actions";
import { useTradingPanel } from "@/lib/hooks/use-trading-panel";
import { queryKeys } from "@/lib/query-keys";
import { USDC, formatUSDC } from "@/lib/tokens";
import { TRADING } from "@/lib/constants";
import { useCountdown, formatCountdown } from "@/lib/hooks/use-countdown";

interface TradePanelProps {
  market: MarketData;
  selectedOutcome: number;
  onOutcomeChange: (outcome: number) => void;
  embedded?: boolean;
  /** Visual variant - 'compact' for overlay, 'default' for main app */
  variant?: 'default' | 'compact';
  /** Quick amount button mode - 'percentage' (25%/50%/100%) or 'fixed' ($10/$25/$50) */
  quickAmountMode?: 'percentage' | 'fixed';
  /** Show countdown timer in header */
  showCountdown?: boolean;
  /** Unix timestamp for countdown (overrides market.closesAt) */
  closesAt?: number;
  /** Callback when bet is successfully placed */
  onBetSuccess?: () => void;
  /** Callback when winnings/refund is successfully claimed */
  onClaimSuccess?: () => void;
  /** Sort outcomes by price (default: true). Set to false for overlay to prevent jumping. */
  sortOutcomes?: boolean;
  /** Whether the market is currently being created */
  isPending?: boolean;
}

export function TradePanel({
  market,
  selectedOutcome,
  onOutcomeChange,
  embedded = false,
  variant = 'default',
  quickAmountMode = 'percentage',
  showCountdown = false,
  closesAt,
  onBetSuccess,
  onClaimSuccess,
  sortOutcomes = true,
  isPending = false,
}: TradePanelProps) {
  const [amount, setAmount] = useState("");
  
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const totalFeeBps = BigInt(market.protocolFeeBps + market.creatorFeeBps);

  // Shared trading panel hook for contract reads and calculations
  const {
    pools,
    userShares,
    usdcBalance,
    balanceFormatted,
    outcomePrices,
    estimatedPayout: simulatedPayout,
    needsApproval,
    hasAnyPosition,
    positionsByOutcome: positionIndices,
    isLoadingPools,
    refetchPools,
  } = useTradingPanel({
    marketId: market.id,
    outcomeCount: market.outcomeCount,
    totalFeeBps,
    selectedOutcome,
    amount,
    enableEvents: true,
  });

  // Countdown timer for market close
  const closesAtUnix = closesAt ?? Number(market.closesAt);
  const remainingSeconds = useCountdown(closesAtUnix > 0 ? closesAtUnix : null);
  const timeRemaining = closesAtUnix <= 0 ? null : remainingSeconds <= 0 ? 'Closed' : formatCountdown(remainingSeconds);

  const marketAction = useMarketAction(market.id, {
    onSuccess: () => {
      setAmount("");
      // Force immediate refetch of pools to update odds
      refetchPools();
      onBetSuccess?.();
    },
  });

  // Claimable amount (specific to resolved markets - not in shared hook)
  const { data: claimableData } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getClaimableAmount',
    args: [market.id, address!],
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 5_000,
    }
  });

  const userOutcomeShares = userShares ?? [];
  const claimableAmount = claimableData ? claimableData[0] : 0n;
  const canClaim = claimableData ? claimableData[1] : false;

  const resolvedOutcomeIdx = Number(market.resolvedOutcome);
  const isResolved = market.state === 2;
  const isVoided = market.state === 3;

  // Track if winnings have been claimed
  const { data: hasClaimedWinnings } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'hasClaimed',
    args: [market.id, BigInt(resolvedOutcomeIdx), address!],
    query: {
      enabled: isConnected && !!address && isResolved && !isVoided,
    }
  });

  // Get market contract data for payout calculation
  const { data: marketContractData } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'markets',
    args: [market.id],
    query: {
      enabled: isResolved && !isVoided,
    }
  });
  const payoutPerShare = marketContractData?.[6] ?? 0n; // Index 6 is payoutPerShare

  // Track if we've loaded pools at least once - prevents skeleton flash during refetches
  const hasLoadedPoolsRef = useRef(false);
  useEffect(() => {
    if (!isLoadingPools && pools !== undefined) {
      hasLoadedPoolsRef.current = true;
    }
  }, [isLoadingPools, pools]);

  // Only show skeleton on FIRST load before any pools data arrives
  // Once loaded, never show skeleton again regardless of refetch state
  const pricesLoaded = (pools?.length ?? 0) > 0;
  const showOutcomeSkeleton = !hasLoadedPoolsRef.current && !pricesLoaded && isLoadingPools;

  const outcomeTitles = market.outcomes && market.outcomes.length === market.outcomeCount
    ? market.outcomes
    : market.outcomeCount === 2
      ? ["Yes", "No"]
      : Array.from({ length: market.outcomeCount }).map((_, i) => `Option ${i + 1}`);

  if (isPending) {
    return (
      <div className={cn(
        "h-full w-full bg-card",
        embedded ? "" : "border border-border rounded-xl p-4 sm:p-6"
      )}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating market...
        </div>
        <h2 className="font-semibold mb-4">{market.question}</h2>
        <div className="space-y-2">
          {outcomeTitles.map((title, idx) => (
            <div 
              key={idx} 
              className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30 opacity-60"
            >
              <div className="flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: getOutcomeColor(title, idx) }} 
                />
                <span className="font-medium">{title}</span>
              </div>
              <span className="font-mono text-muted-foreground">50.0%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sortedOutcomes = useMemo(() => {
    const outcomes = outcomeTitles.map((title, idx) => ({ title, idx, price: outcomePrices[idx] ?? 0 }));
    // Only sort by price if sortOutcomes is enabled (default for main app, disabled for overlay)
    return sortOutcomes ? outcomes.sort((a, b) => b.price - a.price) : outcomes;
  }, [outcomeTitles, outcomePrices, sortOutcomes]);

  const handleBet = () => {
    if (!amount) return;
    marketAction.bet(selectedOutcome, amount, needsApproval, outcomeTitles[selectedOutcome]);
  };

  const handleClaimWinnings = useCallback(async () => {
    await marketAction.claimWinnings();
    onClaimSuccess?.();
  }, [marketAction, onClaimSuccess]);

  const handleClaimRefund = useCallback(async () => {
    const outcomeIdx = userOutcomeShares.findIndex((s: bigint) => s > 0n);
    if (outcomeIdx === -1) return;
    await marketAction.claimRefund(outcomeIdx);
    onClaimSuccess?.();
  }, [userOutcomeShares, marketAction, onClaimSuccess]);

  const handlePercentageClick = (percentage: number) => {
    if (usdcBalance) {
      const value = Number(formatUSDC(usdcBalance)) * percentage;
      setAmount(value.toFixed(2));
    }
  };

  const handleFixedAmountClick = (amt: number) => {
    setAmount(amt.toString());
  };

  const now = Date.now();
  const closesAtMs = Number(market.closesAt) * 1_000;
  const isClosed = market.state >= 1 || (closesAtMs > 0 && now >= closesAtMs);
  const hasWinningShares = isResolved && !isVoided && userOutcomeShares[resolvedOutcomeIdx] > 0n;
  const hasVoidedShares = isVoided && userOutcomeShares.some((s: bigint) => s > 0n);
  const winningOutcomeName = isResolved && !isVoided ? (outcomeTitles[resolvedOutcomeIdx] ?? "Unknown") : "";

  const claimableWinnings = useMemo(() => {
    if (!isResolved) return 0n;
    return claimableAmount;
  }, [isResolved, claimableAmount]);

  const { data: userCashflow, isLoading: isLoadingCashflow } = useQuery({
    queryKey: queryKeys.user.cashflow(market.id.toString(), address?.toLowerCase() ?? ""),
    enabled: !!publicClient && isConnected && !!address && (isClosed || isResolved),
    queryFn: async () => {
      if (!publicClient || !address) {
        return { betOut: 0n, winningsIn: 0n };
      }

      const event = parseAbiItem(
        "event BetPlaced(uint256 indexed marketId, address indexed user, uint256 indexed outcomeId, uint256 amount)"
      );

      let logs = [];
      try {
        logs = await publicClient.getLogs({
          address: PREDICTION_MARKET_ADDRESS,
          event,
          args: { user: address, marketId: market.id },
          fromBlock: "earliest",
        });
      } catch {
        const marketLogs = await publicClient.getLogs({
          address: PREDICTION_MARKET_ADDRESS,
          event,
          args: { marketId: market.id },
          fromBlock: "earliest",
        });
        const addr = address.toLowerCase();
        logs = marketLogs.filter((l: { args?: { user?: string } }) => String(l.args?.user ?? "").toLowerCase() === addr);
      }

      let betOut = 0n;
      for (const log of logs) {
        betOut += log.args?.amount ?? 0n;
      }

      // Check for claimed winnings
      const claimEvent = parseAbiItem(
        "event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount)"
      );
      
      let winningsIn = 0n;
      try {
        const claimLogs = await publicClient.getLogs({
          address: PREDICTION_MARKET_ADDRESS,
          event: claimEvent,
          args: { user: address, marketId: market.id },
          fromBlock: "earliest",
        });
        for (const log of claimLogs) {
          winningsIn += log.args?.amount ?? 0n;
        }
      } catch {}

      return { betOut, winningsIn };
    },
    staleTime: 20_000,
    refetchInterval: isResolved ? 0 : 10_000,
  });

  const formatMoney = (v: bigint) => `$${parseFloat(formatUnits(v, USDC.decimals)).toFixed(2)}`;

  // Calculate user's total position (shares) as their "bet" amount
  // This is more reliable than event logs which can fail
  const totalUserShares = userOutcomeShares.reduce((sum: bigint, s: bigint) => sum + s, 0n);

  // Calculate what user received (works before AND after claiming)
  const userWinningShares = userOutcomeShares[resolvedOutcomeIdx] ?? 0n;
  const calculatedPayout = payoutPerShare > 0n
    ? (userWinningShares * payoutPerShare) / BigInt(1e18)
    : 0n;

  // Use event-based betOut if available, otherwise fall back to shares
  const netSpent = (userCashflow?.betOut && userCashflow.betOut > 0n)
    ? userCashflow.betOut
    : totalUserShares;
  
  // Use calculated payout as "received" - this works regardless of claim status
  // For resolved markets, use calculated payout; for voided, use net spent (refund)
  const netReceivedInclClaimable = isResolved 
    ? calculatedPayout 
    : isVoided 
      ? netSpent 
      : 0n;
  const netPnl = netReceivedInclClaimable - netSpent;
  const absPnl = netPnl < 0n ? -netPnl : netPnl;
  const pnlTone = netPnl > 0n ? "win" : netPnl < 0n ? "loss" : "even";

  // Show PnL story if user has any position (shares) - don't wait for cashflow query
  const showPnlStory =
    isResolved &&
    !isVoided &&
    (totalUserShares > 0n || netReceivedInclClaimable > 0n);

  if (isClosed || isResolved || isVoided) {
    return (
      <div className={cn(
        embedded ? "" : "border border-border rounded-xl bg-card overflow-hidden"
      )}>
        <div className="border-b border-border bg-transparent p-4">
          <div className="flex items-center gap-2">
            {isResolved || isVoided ? (
              isVoided ? (
                <Lock className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Coins className="w-4 h-4 text-yellow-500" />
              )
            ) : (
              <Lock className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">
              {isVoided ? "Market Canceled" : isResolved ? "Market Resolved" : "Market Closed"}
            </span>
            {isResolved && !isVoided && (
              <span className={cn(
                "ml-auto text-sm font-semibold", 
                resolvedOutcomeIdx === 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {winningOutcomeName} wins
              </span>
            )}
          </div>
        </div>

        <div className={cn("w-full", variant === 'compact' ? "p-4" : "p-4 sm:p-6")}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isVoided 
                ? "This prediction was canceled. You can reclaim your original bet."
                : isResolved 
                  ? "This market has been finalized." 
                  : "Prediction period closed, awaiting final outcome."}
            </p>

            {showPnlStory && !isVoided && (
              <div className={cn(
                "rounded-lg border px-3 sm:px-4 py-3 sm:py-4",
                pnlTone === "win" && "border-emerald-500/25 bg-linear-to-br from-emerald-500/10 via-transparent to-emerald-500/15",
                pnlTone === "loss" && "border-red-500/25 bg-linear-to-br from-red-500/10 via-transparent to-red-500/15",
                pnlTone === "even" && "border-border/60 bg-muted/10"
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={cn(
                      "text-sm font-semibold",
                      pnlTone === "win" && "text-emerald-500",
                      pnlTone === "loss" && "text-red-500"
                    )}>
                      {pnlTone === "win" ? "You won" : pnlTone === "loss" ? "You lost" : "You broke even"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Resolved to <span className="font-medium text-foreground">{winningOutcomeName}</span>.
                      {claimableWinnings > 0n ? " (Includes unclaimed winnings)" : ""}
                    </div>
                  </div>
                  <div className={cn(
                    "text-right font-mono text-2xl font-bold leading-none tabular-nums",
                    pnlTone === "win" && "text-emerald-500",
                    pnlTone === "loss" && "text-red-500",
                    pnlTone === "even" && "text-foreground"
                  )}>
                    {pnlTone === "loss" ? "-" : pnlTone === "win" ? "+" : ""}
                    {formatMoney(absPnl)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-muted-foreground">
                    <span>Bet</span>
                    <span className="font-mono text-foreground">{formatMoney(netSpent)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-2 text-muted-foreground">
                    <span>Received</span>
                    <span className="font-mono text-foreground">{formatMoney(netReceivedInclClaimable)}</span>
                  </div>
                </div>
              </div>
            )}

            {!showPnlStory && hasAnyPosition && (
              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Your bets
                  </span>
                </div>
                
                <div className={cn(
                  "gap-2",
                  positionIndices.length > 1 ? "grid grid-cols-2" : "grid grid-cols-1"
                )}>
                  {positionIndices.map(({ shares, idx }: { shares: bigint; idx: number }) => {
                    const title = outcomeTitles[idx] ?? `Outcome ${idx + 1}`;
                    const baseColor = getOutcomeColor(title, idx);
                    return (
                      <div 
                        key={idx}
                        className="relative overflow-hidden rounded-lg px-3 py-2.5"
                        style={{
                          borderColor: `${baseColor}40`,
                          borderWidth: '1px',
                          background: `linear-gradient(to bottom right, ${baseColor}15, transparent, ${baseColor}20)`
                        }}
                      >
                        <div 
                          className="absolute inset-0 opacity-60" 
                          style={{ background: `linear-gradient(to top, ${baseColor}15, transparent)` }}
                        />
                        <div className="relative flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{title}</span>
                          <span 
                            className="text-base font-mono font-semibold"
                            style={{ color: baseColor }}
                          >
                            ${parseFloat(formatUnits(shares, USDC.decimals)).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(hasWinningShares || hasVoidedShares) && (
              <div className="space-y-2">
                {hasWinningShares && canClaim && (
                  <Button 
                    onClick={handleClaimWinnings}
                    disabled={marketAction.isLoading}
                    className={cn(
                      "w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02]",
                      marketAction.isLoading
                        ? "bg-muted text-muted-foreground opacity-100 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    )}
                  >
                    {marketAction.isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Coins className="mr-2 h-5 w-5" />}
                    Claim Winnings
                  </Button>
                )}
                
                {hasVoidedShares && (
                  <Button 
                    onClick={handleClaimRefund}
                    disabled={marketAction.isLoading}
                    className={cn(
                      "w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02]",
                      marketAction.isLoading && "bg-muted text-muted-foreground opacity-100 cursor-not-allowed"
                    )}
                  >
                    {marketAction.isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Coins className="mr-2 h-5 w-5" />}
                    Reclaim Funds
                  </Button>
                )}
              </div>
            )}

            {!userOutcomeShares.some((s: bigint) => s > 0n) && (
              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground border border-border/50">
                <p>You have no bets in this market.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "border border-border rounded-xl bg-card overflow-hidden",
      embedded && "border-0"
    )}>
      <div className="border-b border-border bg-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span className="font-medium">Place Bet</span>
          </div>
          {showCountdown && timeRemaining && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{timeRemaining}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 w-full">
        <div className="space-y-4">
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground mb-1">Select outcome</Label>
            {showOutcomeSkeleton ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: market.outcomeCount }).map((_, idx) => (
                  <div key={idx} className="h-12 rounded-lg border border-border bg-card/50 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedOutcomes.map(({ title, idx, price }) => {
                  const isSelected = selectedOutcome === idx;
                  const colors = getOutcomeClasses(title);
                  const baseColor = getOutcomeColor(title, idx);
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => onOutcomeChange(idx)}
                      className={cn(
                        "relative flex items-center justify-between p-3 rounded-lg border transition-all duration-200 w-full",
                        isSelected 
                          ? "border-transparent ring-2 ring-offset-1 ring-offset-background" 
                          : "border-border hover:border-border/80 bg-card/50",
                        isSelected ? colors.bgLight : ""
                      )}
                      style={{
                        boxShadow: isSelected ? `0 0 0 2px ${baseColor}` : undefined
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div 
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: baseColor }}
                        />
                        <span className="font-medium truncate">{title}</span>
                      </div>
                      <span className="font-mono font-medium ml-2 shrink-0">
                        {(price * 100).toFixed(1)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm text-muted-foreground">Amount (USDC)</Label>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wallet className="w-3 h-3" />
                <span>Balance: {balanceFormatted.toFixed(2)} USDC</span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[120px]">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1 shrink-0">
                {quickAmountMode === 'fixed' ? (
                  TRADING.BET_AMOUNTS.map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => handleFixedAmountClick(amt)}
                      className={cn(
                        "px-2 min-w-12",
                        amount === amt.toString() && "border-primary bg-primary/10 text-primary"
                      )}
                    >
                      ${amt}
                    </Button>
                  ))
                ) : (
                  TRADING.PERCENTAGE_OPTIONS.map((pct) => (
                    <Button
                      key={pct}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePercentageClick(pct)}
                      className="px-2 min-w-12"
                    >
                      {pct * 100}%
                    </Button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-0">
            <Button 
              className={cn(
                "w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02]",
                (marketAction.isLoading || !amount)
                  ? "bg-muted text-muted-foreground opacity-100 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              )}
              onClick={handleBet} 
              disabled={marketAction.isLoading || !amount}
            >
              {marketAction.isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                "Place Bet"
              )}
            </Button>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Current odds</span>
                <span className="text-foreground">
                  {outcomePrices[selectedOutcome] > 0
                    ? `${(outcomePrices[selectedOutcome] * 100).toFixed(1)}%`
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Potential return</span>
                <span className="font-medium text-foreground">
                  {simulatedPayout > 0n && amount && Number(amount) > 0
                    ? `$${Number(formatUnits(simulatedPayout, USDC.decimals)).toFixed(2)} (${(Number(formatUnits(simulatedPayout, USDC.decimals)) / Number(amount)).toFixed(2)}x)`
                    : '-'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground/70">Final payout depends on total bets at resolution</p>
            </div>
          </div>

          {hasAnyPosition && (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your current bets
              </span>
              <div className="flex flex-wrap gap-2">
                {positionIndices.map(({ shares, idx }: { shares: bigint; idx: number }) => {
                  const title = outcomeTitles[idx] ?? `Outcome ${idx + 1}`;
                  const baseColor = getOutcomeColor(title, idx);
                  return (
                    <div 
                      key={idx}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs"
                      style={{
                        backgroundColor: `${baseColor}15`,
                        borderColor: `${baseColor}30`,
                        borderWidth: '1px',
                      }}
                    >
                      <span className="text-muted-foreground">{title}:</span>
                      <span className="font-mono font-medium" style={{ color: baseColor }}>
                        ${parseFloat(formatUnits(shares, USDC.decimals)).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
