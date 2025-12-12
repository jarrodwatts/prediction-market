"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Github, TrendingUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { cn } from "@/lib/utils";

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
        <nav className="flex items-center gap-2">
          <a
            href="https://github.com/jarrodwatts/prediction-market"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "text-muted-foreground hover:text-foreground"
            )}
            aria-label="GitHub"
          >
            <Github className="size-4" />
          </a>
          <AnimatedThemeToggler
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "text-muted-foreground hover:text-foreground"
            )}
          />
          <div className="mx-1 h-6 w-px bg-border/70" aria-hidden="true" />
          <ConnectWalletButton mode="header" />
        </nav>
      </div>
    </header>
  );
}
