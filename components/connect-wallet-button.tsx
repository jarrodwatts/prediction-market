"use client";

import { useLoginWithAbstract } from "@abstract-foundation/agw-react";
import { useAccount, useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { RainbowButton } from "@/components/ui/rainbow-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Wallet,
  DollarSign,
  Copy,
  LogOut,
  Github,
  Book,
  Check,
  ArrowUpRight,
  User,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { erc20Abi, formatUnits } from "viem";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { truncateAddress } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import Link from "next/link";
import { USDC, formatUSDC } from "@/lib/tokens";
import { useMounted } from "@/lib/hooks/use-mounted";

interface ConnectWalletButtonProps {
  customDropdownItems?: React.ReactNode[];
  className?: string;
  /**
   * Controls rendering during hydration / reconnect to avoid UI flashes.
   * - header: keep a stable icon-sized placeholder while wagmi hydrates
   * - default: render the normal button (good for full-page prompts)
   */
  mode?: "header" | "default";
}

type AbstractProfile = {
  address: string;
  name?: string | null;
  description?: string | null;
  profilePictureUrl?: string | null;
  tier?: string | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const DEPOSIT_THRESHOLD_USD = 100n;
const DEPOSIT_THRESHOLD_USDC = DEPOSIT_THRESHOLD_USD * 10n ** BigInt(USDC.decimals);
const DEPOSIT_URL = "https://portal.abs.xyz/onramp";

function abstractProfileQuery(address: `0x${string}` | undefined) {
  return {
    queryKey: ["abstract-profile", address],
    queryFn: async (): Promise<AbstractProfile | null> => {
      if (!address) return null;
      try {
        const res = await fetch(
          `https://api.portal.abs.xyz/api/v1/user/profile/${address}/`
        );
        if (!res.ok) return null;
        return (await res.json()) as AbstractProfile;
      } catch {
        return null;
      }
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1_000,
    gcTime: 10 * 60 * 1_000,
    retry: false,
  } as const;
}

export function ConnectWalletButton({
  customDropdownItems,
  className,
  mode = "default",
}: ConnectWalletButtonProps) {
  const { login, logout } = useLoginWithAbstract();
  const { address, status, isConnecting, isReconnecting } = useAccount();
  const [hasCopied, setHasCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const { data: profile } = useQuery(abstractProfileQuery(address));

  const { data: balanceData } = useReadContract({
    address: USDC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && USDC.address !== (ZERO_ADDRESS as `0x${string}`),
      refetchInterval: 10_000,
    },
  });

  const formattedBalance = balanceData
    ? formatUSDC(balanceData)
    : "0";

  const isLoading =
    status === "connecting" ||
    status === "reconnecting" ||
    isConnecting ||
    isReconnecting;

  if (!mounted || isLoading) {
    if (mode === "header") {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-10 w-10 p-0 border border-border/50 opacity-70"
          disabled
          aria-label="Loading wallet status"
        >
          {/* Static icon to avoid “loading flash” animations in header */}
          <Wallet className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button disabled className={className} aria-label="Loading wallet status">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </Button>
    );
  }

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard");
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2_000);
    }
  };

  if (status === "connected" && address) {
    const displayName = profile?.name || "User";
    const balanceUsd = formatUsdSmart(Number(formattedBalance));
    const hasUsdcConfigured = USDC.address !== (ZERO_ADDRESS as `0x${string}`);
    const isBalanceLoading = hasUsdcConfigured && balanceData === undefined;

    // Root-cause fix: do NOT treat "unknown balance" as "low balance".
    // This avoids the Deposit button briefly rendering then disappearing.
    const showDepositCta =
      !hasUsdcConfigured ||
      (balanceData !== undefined && balanceData < DEPOSIT_THRESHOLD_USDC);

    return (
      <div className="flex items-center gap-3">
        {showDepositCta && (
          <>
            <RainbowButton
              className="hidden sm:flex gap-2 h-9 group relative overflow-hidden pr-3 z-0 isolate"
              asChild
            >
              <a href={DEPOSIT_URL} target="_blank" rel="noopener noreferrer">
                Deposit
                <ArrowUpRight className="h-4 w-4 ml-0.5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </a>
            </RainbowButton>

            <div
              className="hidden sm:block h-6 w-px bg-border/70 relative z-10"
              aria-hidden="true"
            />
          </>
        )}

        <div className="hidden sm:flex flex-col justify-center items-end relative z-10 leading-none gap-1">
          <span className="text-[10px] text-muted-foreground font-medium uppercase leading-none">
            Balance
          </span>
          {isBalanceLoading ? (
            <Skeleton className="h-[14px] w-16 rounded" />
          ) : (
            <span className="text-sm font-bold leading-none tabular-nums">
              {balanceUsd}
            </span>
          )}
        </div>

        <div
          className="hidden sm:block h-6 w-px bg-border/70 relative z-10"
          aria-hidden="true"
        />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-10 w-10 p-0 border border-border/50 focus-visible:ring-0 cursor-pointer relative z-10"
            >
              <Avatar className="h-9 w-9">
                {profile?.profilePictureUrl && (
                  <AvatarImage src={profile.profilePictureUrl} alt={displayName} />
                )}
                <AvatarImage
                  src={`https://avatar.vercel.sh/${address}`}
                  alt="Gradient fallback"
                />
                <AvatarFallback>{address.slice(0, 2)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64 p-2">
            <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50 mb-2">
              <Avatar className="h-10 w-10">
                {profile?.profilePictureUrl && (
                  <AvatarImage src={profile.profilePictureUrl} alt={displayName} />
                )}
                <AvatarImage
                  src={`https://avatar.vercel.sh/${address}`}
                  alt="Gradient fallback"
                />
                <AvatarFallback>{address.slice(0, 2)}</AvatarFallback>
              </Avatar>

              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold truncate">{displayName}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {truncateAddress(address)}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 ml-auto text-muted-foreground hover:text-foreground"
                onClick={handleCopyAddress}
              >
                {hasCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/portfolio">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className="cursor-pointer">
              <a href={DEPOSIT_URL} target="_blank" rel="noopener noreferrer">
                <DollarSign className="mr-2 h-4 w-4" />
                Deposit funds
              </a>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://github.com/jarrodwatts/prediction-market"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-4 w-4" />
                GitHub Repo
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="cursor-pointer">
              <a
                href="https://build.abs.xyz/docs"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Book className="mr-2 h-4 w-4" />
                Builder Docs
              </a>
            </DropdownMenuItem>

            {customDropdownItems && (
              <>
                <DropdownMenuSeparator />
                {customDropdownItems}
              </>
            )}

            <DropdownMenuSeparator />

            <div className="relative flex cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none">
              <div className="flex items-center gap-2">
                <Moon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="font-normal">Dark mode</span>
              </div>
              <Switch
                className="cursor-pointer"
                checked={theme === "dark"}
                onCheckedChange={(checked) =>
                  setTheme(checked ? "dark" : "light")
                }
              />
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={logout}
              className="text-destructive focus:text-destructive cursor-pointer font-medium"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Button onClick={login} disabled={isLoading} className={className}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Wallet className="mr-2 h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  );
}

function formatUsdSmart(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const fractionDigits = abs >= 1_000 ? 0 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(safe);
}
