'use client'

/**
 * StreamerSetup Component
 *
 * Shared setup UI for streamers to connect Twitch and wallet.
 * Used by both /streamer (main site) and /ext-config (Twitch extension iframe).
 */

import { Twitch, Wallet, CheckCircle, Loader2, Zap, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SubscriptionStatus } from '@/lib/hooks/use-streamer-setup'

interface StreamerSetupProps {
  // Twitch connection state
  isTwitchConnected: boolean
  twitchDisplayName?: string | null
  onTwitchConnect: () => void
  isTwitchLoading?: boolean

  // Wallet connection state
  walletAddress: string | null
  onWalletConnect: () => void
  isWalletLoading?: boolean

  // Subscription status
  subscriptionStatus: SubscriptionStatus
  onRetry: () => void

  // Optional sign out
  onSignOut?: () => void
}

export function StreamerSetup({
  isTwitchConnected,
  twitchDisplayName,
  onTwitchConnect,
  isTwitchLoading,
  walletAddress,
  onWalletConnect,
  isWalletLoading,
  subscriptionStatus,
  onRetry,
  onSignOut,
}: StreamerSetupProps) {
  // Derive current step from connection states
  const step = isTwitchConnected && walletAddress ? 3 : isTwitchConnected ? 2 : 1

  return (
    <div className="mx-auto max-w-7xl py-8 space-y-8 px-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Extension setup</h1>
            {step === 3 ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ready</Badge>
            ) : (
              <Badge variant="secondary">Setup</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Connect Twitch and your payout wallet to enable prediction markets for your channel.
          </p>
        </div>

        {onSignOut && isTwitchConnected && (
          <Button variant="outline" onClick={onSignOut}>
            Sign out
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Setup column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Setup</CardTitle>
              <CardDescription>Two quick steps to start earning fees.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="-mx-6 divide-y divide-border/60">
                {/* Step 1: Connect Twitch */}
                <SetupStep
                  stepNumber={1}
                  title="Connect Twitch"
                  description="We'll sync your channel and automate prediction setup."
                  isComplete={step > 1}
                  isActive={step === 1}
                  completedContent={
                    <p className="mt-2 text-sm text-muted-foreground">
                      Signed in as{' '}
                      <span className="font-medium text-foreground">
                        {twitchDisplayName || 'Connected'}
                      </span>
                    </p>
                  }
                  action={
                    step === 1 ? (
                      <Button onClick={onTwitchConnect} disabled={isTwitchLoading} className="gap-2">
                        {isTwitchLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Twitch className="h-4 w-4" />
                        )}
                        Connect
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled className="opacity-80">
                        Connected
                      </Button>
                    )
                  }
                />

                {/* Step 2: Connect Wallet */}
                <SetupStep
                  stepNumber={2}
                  title="Connect wallet"
                  description="Receive your fee earnings in USDC."
                  isComplete={step > 2}
                  isActive={step === 2}
                  isDisabled={step < 2}
                  completedContent={
                    walletAddress && (
                      <p className="mt-2 font-mono text-sm text-muted-foreground">
                        {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                      </p>
                    )
                  }
                  action={
                    step < 2 ? (
                      <Button variant="secondary" disabled className="gap-2 opacity-60">
                        <Wallet className="h-4 w-4" />
                        Connect
                      </Button>
                    ) : walletAddress ? (
                      <Button variant="secondary" disabled className="opacity-80">
                        Connected
                      </Button>
                    ) : (
                      <Button onClick={onWalletConnect} disabled={isWalletLoading} className="gap-2">
                        {isWalletLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                        Connect
                      </Button>
                    )
                  }
                />
              </div>

              {/* Subscription Status */}
              {subscriptionStatus.state !== 'idle' && (
                <SubscriptionStatusCard status={subscriptionStatus} onRetry={onRetry} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* How it works column */}
        <div className="space-y-6">
          <HowItWorksCard />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

interface SetupStepProps {
  stepNumber: number
  title: string
  description: string
  isComplete: boolean
  isActive: boolean
  isDisabled?: boolean
  completedContent?: React.ReactNode
  action: React.ReactNode
}

function SetupStep({
  stepNumber,
  title,
  description,
  isComplete,
  isActive,
  isDisabled,
  completedContent,
  action,
}: SetupStepProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 px-6 py-5 transition-colors ${
        isActive ? 'bg-muted/20 hover:bg-muted/20' : isDisabled ? '' : 'hover:bg-muted/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-sm font-semibold">
          {isComplete ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <span>{stepNumber}</span>}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{title}</p>
            {isComplete && <Badge variant="secondary">Connected</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          {isComplete && completedContent}
        </div>
      </div>
      {action}
    </div>
  )
}

interface SubscriptionStatusCardProps {
  status: SubscriptionStatus
  onRetry: () => void
}

function SubscriptionStatusCard({ status, onRetry }: SubscriptionStatusCardProps) {
  return (
    <div className="rounded-lg border bg-card p-5">
      {status.state === 'loading' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <div>
              <p className="font-medium">Setting up automation...</p>
              <p className="text-sm text-muted-foreground">
                Connecting to Twitch to listen for your predictions
              </p>
            </div>
          </div>
        </div>
      )}

      {status.state === 'success' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/15">
              <Zap className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-emerald-500">Automation active</p>
                <Badge className="bg-emerald-600/15 text-emerald-500 hover:bg-emerald-600/15 border-0">
                  {status.count}/{status.total} events
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Markets will be created automatically when you start a prediction on Twitch
              </p>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Listening for
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Prediction started</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Betting progress</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Betting locked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Prediction resolved</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {status.state === 'error' && (
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-destructive">Setup failed</p>
            <p className="text-sm text-muted-foreground">{status.message}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function HowItWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How it works</CardTitle>
        <CardDescription>What happens after you connect.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
            1
          </div>
          <div>
            <p className="text-sm font-medium">Create a prediction on Twitch</p>
            <p className="text-sm text-muted-foreground">Just like you normally would.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
            2
          </div>
          <div>
            <p className="text-sm font-medium">We create a market automatically</p>
            <p className="text-sm text-muted-foreground">Viewers can bet via the stream overlay.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
            3
          </div>
          <div>
            <p className="text-sm font-medium">Resolve your Twitch prediction</p>
            <p className="text-sm text-muted-foreground">Markets resolve and winners get paid out.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">
            $
          </div>
          <div>
            <p className="text-sm font-medium">You earn 1.5% on all bets</p>
            <p className="text-sm text-muted-foreground">Fees are sent automatically to your wallet.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
