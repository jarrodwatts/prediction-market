'use client'

/**
 * Streamer Dashboard - Main Website
 *
 * Setup page for streamers accessed from the main website.
 * Uses NextAuth for Twitch OAuth with standard redirect flow.
 */

import { useSession, signIn, signOut } from 'next-auth/react'
import { useLoginWithAbstract, useAbstractClient } from '@abstract-foundation/agw-react'
import { StreamerSetup } from '@/components/streamer/streamer-setup'
import { useStreamerSetup } from '@/lib/hooks/use-streamer-setup'

export default function StreamerPage() {
  const { data: session } = useSession()
  const { login, logout } = useLoginWithAbstract()
  const { data: abstractClient, isLoading: isWalletLoading } = useAbstractClient()

  const walletAddress = abstractClient?.account?.address ?? null
  const channelId = session?.twitchId ?? null

  const { subscriptionStatus, retry } = useStreamerSetup({
    channelId,
    walletAddress,
  })

  return (
    <StreamerSetup
      isTwitchConnected={!!session?.twitchId}
      twitchDisplayName={session?.twitchDisplayName || session?.twitchLogin}
      onTwitchConnect={() => signIn('twitch')}
      walletAddress={walletAddress}
      onWalletConnect={() => login()}
      isWalletLoading={isWalletLoading}
      subscriptionStatus={subscriptionStatus}
      onRetry={retry}
      onSignOut={() => {
        signOut()
        logout()
      }}
    />
  )
}
