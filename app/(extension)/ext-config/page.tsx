'use client'

/**
 * Twitch Extension Config Page
 *
 * Setup page for streamers accessed from within Twitch's extension iframe.
 * Uses popup-based OAuth since redirects don't work in iframes.
 */

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { useTwitchExtension } from '@/lib/use-twitch-extension'
import { StreamerSetup } from '@/components/streamer/streamer-setup'
import { useStreamerSetup } from '@/lib/hooks/use-streamer-setup'
import { openOAuthPopup, getTwitchSignInUrl } from '@/lib/oauth-popup'
import { Loader2 } from 'lucide-react'

export default function ExtConfigPage() {
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)

  // Twitch extension context - gives us channelId
  const { isReady, isError, error: extensionError, channelId: extensionChannelId } = useTwitchExtension()

  // NextAuth session - needed for OAuth/EventSub permissions
  const { data: session, update: updateSession } = useSession()

  // Wallet connection
  const { login } = useLoginWithAbstract()
  const { data: abstractClient, isLoading: isWalletLoading } = useAbstractClient()

  const walletAddress = abstractClient?.account?.address ?? null

  // Use session's twitchId for subscriptions (requires OAuth),
  // fall back to extension channelId for display purposes
  const channelId = session?.twitchId ?? extensionChannelId ?? null

  const { subscriptionStatus, retry } = useStreamerSetup({
    channelId: session?.twitchId ?? null, // Only use OAuth'd channelId for subscriptions
    walletAddress,
  })

  // Handle Twitch OAuth via popup (required for iframe context)
  const handleTwitchConnect = useCallback(() => {
    setIsOAuthLoading(true)

    openOAuthPopup({
      url: getTwitchSignInUrl(),
      onSuccess: () => {
        // Refresh the session to pick up new auth
        updateSession()
        setIsOAuthLoading(false)
      },
      onError: (error) => {
        console.error('OAuth popup error:', error)
        setIsOAuthLoading(false)
      },
    })
  }, [updateSession])

  // Show loading state while extension initializes
  if (!isReady && !isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connecting to Twitch...</p>
        </div>
      </div>
    )
  }

  // Show error if extension failed to load
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-destructive font-medium">Failed to load extension</p>
          <p className="text-sm text-muted-foreground">
            {extensionError || 'Please make sure you are viewing this page within the Twitch extension.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <StreamerSetup
      isTwitchConnected={!!session?.twitchId}
      twitchDisplayName={session?.twitchDisplayName || session?.twitchLogin}
      onTwitchConnect={handleTwitchConnect}
      isTwitchLoading={isOAuthLoading}
      walletAddress={walletAddress}
      onWalletConnect={() => login()}
      isWalletLoading={isWalletLoading}
      subscriptionStatus={subscriptionStatus}
      onRetry={retry}
      // No sign out in extension context - less confusing for users
    />
  )
}
