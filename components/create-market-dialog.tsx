import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { PREDICTION_MARKET_ABI, PREDICTION_MARKET_ADDRESS } from "@/lib/contract";
import { parseEther } from "viem";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CreateMarketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateMarketDialog({ open, onOpenChange }: CreateMarketDialogProps) {
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState("");
  const [duration, setDuration] = useState("7"); // Days
  const [initialLiquidity, setInitialLiquidity] = useState("0.1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, chainId } = useAccount();

  const { data: wethAddress, error: wethError } = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: 'WETH',
    query: {
        enabled: open, // Only fetch when open to save RPC calls
    }
  });

  const { writeContract, data: hash, isPending: isWritePending, error: writeError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isSuccess && open) {
       onOpenChange(false);
       // Reset form
       setQuestion("");
       setImage("");
       setInitialLiquidity("0.1");
       setError(null);
    }
  }, [isSuccess, open, onOpenChange]);

  useEffect(() => {
      if (writeError) {
          setError(writeError.message);
          setIsSubmitting(false);
      }
      if (wethError) {
        console.error("Error fetching WETH:", wethError);
      }
  }, [writeError, wethError]);

  const handleCreate = async () => {
    setError(null);
    if (!isConnected) {
        setError("Wallet not connected");
        return;
    }
    if (!wethAddress) {
        setError("Failed to load WETH address from contract. Check network connection.");
        return;
    }

    setIsSubmitting(true);

    try {
      const closesAt = BigInt(Math.floor(Date.now() / 1000) + (Number(duration) * 24 * 60 * 60));
      const value = parseEther(initialLiquidity);
      
      // Fees: 1% each = 100 basis points (10000 = 100%)
      const defaultFees = {
        fee: 100n,           // 1% to liquidity providers
        treasuryFee: 100n,   // 1% to treasury
        distributorFee: 100n // 1% to distributor
      };

      const desc = {
        value,
        closesAt: Number(closesAt),
        outcomes: 2n,
        token: wethAddress,
        distribution: [50n, 50n],
        question,
        image,
        buyFees: defaultFees,
        sellFees: defaultFees,
        treasury: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        distributor: "0x0000000000000000000000000000000000000000" as `0x${string}`
      };

      console.log("Creating market with:", desc);

      writeContract({
        address: PREDICTION_MARKET_ADDRESS,
        abi: PREDICTION_MARKET_ABI,
        functionName: 'createMarketWithETH',
        args: [desc],
        value: value
      });
    } catch (error: any) {
      console.error("Failed to prepare transaction:", error);
      setError(error.message || "Failed to prepare transaction");
      setIsSubmitting(false);
    }
  };

  const isLoading = isWritePending || isConfirming || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Market</DialogTitle>
          <DialogDescription>
            Deploy a new binary (Yes/No) prediction market.
          </DialogDescription>
        </DialogHeader>
        
        {error && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              placeholder="Will ETH hit $10k?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="image">Image URL</Label>
            <Input
              id="image"
              placeholder="https://..."
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="liquidity">Liquidity (ETH)</Label>
              <Input
                id="liquidity"
                type="number"
                value={initialLiquidity}
                onChange={(e) => setInitialLiquidity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Duration (Days)</Label>
              <Input
                id="duration"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={isLoading || !question}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isConfirming ? "Confirming..." : isWritePending ? "Check Wallet..." : "Create Market"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


