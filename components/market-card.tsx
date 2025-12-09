import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEther } from "viem";
import { MarketData } from "@/lib/types";
import { Clock, Droplets, Trophy } from "lucide-react";

interface MarketCardProps {
  market: MarketData;
  onClick: () => void;
}

export function MarketCard({ market, onClick }: MarketCardProps) {
  const isResolved = market.state === 2; // Resolved
  const isClosed = market.state === 1; // Closed

  return (
    <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={onClick}>
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg line-clamp-2">{market.question}</CardTitle>
          <Badge variant={isResolved ? "secondary" : isClosed ? "destructive" : "default"}>
            {isResolved ? "Resolved" : isClosed ? "Closed" : "Open"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {market.image && (
          <div className="mb-4 rounded-md overflow-hidden h-32 w-full">
             {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={market.image} alt={market.question} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4" />
            <span>Liquidity: {formatEther(market.liquidity)} ETH</span>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span>Volume: {formatEther(market.balance)} ETH</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>Ends: {new Date(Number(market.closesAt) * 1000).toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">View Details</Button>
      </CardFooter>
    </Card>
  );
}

