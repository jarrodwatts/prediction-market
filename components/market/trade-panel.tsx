"use client";

/**
 * Trade Panel Component
 * 
 * Interactive panel for buying and selling outcomes using USDC.
 */

import { useState, useMemo, useEffect } from "react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsContents,
} from "@/components/animate-ui/components/animate/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, DollarSign, Wallet, Droplets, Coins, ArrowDownToLine } from "lucide-react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useAccount, useSendCalls, useCallsStatus } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, formatUnits, encodeFunctionData } from "viem";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { abstractTestnet } from "@/lib/wagmi";
import { calcBuyAmount, calcSellAmount, getPrice } from "@/lib/market-math";
import type { MarketData } from "@/lib/types";
import { getOutcomeColor, getOutcomeClasses } from "@/lib/outcome-colors";
import { formatShares } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useTransactionToast } from "@/lib/use-transaction-toast";

// USDC configuration
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
const USDC_DECIMALS = 6;

// ERC20 ABI for approval and balance
const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

interface TradePanelProps {
  market: MarketData;
  selectedOutcome: number;
  onOutcomeChange: (outcome: number) => void;
}

type TabType = "buy" | "sell" | "liquidity";

// Helper to format USDC amounts
function formatUSDC(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS);
}

// Helper to parse USDC amounts
function parseUSDC(value: string): bigint {
  return parseUnits(value, USDC_DECIMALS);
}

