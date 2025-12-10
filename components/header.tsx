"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Github, TrendingUp, Wallet, LogOut, Loader2 } from "lucide-react";
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react';
import { Button } from "@/components/ui/button";

function WalletButton() {
  const { login, logout } = useLoginWithAbstract();
  const { data: abstractClient, isLoading } = useAbstractClient();
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    if (abstractClient) {
      abstractClient.account.address && setAddress(abstractClient.account.address);
    } else {
      setAddress(null);
    }
  }, [abstractClient]);

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-mono">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <Button variant="ghost" size="sm" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="default" size="sm" onClick={() => login()}>
      <Wallet className="mr-2 h-4 w-4" />
      Connect
    </Button>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${scrolled ? "bg-background/5 backdrop-blur-xl" : "bg-transparent"
        }`}
    >
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2">
          <TrendingUp className="size-5" />
          <span className="text-sm font-medium tracking-tight">Prediction Market</span>
        </Link>

        {/* Right: Nav */}
        <nav className="flex items-center gap-4">
          <a
            href="https://github.com/jarrodwatts/prediction-market"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
            aria-label="GitHub"
          >
            <Github className="size-4" />
          </a>
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}
