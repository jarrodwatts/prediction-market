'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { Twitch, Wallet, CheckCircle, Loader2, Zap, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type SubscriptionStatus = 
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; count: number; total: number }
  | { state: 'error'; message: string }

export default function StreamerDashboard() {
  const { data: session } = useSession()
  const { login } = useLoginWithAbstract()
  const { data: abstractClient } = useAbstractClient()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const saveWalletCallCountRef = useRef(0)

  // Update wallet address when AGW client changes
  useEffect(() => {
    if (abstractClient?.account?.address) {
      setWalletAddress(abstractClient.account.address)
    } else {
      setWalletAddress(null)
    }
  }, [abstractClient])

  // Determine current step
  useEffect(() => {
    if (session?.twitchId && walletAddress) {
      setStep(3) // Complete
    } else if (session?.twitchId) {
      setStep(2) // Connect wallet
    } else {
      setStep(1) // Connect Twitch
    }
  }, [session, walletAddress])

  const [subscribeStatus, setSubscribeStatus] = useState<SubscriptionStatus>({ state: 'idle' })

  const saveWalletAddress = async () => {
    if (!walletAddress || !session?.twitchId) return

    try {
      saveWalletCallCountRef.current += 1

      // Save wallet address
      await fetch('/api/streamer/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: session.twitchId,
          walletAddress,
        }),
      })

      // Register EventSub subscriptions
      setSubscribeStatus({ state: 'loading' })
      const subRes = await fetch('/api/twitch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })

      const subData = await subRes.json()
      if (subRes.ok && subData.success) {
        const successCount = subData.results?.filter((r: { success: boolean }) => r.success).length ?? 0
        const totalCount = subData.results?.length ?? 4
        setSubscribeStatus({ state: 'success', count: successCount, total: totalCount })
        console.log('EventSub subscriptions:', subData.results)
      } else {
        setSubscribeStatus({ 
          state: 'error', 
          message: subData.error || subData.message || 'Failed to subscribe to Twitch events.' 
        })
        console.error('EventSub subscription failed:', subData)
      }
    } catch (error) {
      console.error('Failed to save wallet:', error)
      setSubscribeStatus({ state: 'error', message: 'Failed to complete setup. Please try again.' })
    }
  }

  // Save wallet when connected
  useEffect(() => {
    if (walletAddress && session?.twitchId) {
      saveWalletAddress()
    }
  }, [walletAddress, session])

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

        {session && (
          <Button variant="outline" onClick={() => signOut()}>
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
                {/* Step 1 */}
                <div
                  className={`flex items-start justify-between gap-4 px-6 py-5 transition-colors ${
                    step === 1 ? 'bg-muted/20 hover:bg-muted/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-sm font-semibold">
                      {step > 1 ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <span>1</span>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Connect Twitch</p>
                        {step > 1 && <Badge variant="secondary">Connected</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        We’ll sync your channel and automate prediction setup.
                      </p>
                      {step > 1 && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Signed in as{' '}
                          <span className="font-medium text-foreground">
                            {session?.twitchDisplayName || session?.twitchLogin}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {step === 1 ? (
                    <Button onClick={() => signIn('twitch')} className="gap-2">
                      <Twitch className="h-4 w-4" />
                      Connect
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled className="opacity-80">
                      Connected
                    </Button>
                  )}
                </div>

                {/* Step 2 */}
                <div
                  className={`flex items-start justify-between gap-4 px-6 py-5 transition-colors ${
                    step === 2 ? 'bg-muted/20 hover:bg-muted/20' : step >= 2 && !walletAddress ? 'hover:bg-muted/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border bg-background text-sm font-semibold">
                      {step > 2 ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <span>2</span>}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">Connect wallet</p>
                        {step > 2 && <Badge variant="secondary">Connected</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">Receive your fee earnings in USDC.</p>
                      {walletAddress && (
                        <p className="mt-2 font-mono text-sm text-muted-foreground">
                          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                        </p>
                      )}
                    </div>
                  </div>

                  {step < 2 ? (
                    <Button variant="secondary" disabled className="gap-2 opacity-60">
                      <Wallet className="h-4 w-4" />
                      Connect
                    </Button>
                  ) : walletAddress ? (
                    <Button variant="secondary" disabled className="opacity-80">
                      Connected
                    </Button>
                  ) : (
                    <Button onClick={() => login()} className="gap-2">
                      <Wallet className="h-4 w-4" />
                      Connect
                    </Button>
                  )}
                </div>
              </div>

              {/* Subscription Status */}
              {subscribeStatus.state !== 'idle' && (
                <div className="rounded-lg border bg-card p-5">
                  {subscribeStatus.state === 'loading' && (
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

                  {subscribeStatus.state === 'success' && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600/15">
                          <Zap className="h-5 w-5 text-emerald-500" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-emerald-500">Automation active</p>
                            <Badge className="bg-emerald-600/15 text-emerald-500 hover:bg-emerald-600/15 border-0">
                              {subscribeStatus.count}/{subscribeStatus.total} events
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

                  {subscribeStatus.state === 'error' && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-destructive">Setup failed</p>
                        <p className="text-sm text-muted-foreground">{subscribeStatus.message}</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={() => {
                            setSubscribeStatus({ state: 'idle' })
                            saveWalletAddress()
                          }}
                        >
                          Try again
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* How it works column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>What happens after you connect.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">1</div>
                <div>
                  <p className="text-sm font-medium">Create a prediction on Twitch</p>
                  <p className="text-sm text-muted-foreground">Just like you normally would.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">2</div>
                <div>
                  <p className="text-sm font-medium">We create a market automatically</p>
                  <p className="text-sm text-muted-foreground">Viewers can bet via the stream overlay.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">3</div>
                <div>
                  <p className="text-sm font-medium">Resolve your Twitch prediction</p>
                  <p className="text-sm text-muted-foreground">Markets resolve and winners get paid out.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">$</div>
                <div>
                  <p className="text-sm font-medium">You earn 1.5% on all bets</p>
                  <p className="text-sm text-muted-foreground">Fees are sent automatically to your wallet.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
