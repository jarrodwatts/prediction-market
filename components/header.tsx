"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Github, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <div className="relative mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
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
          <Button size="sm">Launch App</Button>
        </nav>
      </div>
    </header>
  );
}