export function TradePanel({ market, selectedOutcome, onOutcomeChange }: TradePanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("buy");
  const [liquidityTab, setLiquidityTab] = useState<"add" | "remove">("add");
  
  const [amount, setAmount] = useState("");
  const [sharesToSell, setSharesToSell] = useState("");
  const [liquidityToRemove, setLiquidityToRemove] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [pendingTxType, setPendingTxType] = useState<"buy" | "sell" | "addLiquidity" | "removeLiquidity" | "claimFees" | "claimLiquidity" | "approve" | null>(null);
  
  const txToast = useTransactionToast();
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { writeContract, data: hash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  
  // Batched calls for approve + action (AGW feature)
  const { sendCalls, data: batchCallsData, isPending: isBatchPending, error: batchError } = useSendCalls();
  const batchId = typeof batchCallsData === 'string' ? batchCallsData : batchCallsData?.id;
  const { data: batchStatus } = useCallsStatus({
    id: batchId!,
    query: { enabled: !!batchId },
  });
  const isBatchSuccess = batchStatus?.status === 'success';

  // USDC Balance
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: {
      enabled: isConnected && !!address,
    }
  });

  // USDC Allowance
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address!, PREDICTION_MARKET_ADDRESS],
    query: {
      enabled: isConnected && !!address,
    }
  });

  const { data: shares, refetch: refetchShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketShares',
    args: [market.id],
  });

  const { data: fees } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketFees',
    args: [market.id],
  });

  const { data: userShares, refetch: refetchUserShares } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserMarketShares',
    args: [market.id, address!],
    query: {
      enabled: isConnected && !!address,
    }
  });

  const { data: claimableFees, refetch: refetchClaimableFees } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserClaimableFees',
    args: [market.id, address!],
    query: {
      enabled: isConnected && !!address,
    }
  });

  const { data: claimStatus, refetch: refetchClaimStatus } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getUserClaimStatus',
    args: [market.id, address!],
    query: {
      enabled: isConnected && !!address,
    }
  });

  // Check if approval is needed
  useEffect(() => {
    if (amount && usdcAllowance !== undefined) {
      try {
        const amountBigInt = parseUSDC(amount);
        setNeedsApproval(usdcAllowance < amountBigInt);
      } catch {
        setNeedsApproval(false);
      }
    } else {
      setNeedsApproval(false);
    }
  }, [amount, usdcAllowance]);

  // Effect to handle transaction success (both single and batched)
  useEffect(() => {
    if (isSuccess || isBatchSuccess) {
        setAmount("");
        setSharesToSell("");
        setLiquidityToRemove("");
        setError(null);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['market-history'] });
        queryClient.invalidateQueries({ queryKey: ['markets-logs'] });
        refetchShares();
        refetchUserShares();
        refetchClaimableFees();
        refetchClaimStatus();
        refetchBalance();
        refetchAllowance();
    }
  }, [isSuccess, isBatchSuccess, queryClient, refetchShares, refetchUserShares, refetchClaimableFees, refetchClaimStatus, refetchBalance, refetchAllowance]);

  useEffect(() => {
      if (writeError) {
          setError(writeError.message);
      }
      if (batchError) {
          setError(batchError.message);
      }
  }, [writeError, batchError]);

  const outcomeShares = shares ? shares[1] : [];
  const buyFee = fees ? (fees[0].fee + fees[0].treasuryFee + fees[0].distributorFee) : 0n;
  const sellFee = fees ? (fees[1].fee + fees[1].treasuryFee + fees[1].distributorFee) : 0n;
  const liquidity = shares ? shares[0] : 0n;
  
  // User's shares for each outcome
  const userOutcomeShares = userShares ? userShares[1] : [];
  const userSelectedOutcomeShares = userOutcomeShares[selectedOutcome] ?? 0n;
  
  // User's liquidity position
  const userLiquidity = userShares ? userShares[0] : 0n;
  const userClaimableFees = claimableFees ?? 0n;
  
  // Claim status flags
  const canClaimLiquidity = claimStatus ? claimStatus[2] && !claimStatus[3] : false;

  // --- Calculations ---
  // Note: Market math uses 18 decimals internally, we need to scale USDC (6 decimals) up
  const simulatedBuyShares = useMemo(() => {
    if (!outcomeShares.length || !amount) return 0n;
    try {
        const val = parseUSDC(amount);
        if (val === 0n) return 0n;
        // Scale up to 18 decimals for market math
        const scaledVal = val * BigInt(10 ** 12);
        return calcBuyAmount(scaledVal, selectedOutcome, [...outcomeShares], buyFee);
    } catch (e) {
        return 0n;
    }
  }, [amount, selectedOutcome, outcomeShares, buyFee]);

  // Calculate current prices for all outcomes
  const outcomePrices = useMemo(() => {
      if (!outcomeShares.length || !liquidity) return Array(market.outcomeCount).fill(0);
      return Array.from({ length: market.outcomeCount }).map((_, i) => 
          getPrice(i, [...outcomeShares], liquidity)
      );
  }, [market.outcomeCount, outcomeShares, liquidity]);

  // --- Handlers ---
  const handleApprove = () => {
    setError(null);
    setPendingTxType("approve");
    txToast.showPending("approve");
    try {
      // Approve max uint256 for convenience
      writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PREDICTION_MARKET_ADDRESS, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")]
      });
    } catch (e: any) {
      setError(e.message);
      txToast.showError("approve", e.message);
      setPendingTxType(null);
    }
  };

  const handleBuy = () => {
      setError(null);
      if (!amount) return;
      
      setPendingTxType("buy");
      txToast.showPending("buy", `Buying ${selectedOutcome === 0 ? "Yes" : "No"} shares for $${amount}`);
      
      try {
          const amountBigInt = parseUSDC(amount);
          
          if (needsApproval) {
            // Batch approve + buy in a single transaction (AGW feature)
            sendCalls({
              calls: [
                {
                  to: USDC_ADDRESS,
                  data: encodeFunctionData({
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [PREDICTION_MARKET_ADDRESS, amountBigInt],
                  }),
                },
                {
                  to: PREDICTION_MARKET_ADDRESS,
                  data: encodeFunctionData({
                    abi: PREDICTION_MARKET_ABI,
                    functionName: 'buy',
                    args: [market.id, BigInt(selectedOutcome), 0n, amountBigInt],
                  }),
                },
              ],
            });
          } else {
            writeContract({
                address: PREDICTION_MARKET_ADDRESS,
                abi: PREDICTION_MARKET_ABI,
                functionName: 'buy',
                args: [market.id, BigInt(selectedOutcome), 0n, amountBigInt]
            });
          }
      } catch (e: any) {
          setError(e.message);
          txToast.showError("buy", e.message);
          setPendingTxType(null);
      }
  };

  const handleSell = () => {
      setError(null);
      if (!sharesToSell) return;
      
      setPendingTxType("sell");
      txToast.showPending("sell", `Selling ${sharesToSell} ${selectedOutcome === 0 ? "Yes" : "No"} shares`);
      
      try {
           // Shares are in 18 decimals
           const sharesAmount = parseUnits(sharesToSell, 18);
           writeContract({
               address: PREDICTION_MARKET_ADDRESS,
               abi: PREDICTION_MARKET_ABI,
               functionName: 'sell',
               args: [market.id, BigInt(selectedOutcome), sharesAmount, BigInt("999999999999999999999999")]
           });
      } catch (e: any) {
          setError(e.message);
          txToast.showError("sell", e.message);
          setPendingTxType(null);
      }
  };

  const handleAddLiquidity = () => {
      setError(null);
      if (!amount) return;
      
      setPendingTxType("addLiquidity");
      txToast.showPending("addLiquidity", `Adding $${amount} to liquidity pool`);
      
      try {
          const amountBigInt = parseUSDC(amount);
          
          if (needsApproval) {
            // Batch approve + addLiquidity in a single transaction (AGW feature)
            sendCalls({
              calls: [
                {
                  to: USDC_ADDRESS,
                  data: encodeFunctionData({
                    abi: ERC20_ABI,
                    functionName: 'approve',
                    args: [PREDICTION_MARKET_ADDRESS, amountBigInt],
                  }),
                },
                {
                  to: PREDICTION_MARKET_ADDRESS,
                  data: encodeFunctionData({
                    abi: PREDICTION_MARKET_ABI,
                    functionName: 'addLiquidity',
                    args: [market.id, amountBigInt],
                  }),
                },
              ],
            });
          } else {
            writeContract({
                address: PREDICTION_MARKET_ADDRESS,
                abi: PREDICTION_MARKET_ABI,
                functionName: 'addLiquidity',
                args: [market.id, amountBigInt]
            });
          }
      } catch (e: any) {
          setError(e.message);
          txToast.showError("addLiquidity", e.message);
          setPendingTxType(null);
      }
  };

  const handlePercentageClick = (percentage: number) => {
    if (usdcBalance) {
        const value = Number(formatUSDC(usdcBalance)) * percentage;
        setAmount(value.toFixed(2));
    }
  };

  const handleSellPercentageClick = (percentage: number) => {
    if (userSelectedOutcomeShares > 0n) {
        const value = Number(formatUnits(userSelectedOutcomeShares, 18)) * percentage;
        setSharesToSell(value.toFixed(4));
    }
  };

  const handleRemoveLiquidity = () => {
      setError(null);
      if (!liquidityToRemove) return;
      
      setPendingTxType("removeLiquidity");
      txToast.showPending("removeLiquidity", `Withdrawing ${liquidityToRemove} LP tokens`);
      
      try {
          // LP shares are in 18 decimals
          const sharesAmount = parseUnits(liquidityToRemove, 18);
          writeContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'removeLiquidity',
              args: [market.id, sharesAmount]
          });
      } catch (e: any) {
          setError(e.message);
          txToast.showError("removeLiquidity", e.message);
          setPendingTxType(null);
      }
  };

  const handleClaimFees = () => {
      setError(null);
      setPendingTxType("claimFees");
      txToast.showPending("claimFees");
      
      try {
          writeContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'claimFees',
              args: [market.id]
          });
      } catch (e: any) {
          setError(e.message);
          txToast.showError("claimFees", e.message);
          setPendingTxType(null);
      }
  };

  const handleClaimLiquidity = () => {
      setError(null);
      setPendingTxType("claimLiquidity");
      txToast.showPending("claimLiquidity");
      
      try {
          writeContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'claimLiquidity',
              args: [market.id]
          });
      } catch (e: any) {
          setError(e.message);
          txToast.showError("claimLiquidity", e.message);
          setPendingTxType(null);
      }
  };

  const handleLiquidityPercentageClick = (percentage: number) => {
    if (userLiquidity > 0n) {
        const value = Number(formatUnits(userLiquidity, 18)) * percentage;
        setLiquidityToRemove(value.toFixed(4));
    }
  };

  const isLoading = isWritePending || isConfirming || isBatchPending || batchStatus?.status === 'pending';

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="w-full flex flex-col">
        <Tabs 
            value={activeTab} 
            onValueChange={(val) => setActiveTab(val as TabType)}
            className="w-full"
        >
            <div className="border-b border-border bg-transparent p-2">
                <TabsList className="w-full grid grid-cols-3">
                    <TabsTrigger value="buy">Buy</TabsTrigger>
                    <TabsTrigger value="sell">Sell</TabsTrigger>
                    <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
                </TabsList>
            </div>
        
            <div className="relative overflow-hidden w-full">
            <div className="p-4 sm:p-6 w-full">
                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription className="break-words">{error}</AlertDescription>
                    </Alert>
                )}
                
                <TabsContents>
                    <TabsContent value="buy" className="p-1">
                    <div className="space-y-4">
                        {/* Outcome Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm text-muted-foreground">Select outcome</Label>
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: market.outcomeCount }).map((_, idx) => {
                                    const title = idx === 0 ? "Yes" : "No";
                                    const price = outcomePrices[idx];
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
                        </div>

                        {/* Amount Input */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm text-muted-foreground">Amount (USDC)</Label>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Wallet className="w-3 h-3" />
                                    <span>Balance: {usdcBalance !== undefined ? parseFloat(formatUSDC(usdcBalance)).toFixed(2) : '0'} USDC</span>
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
                                    {[0.25, 0.5, 1].map((pct) => (
                                        <Button 
                                            key={pct}
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handlePercentageClick(pct)}
                                            className="px-2 min-w-[3rem]"
                                        >
                                            {pct * 100}%
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Order Summary */}
                        <div className="space-y-3 pt-0">
                            <Button 
                                className="w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02] bg-emerald-600 hover:bg-emerald-500 text-white"
                                onClick={handleBuy} 
                                disabled={isLoading || !amount}
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    "Buy"
                                )}
                            </Button>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Price per share</span>
                                    <span className="text-foreground">
                                        {outcomePrices[selectedOutcome] > 0 
                                            ? `$${outcomePrices[selectedOutcome].toFixed(4)}` 
                                            : '-'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Est. Shares</span>
                                    <span className="text-foreground">{formatShares(Number(formatUnits(simulatedBuyShares, 18)))}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Potential Return</span>
                                    <span className="text-emerald-500 font-medium">
                                        {simulatedBuyShares > 0n 
                                            ? `$${Number(formatUnits(simulatedBuyShares, 18)).toFixed(2)}` 
                                            : '$0.00'} 
                                        {' '}
                                        ({amount && Number(amount) > 0 
                                            ? ((Number(formatUnits(simulatedBuyShares, 18)) / Number(amount) - 1) * 100).toFixed(0) 
                                            : '0'}%)
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    </TabsContent>

                    <TabsContent value="sell" className="p-1">
                    <div className="space-y-4">
                        {/* Outcome Selection */}
                        <div className="space-y-3">
                            <Label className="text-sm text-muted-foreground">Select outcome</Label>
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: market.outcomeCount }).map((_, idx) => {
                                    const title = idx === 0 ? "Yes" : "No";
                                    const userSharesForOutcome = userOutcomeShares[idx] ?? 0n;
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
                                                {parseFloat(formatUnits(userSharesForOutcome, 18)).toFixed(2)} shares
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Shares Input */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="text-sm text-muted-foreground">Shares to Sell</Label>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Wallet className="w-3 h-3" />
                                    <span>Available: {userSelectedOutcomeShares > 0n ? parseFloat(formatUnits(userSelectedOutcomeShares, 18)).toFixed(4) : '0'} shares</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                                <div className="relative flex-1 min-w-[120px]">
                                    <Input 
                                        type="number" 
                                        value={sharesToSell} 
                                        onChange={(e) => setSharesToSell(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="flex gap-1">
                                    {[0.25, 0.5, 1].map((pct) => (
                                        <Button 
                                            key={pct}
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handleSellPercentageClick(pct)}
                                            className="px-2 min-w-[3rem]"
                                        >
                                            {pct * 100}%
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Sell Button */}
                        <div className="space-y-3 pt-0">
                            <Button 
                                className={cn(
                                    "w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02]",
                                    "bg-red-600 hover:bg-red-500 text-white"
                                )}
                                onClick={handleSell} 
                                disabled={isLoading || !sharesToSell}
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                    "Sell"
                                )}
                            </Button>
                        </div>
                    </div>
                    </TabsContent>

                    <TabsContent value="liquidity" className="p-1">
                    <div className="space-y-4">
                        {/* User's Position Summary */}
                        {isConnected && (userLiquidity > 0n || userClaimableFees > 0n) && (
                            <div className="p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Droplets className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm font-medium">Your Position</span>
                                    </div>
                                    <div className="flex gap-2">
                                         {userClaimableFees > 0n && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={handleClaimFees}
                                                disabled={isLoading}
                                                className="h-7 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 px-2"
                                            >
                                                {isLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Coins className="mr-1 h-3 w-3" />}
                                                Claim Fees
                                            </Button>
                                        )}
                                        {canClaimLiquidity && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={handleClaimLiquidity}
                                                disabled={isLoading}
                                                className="h-7 text-xs text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 px-2"
                                            >
                                                {isLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowDownToLine className="mr-1 h-3 w-3" />}
                                                Claim Liquidity
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-muted-foreground">Liquidity Provided</div>
                                        <div className="text-lg font-semibold">{parseFloat(formatUnits(userLiquidity, 18)).toFixed(4)} LP</div>
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Fees Earned</div>
                                        <div className="text-lg font-semibold text-emerald-500">{parseFloat(formatUSDC(userClaimableFees)).toFixed(2)} USDC</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Liquidity Action Toggle */}
                        <div className="flex p-1 bg-muted/50 rounded-lg">
                            <button
                                onClick={() => setLiquidityTab("add")}
                                className={cn(
                                    "flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all",
                                    liquidityTab === "add" 
                                        ? "bg-background shadow-sm text-foreground" 
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Add
                            </button>
                            <button
                                onClick={() => setLiquidityTab("remove")}
                                className={cn(
                                    "flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-all",
                                    liquidityTab === "remove" 
                                        ? "bg-background shadow-sm text-foreground" 
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Withdraw
                            </button>
                        </div>

                        {/* Withdraw Liquidity Section */}
                        {liquidityTab === "remove" && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-sm text-muted-foreground">Amount (LP)</Label>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <span>Available: {parseFloat(formatUnits(userLiquidity, 18)).toFixed(4)} LP</span>
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <div className="relative flex-1 min-w-[120px]">
                                        <Input 
                                            type="number" 
                                            value={liquidityToRemove} 
                                            onChange={(e) => setLiquidityToRemove(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {[0.25, 0.5, 1].map((pct) => (
                                            <Button 
                                                key={pct}
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => handleLiquidityPercentageClick(pct)}
                                                className="px-2 min-w-[3rem]"
                                            >
                                                {pct * 100}%
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                
                                <Button 
                                    className={cn(
                                        "w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02]",
                                        "bg-red-600 hover:bg-red-500 text-white"
                                    )}
                                    onClick={handleRemoveLiquidity} 
                                    disabled={isLoading || !liquidityToRemove}
                                >
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    ) : (
                                        "Withdraw Liquidity"
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Add Liquidity Section */}
                        {liquidityTab === "add" && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <Label className="text-sm text-muted-foreground">Amount (USDC)</Label>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Wallet className="w-3 h-3" />
                                        <span>Balance: {usdcBalance !== undefined ? parseFloat(formatUSDC(usdcBalance)).toFixed(2) : '0'} USDC</span>
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
                                        {[0.25, 0.5, 1].map((pct) => (
                                            <Button 
                                                key={pct}
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => handlePercentageClick(pct)}
                                                className="px-2 min-w-[3rem]"
                                            >
                                                {pct * 100}%
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <Button 
                                    className="w-full h-11 text-base font-semibold shadow-lg transition-all hover:scale-[1.02] bg-blue-600 hover:bg-blue-500 text-white"
                                    onClick={handleAddLiquidity} 
                                    disabled={isLoading || !amount}
                                >
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    ) : (
                                        "Add Liquidity"
                                    )}
                                </Button>
                            </div>
                        )}

                        {/* Info Box */}
                        <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground border border-border/50">
                            <p>Liquidity providers earn fees from all trades. Your liquidity is distributed across all outcomes proportionally.</p>
                        </div>
                    </div>
                    </TabsContent>
                </TabsContents>
            </div>
            </div>
        </Tabs>
      </div>
    </div>
  );
}
