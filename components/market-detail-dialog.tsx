import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MarketData } from "@/lib/types";
import { useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { useState, useMemo, useEffect } from "react";
import { formatEther, parseEther, parseAbiItem } from "viem";
import { calcBuyAmount, calcSellAmount, getPrice } from "@/lib/market-math";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface MarketDetailDialogProps {
  market: MarketData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarketDetailDialog({ market, open, onOpenChange }: MarketDetailDialogProps) {
  if (!market) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{market.question}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <MarketStats market={market} />
            <PriceHistoryChart marketId={market.id} outcomeCount={market.outcomeCount} />
          </div>

          <div className="space-y-6">
             <InteractionCard market={market} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MarketStats({ market }: { market: MarketData }) {
  const { data: prices } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'getMarketPrices',
    args: [market.id],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Outcomes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prices && prices[1].map((price, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <span className="font-medium">Outcome {idx === 0 ? "Yes" : "No"}</span>
            <span className="text-xl font-bold">{(Number(price) / 1e18).toFixed(2)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PriceHistoryChart({ marketId, outcomeCount }: { marketId: bigint, outcomeCount: number }) {
    const client = usePublicClient();

    const { data: chartData, isLoading } = useQuery({
        queryKey: ['market-history', marketId.toString()],
        queryFn: async () => {
            if (!client) return [];
            
            const logs = await client.getLogs({
                address: PREDICTION_MARKET_ADDRESS,
                event: parseAbiItem('event MarketOutcomeShares(uint256 indexed marketId, uint256 timestamp, uint256[] outcomeShares, uint256 liquidity)'),
                args: { marketId },
                fromBlock: 'earliest'
            });

            return logs.map(log => {
                const timestamp = Number(log.args.timestamp) * 1000;
                const shares = log.args.outcomeShares!;
                const liquidity = log.args.liquidity!;
                
                const prices: Record<string, number | string> = {
                    time: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    timestamp // for sorting if needed
                };

                for (let i = 0; i < shares.length; i++) {
                    prices[`outcome${i}`] = getPrice(i, [...shares], liquidity);
                }

                return prices;
            });
        },
        enabled: !!client
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price History</CardTitle>
      </CardHeader>
      <CardContent className="h-[300px]">
        {isLoading ? (
             <div className="flex h-full items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
             </div>
        ) : (
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
                <XAxis dataKey="time" minTickGap={30} />
                <YAxis domain={[0, 1]} />
                <Tooltip />
                <Legend />
                {Array.from({ length: outcomeCount }).map((_, i) => (
                    <Line 
                        key={i}
                        type="stepAfter" 
                        dataKey={`outcome${i}`} 
                        name={i === 0 ? "Yes" : "No"}
                        stroke={i === 0 ? "#10b981" : "#ef4444"} 
                        strokeWidth={2} 
                        dot={false}
                    />
                ))}
            </LineChart>
            </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function InteractionCard({ market }: { market: MarketData }) {
  const [amount, setAmount] = useState("0.01");
  const [sharesToSell, setSharesToSell] = useState("0");
  const [selectedOutcome, setSelectedOutcome] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { writeContract, data: hash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

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

  // Effect to handle transaction success
  useEffect(() => {
    if (isSuccess) {
        setAmount("0.01");
        setSharesToSell("0");
        setError(null);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['market-history'] });
        queryClient.invalidateQueries({ queryKey: ['markets-logs'] });
        refetchShares();
    }
  }, [isSuccess, queryClient, refetchShares]);

  useEffect(() => {
      if (writeError) {
          setError(writeError.message);
      }
  }, [writeError]);

  const outcomeShares = shares ? shares[1] : [];
  const buyFee = fees ? (fees[0].fee + fees[0].treasuryFee + fees[0].distributorFee) : 0n;
  const sellFee = fees ? (fees[1].fee + fees[1].treasuryFee + fees[1].distributorFee) : 0n;

  // --- Calculations ---
  const simulatedBuyShares = useMemo(() => {
    if (!outcomeShares.length || !amount) return 0n;
    try {
        const val = parseEther(amount);
        if (val === 0n) return 0n;
        return calcBuyAmount(val, selectedOutcome, [...outcomeShares], buyFee);
    } catch (e) {
        return 0n;
    }
  }, [amount, selectedOutcome, outcomeShares, buyFee]);

  const simulatedSellAmount = useMemo(() => {
     if (!outcomeShares.length || !sharesToSell) return 0n;
     try {
         const sharesVal = parseEther(sharesToSell); // Treating shares as 18 decimals for input convenience
         if (sharesVal === 0n) return 0n;
         return calcSellAmount(sharesVal, selectedOutcome, [...outcomeShares], sellFee); // Wait, logic might be reverse?
         // Contract: calcSellAmount(amount, ...) -> returns SHARES needed to get amount.
         // We want: calcSellReturn(shares, ...) -> returns AMOUNT received.
         // Since we don't have that helper in TS yet, we can't display exact return easily without solving the equation.
         // For now, let's just use the contract write.
         return 0n;
     } catch (e) { return 0n; }
  }, [sharesToSell, selectedOutcome, outcomeShares, sellFee]);

  // --- Handlers ---
  const handleBuy = () => {
      setError(null);
      if (!amount) return;
      try {
          writeContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'buyWithETH',
              args: [market.id, BigInt(selectedOutcome), 0n], // 0n minShares for now (slippage)
              value: parseEther(amount)
          });
      } catch (e: any) {
          setError(e.message);
      }
  };

  const handleSell = () => {
      setError(null);
      if (!sharesToSell) return;
      try {
           // We need to estimate value for sellToETH? No, sellToETH takes `value` (amount of ETH requested)
           // And maxOutcomeSharesToSell.
           // This UI flow is tricky. Usually users say "I want to sell X shares".
           // But the contract function `sell` takes `value` (ETH) as input and calculates shares required.
           // So the user is asking "I want to cash out Y ETH".
           
           // For simplicity, let's change the input to "ETH Amount to Receive".
           writeContract({
               address: PREDICTION_MARKET_ADDRESS,
               abi: PREDICTION_MARKET_ABI,
               functionName: 'sellToETH',
               args: [market.id, BigInt(selectedOutcome), parseEther(sharesToSell), 999999999999999999999999n] // Max shares generous
           });
      } catch (e: any) {
          setError(e.message);
      }
  };

  const handleAddLiquidity = () => {
      setError(null);
      if (!amount) return;
      try {
          writeContract({
              address: PREDICTION_MARKET_ADDRESS,
              abi: PREDICTION_MARKET_ABI,
              functionName: 'addLiquidityWithETH',
              args: [market.id],
              value: parseEther(amount)
          });
      } catch (e: any) {
          setError(e.message);
      }
  };

  const isLoading = isWritePending || isConfirming;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle>Trade</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
            <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}
        
        <Tabs defaultValue="buy">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="buy">Buy</TabsTrigger>
            <TabsTrigger value="sell">Sell</TabsTrigger>
            <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
          </TabsList>
          
          <TabsContent value="buy" className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label>Outcome</Label>
                <div className="flex gap-2">
                    {[0, 1].map((idx) => (
                        <Button 
                            key={idx} 
                            variant={selectedOutcome === idx ? "default" : "outline"}
                            onClick={() => setSelectedOutcome(idx)}
                            className="flex-1"
                        >
                            {idx === 0 ? "Yes" : "No"}
                        </Button>
                    ))}
                </div>
             </div>

             <div className="space-y-2">
                <Label>Amount (ETH)</Label>
                <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                />
             </div>

             <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                    <span>Est. Shares Received:</span>
                    <span className="font-mono">{formatEther(simulatedBuyShares)}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span>Est. Fee:</span>
                    <span className="font-mono">{amount ? (Number(amount) * 0.01).toFixed(4) : "0"} ETH</span>
                </div>
             </div>
             
             <Button className="w-full" onClick={handleBuy} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConfirming ? "Confirming..." : "Buy Shares"}
             </Button>
          </TabsContent>
          
          <TabsContent value="sell" className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label>Outcome to Sell</Label>
                <div className="flex gap-2">
                    {[0, 1].map((idx) => (
                        <Button 
                            key={idx} 
                            variant={selectedOutcome === idx ? "default" : "outline"}
                            onClick={() => setSelectedOutcome(idx)}
                            className="flex-1"
                        >
                            {idx === 0 ? "Yes" : "No"}
                        </Button>
                    ))}
                </div>
             </div>

             <div className="space-y-2">
                <Label>ETH Amount to Receive (Cash Out)</Label>
                <Input 
                    type="number" 
                    value={sharesToSell} 
                    onChange={(e) => setSharesToSell(e.target.value)} 
                />
                <p className="text-xs text-muted-foreground">The contract calculates how many shares you need to burn to get this ETH.</p>
             </div>
             
             <Button className="w-full" onClick={handleSell} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConfirming ? "Confirming..." : "Sell for ETH"}
             </Button>
          </TabsContent>

          <TabsContent value="liquidity" className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label>Amount to Add (ETH)</Label>
                <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                />
             </div>
             <Button className="w-full" onClick={handleAddLiquidity} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isConfirming ? "Confirming..." : "Add Liquidity"}
             </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
