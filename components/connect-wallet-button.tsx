"use client";

import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react';
import { Button } from "@/components/ui/button";
import { Wallet, Loader2 } from "lucide-react";

export function ConnectWalletButton() {
  const { login } = useLoginWithAbstract();
  const { data: abstractClient, isLoading } = useAbstractClient();

  if (isLoading) {
    return (
      <Button disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (abstractClient?.account?.address) {
    return (
      <Button variant="outline" disabled>
        <Wallet className="mr-2 h-4 w-4" />
        {abstractClient.account.address.slice(0, 6)}...{abstractClient.account.address.slice(-4)}
      </Button>
    );
  }

  return (
    <Button onClick={() => login()}>
      <Wallet className="mr-2 h-4 w-4" />
      Connect Wallet
    </Button>
  );
}

