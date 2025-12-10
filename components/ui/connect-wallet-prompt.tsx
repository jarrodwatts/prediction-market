"use client";

/**
 * Connect Wallet Prompt Component
 *
 * A reusable prompt card that encourages users to connect their wallet.
 * Used across portfolio and other authenticated features.
 */

import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { Card, CardContent } from "@/components/ui/card";

// =============================================================================
// Types
// =============================================================================

interface ConnectWalletPromptProps {
  title?: string;
  description?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ConnectWalletPrompt({
  title = "Connect Your Wallet",
  description = "Connect your wallet to view your portfolio and positions.",
}: ConnectWalletPromptProps) {
  return (
    <Card className="mx-auto max-w-md mt-12">
      <CardContent className="flex flex-col items-center p-8 text-center">
        <div className="rounded-full bg-muted p-4">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6">
          <ConnectWalletButton />
        </div>
      </CardContent>
    </Card>
  );
}

