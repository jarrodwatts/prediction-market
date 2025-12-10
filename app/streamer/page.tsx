'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { Twitch, Wallet, CheckCircle, ArrowRight, BarChart3, DollarSign, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function StreamerDashboard() {
  const { data: session, status } = useSession()
  const { login, logout } = useLoginWithAbstract()
  const { data: abstractClient } = useAbstractClient()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [stats, setStats] = useState({
    totalMarkets: 0,
    totalVolume: 0,
    totalFees: 0,
    activeBettors: 0,
  })

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

  // Load stats when setup is complete
  useEffect(() => {
    if (step === 3 && session?.twitchId) {
      loadStats()
    }
  }, [step, session])

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/streamer/stats?channelId=${session?.twitchId}`)
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const [subscribeStatus, setSubscribeStatus] = useState<string | null>(null)

  const saveWalletAddress = async () => {
    if (!walletAddress || !session?.twitchId) return
    
    try {
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
      setSubscribeStatus('Subscribing to Twitch events...')
      const subRes = await fetch('/api/twitch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
      
      const subData = await subRes.json()
      if (subRes.ok && subData.success) {
        setSubscribeStatus(`✅ ${subData.message}`)
        console.log('EventSub subscriptions:', subData.results)
      } else {
        setSubscribeStatus(`⚠️ ${subData.error || subData.message}`)
        console.error('EventSub subscription failed:', subData)
      }
    } catch (error) {
      console.error('Failed to save wallet:', error)
      setSubscribeStatus('❌ Failed to set up')
    }
  }

  // Save wallet when connected
  useEffect(() => {
    if (walletAddress && session?.twitchId) {
      saveWalletAddress()
    }
  }, [walletAddress, session])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a]">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                Turn Predictions Into Profit
              </span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Let your viewers bet real money on your Twitch predictions. You earn 1.5% on every bet.
            </p>
          </div>
        </div>
      </div>

      {/* Setup Steps */}
      <div className="mx-auto max-w-2xl px-6 pb-20">
        {/* Step 1: Connect Twitch */}
        <div className={`mb-6 rounded-2xl border transition-all ${step >= 1 ? 'border-purple-500/30 bg-purple-500/5' : 'border-border/50 bg-card/50'}`}>
          <div className="flex items-center gap-4 p-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${step > 1 ? 'bg-green-500/20 text-green-500' : 'bg-purple-500/20 text-purple-400'}`}>
              {step > 1 ? <CheckCircle className="h-5 w-5" /> : <span className="font-semibold">1</span>}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Connect Your Twitch Account</h3>
              <p className="text-sm text-muted-foreground">
                We'll sync your predictions automatically
              </p>
            </div>
            {step === 1 ? (
              <Button onClick={() => signIn('twitch')} className="gap-2 bg-[#9147ff] hover:bg-[#772ce8]">
                <Twitch className="h-4 w-4" />
                Connect Twitch
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle className="h-4 w-4" />
                Connected as {session?.twitchDisplayName || session?.twitchLogin}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Connect Wallet */}
        <div className={`mb-6 rounded-2xl border transition-all ${step >= 2 ? 'border-purple-500/30 bg-purple-500/5' : 'border-border/50 bg-card/50 opacity-50'}`}>
          <div className="flex items-center gap-4 p-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${step > 2 ? 'bg-green-500/20 text-green-500' : step >= 2 ? 'bg-purple-500/20 text-purple-400' : 'bg-muted'}`}>
              {step > 2 ? <CheckCircle className="h-5 w-5" /> : <span className="font-semibold">2</span>}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Connect Your Wallet</h3>
              <p className="text-sm text-muted-foreground">
                Receive your fee earnings in USDC
              </p>
            </div>
            {step === 2 ? (
              walletAddress ? (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </div>
              ) : (
                <Button onClick={() => login()} className="gap-2">
                  <Wallet className="h-4 w-4" />
                  Connect Wallet
                </Button>
              )
            ) : step > 2 ? (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle className="h-4 w-4" />
                {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
              </div>
            ) : (
              <Button disabled className="gap-2">
                <Wallet className="h-4 w-4" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>

        {/* Step 3: Ready */}
        <div className={`mb-6 rounded-2xl border transition-all ${step === 3 ? 'border-green-500/30 bg-green-500/5' : 'border-border/50 bg-card/50 opacity-50'}`}>
          <div className="flex items-center gap-4 p-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${step === 3 ? 'bg-green-500/20 text-green-500' : 'bg-muted'}`}>
              {step === 3 ? <CheckCircle className="h-5 w-5" /> : <span className="font-semibold">3</span>}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Start Earning!</h3>
              <p className="text-sm text-muted-foreground">
                Create predictions on Twitch, we'll handle the rest
              </p>
            </div>
            {step === 3 && (
              <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-medium text-green-500">
                Active
              </span>
            )}
          </div>
        </div>

        {/* Stats Section - Only show when setup complete */}
        {step === 3 && (
          <div className="mt-10">
            <h2 className="mb-6 text-xl font-semibold">Your Stats</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                <BarChart3 className="mb-2 h-5 w-5 text-purple-400" />
                <div className="text-2xl font-bold">{stats.totalMarkets}</div>
                <div className="text-xs text-muted-foreground">Markets</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                <DollarSign className="mb-2 h-5 w-5 text-green-400" />
                <div className="text-2xl font-bold">${stats.totalVolume.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Volume</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                <DollarSign className="mb-2 h-5 w-5 text-yellow-400" />
                <div className="text-2xl font-bold">${stats.totalFees.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">Fees Earned</div>
              </div>
              <div className="rounded-xl border border-border/50 bg-card/50 p-4">
                <Users className="mb-2 h-5 w-5 text-blue-400" />
                <div className="text-2xl font-bold">{stats.activeBettors}</div>
                <div className="text-xs text-muted-foreground">Bettors</div>
              </div>
            </div>
          </div>
        )}

        {/* How it Works */}
        <div className="mt-10 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6">
          <h2 className="mb-4 text-lg font-semibold">How it Works</h2>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-medium text-purple-400">1</div>
              <div>
                <p className="font-medium">Create a prediction on Twitch</p>
                <p className="text-sm text-muted-foreground">Just like you normally would</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-medium text-purple-400">2</div>
              <div>
                <p className="font-medium">We auto-create a USDC market</p>
                <p className="text-sm text-muted-foreground">Viewers see a betting overlay on your stream</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-sm font-medium text-purple-400">3</div>
              <div>
                <p className="font-medium">Resolve your Twitch prediction</p>
                <p className="text-sm text-muted-foreground">We auto-resolve the market and pay out winners</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-sm font-medium text-green-400">$</div>
              <div>
                <p className="font-medium">You earn 1.5% on all bets</p>
                <p className="text-sm text-muted-foreground">Automatically sent to your wallet</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sign Out Button */}
        {session && (
          <div className="mt-8 text-center">
            <Button variant="ghost" onClick={() => signOut()} className="text-muted-foreground">
              Sign out
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

