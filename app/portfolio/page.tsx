"use client";

import { useAccount } from "wagmi";
import { ConnectWalletPrompt } from "@/components/ui/connect-wallet-prompt";
import { useMounted } from "@/lib/hooks/use-mounted";

export default function PortfolioPage() {
  const { isConnected, address, status, isConnecting, isReconnecting } = useAccount();
  const mounted = useMounted();

  // Prevent flashing the big prompt while wagmi is hydrating/reconnecting.
  if (
    !mounted ||
    status === "connecting" ||
    status === "reconnecting" ||
    isConnecting ||
    isReconnecting
  ) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-8 w-40 rounded-md bg-muted animate-pulse" />
        <div className="mt-3 h-4 w-72 rounded-md bg-muted animate-pulse" />
        <div className="mt-8 h-40 w-full max-w-md rounded-xl bg-muted/60 animate-pulse" />
      </div>
    );
  }

  if (!isConnected) {
    return <ConnectWalletPrompt />;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Connected as <span className="font-mono">{address}</span>
      </p>
      <div className="mt-8 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Portfolio UI coming soon.
      </div>
    </div>
  );
}


