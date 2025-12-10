'use client'

/**
 * Twitch Extension Config Page
 * 
 * Configuration page for streamers to set up the prediction market extension.
 * This runs within the Twitch Extension Config view (not on our main site).
 */

import { useState, useEffect } from 'react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { CheckCircle, Wallet, Twitch, ExternalLink, Loader2, AlertCircle, DollarSign, BarChart3, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

// API Base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || ''

interface StreamerStatus {
  isRegistered: boolean
  hasWallet: boolean
  hasSubscriptions: boolean
  walletAddress?: string
}

interface StreamerStats {
  totalMarkets: number
  totalVolume: number
  totalFees: number
  activeBettors: number
}

export default function ExtConfigPage() {
  const [status, setStatus] = useState<StreamerStatus | null>(null)
  const [stats, setStats] = useState<StreamerStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Twitch extension context
  const { isReady, channelId, token, setBroadcasterConfig, broadcasterConfig } = useTwitchExtension()

  // Wallet connection
  const { login } = useLoginWithAbstract()
  const { data: abstractClient, isLoading: isWalletLoading } = useAbstractClient()
  const walletAddress = abstractClient?.account?.address

  // Check if streamer is already set up
  useEffect(() => {
    if (!isReady || !channelId) return

    const checkStatus = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`${API_BASE_URL}/api/streamer/status?channelId=${channelId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        })
        
        if (res.ok) {
          const data = await res.json()
          setStatus(data)
        } else {
          setStatus({
            isRegistered: false,
            hasWallet: false,
            hasSubscriptions: false,
          })
        }
      } catch (err) {
        console.error('Error checking status:', err)
        setError('Failed to check registration status')
      } finally {
        setIsLoading(false)
      }
    }

    checkStatus()
  }, [isReady, channelId, token])

  // Load stats if registered
  useEffect(() => {
    if (!status?.isRegistered || !channelId) return

    const loadStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/streamer/stats?channelId=${channelId}`)
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch (err) {
        console.error('Error loading stats:', err)
      }
    }

    loadStats()
  }, [status, channelId])

  // Save wallet and set up EventSub subscriptions
  const handleSetup = async () => {
    if (!walletAddress || !channelId) return

    try {
      setIsSaving(true)
      setError(null)

      // Save wallet address
      const settingsRes = await fetch(`${API_BASE_URL}/api/streamer/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          walletAddress,
        }),
      })

      if (!settingsRes.ok) {
        throw new Error('Failed to save wallet address')
      }

      // Note: EventSub subscriptions require OAuth flow which can't be done in extension
      // The streamer needs to visit the main app to complete this step
      
      // Save config to Twitch's broadcaster config
      setBroadcasterConfig(JSON.stringify({
        walletAddress,
        setupAt: Date.now(),
      }))

      // Update status
      setStatus(prev => ({
        ...prev!,
        isRegistered: true,
        hasWallet: true,
        walletAddress,
      }))

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error during setup:', err)
      setError(err.message || 'Setup failed')
    } finally {
      setIsSaving(false)
    }
  }

  // Determine current setup step
  const currentStep = !status?.hasWallet ? 1 : !status?.hasSubscriptions ? 2 : 3

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#0f0f1a] p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">
            🎯 Prediction Market Setup
          </h1>
          <p className="text-white/60 text-sm">
            Let your viewers bet real USDC on your predictions
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Setup Error</p>
              <p className="text-red-400/70 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Twitch Connected (always complete in extension context) */}
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20 text-green-500">
              <CheckCircle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-sm">Twitch Connected</h3>
              <p className="text-xs text-white/50">
                Channel ID: {channelId}
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Connect Wallet */}
        <div className={cn(
          'mb-4 rounded-xl border p-4 transition-all',
          currentStep >= 1
            ? status?.hasWallet
              ? 'border-green-500/30 bg-green-500/5'
              : 'border-purple-500/30 bg-purple-500/5'
            : 'border-white/10 bg-white/5 opacity-50'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              status?.hasWallet
                ? 'bg-green-500/20 text-green-500'
                : 'bg-purple-500/20 text-purple-400'
            )}>
              {status?.hasWallet ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <span className="text-sm font-semibold">2</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-sm">Connect Your Wallet</h3>
              <p className="text-xs text-white/50">
                Receive your fee earnings in USDC
              </p>
            </div>
          </div>
          
          {!status?.hasWallet && (
            <div className="mt-4">
              {walletAddress ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-white/80 bg-white/5 rounded-lg px-3 py-2">
                    <Wallet className="w-4 h-4 text-purple-400" />
                    <span className="font-mono">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
                  </div>
                  <button
                    onClick={handleSetup}
                    disabled={isSaving}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-lg font-semibold text-white text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Setting up...
                      </>
                    ) : saveSuccess ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Saved!
                      </>
                    ) : (
                      'Save & Continue'
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => login()}
                  disabled={isWalletLoading}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-lg font-semibold text-white text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {isWalletLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  Connect Wallet
                </button>
              )}
            </div>
          )}
          
          {status?.hasWallet && status.walletAddress && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
              <span className="font-mono">{status.walletAddress.slice(0, 8)}...{status.walletAddress.slice(-6)}</span>
            </div>
          )}
        </div>

        {/* Step 3: Enable Prediction Sync */}
        <div className={cn(
          'mb-4 rounded-xl border p-4 transition-all',
          status?.hasSubscriptions
            ? 'border-green-500/30 bg-green-500/5'
            : status?.hasWallet
              ? 'border-purple-500/30 bg-purple-500/5'
              : 'border-white/10 bg-white/5 opacity-50'
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full',
              status?.hasSubscriptions
                ? 'bg-green-500/20 text-green-500'
                : status?.hasWallet
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-white/10 text-white/30'
            )}>
              {status?.hasSubscriptions ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <span className="text-sm font-semibold">3</span>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white text-sm">Enable Prediction Sync</h3>
              <p className="text-xs text-white/50">
                Authorize us to sync your Twitch predictions
              </p>
            </div>
          </div>
          
          {status?.hasWallet && !status.hasSubscriptions && (
            <div className="mt-4">
              <a
                href={`${API_BASE_URL}/streamer`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-[#9147ff] hover:bg-[#772ce8] rounded-lg font-semibold text-white text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Twitch className="w-4 h-4" />
                Complete Setup on Website
                <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-xs text-white/40 text-center mt-2">
                Opens in a new tab for Twitch OAuth
              </p>
            </div>
          )}
          
          {status?.hasSubscriptions && (
            <div className="mt-3 text-sm text-green-400">
              ✓ Prediction sync enabled
            </div>
          )}
        </div>

        {/* Stats Section - Only show when fully set up */}
        {status?.hasSubscriptions && stats && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">Your Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <BarChart3 className="w-4 h-4 text-purple-400 mb-1" />
                <div className="text-xl font-bold text-white">{stats.totalMarkets}</div>
                <div className="text-xs text-white/50">Markets</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <DollarSign className="w-4 h-4 text-green-400 mb-1" />
                <div className="text-xl font-bold text-white">${stats.totalVolume.toLocaleString()}</div>
                <div className="text-xs text-white/50">Volume</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <DollarSign className="w-4 h-4 text-yellow-400 mb-1" />
                <div className="text-xl font-bold text-white">${stats.totalFees.toFixed(2)}</div>
                <div className="text-xs text-white/50">Fees Earned</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <Users className="w-4 h-4 text-blue-400 mb-1" />
                <div className="text-xl font-bold text-white">{stats.activeBettors}</div>
                <div className="text-xs text-white/50">Bettors</div>
              </div>
            </div>
          </div>
        )}

        {/* How it Works */}
        <div className="mt-8 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
          <h2 className="text-sm font-semibold text-white mb-3">How it Works</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-medium text-purple-400">1</div>
              <p className="text-white/70">Create a prediction on Twitch as usual</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-medium text-purple-400">2</div>
              <p className="text-white/70">We auto-create a USDC market</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-medium text-purple-400">3</div>
              <p className="text-white/70">Viewers bet through the overlay</p>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/20 text-xs font-medium text-green-400">$</div>
              <p className="text-white/70">You earn <strong className="text-purple-400">1.5%</strong> of all bets!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

