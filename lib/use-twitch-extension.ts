'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Twitch Extension Helper Types
 */
interface TwitchAuth {
  channelId: string
  clientId: string
  token: string
  userId: string
}

interface TwitchContext {
  arePlayerControlsVisible: boolean
  bitrate: number
  bufferSize: number
  displayResolution: string
  game: string
  hlsLatencyBroadcaster: number
  hostingInfo?: {
    hostedChannelId: string
    hostingChannelId: string
  }
  isFullScreen: boolean
  isMuted: boolean
  isPaused: boolean
  isTheatreMode: boolean
  language: string
  mode: 'viewer' | 'dashboard' | 'config'
  playbackMode: 'video' | 'audio' | 'remote' | 'chat-only'
  theme: 'light' | 'dark'
  videoResolution: string
  volume: number
}

interface TwitchConfiguration {
  broadcaster?: {
    content: string
    version: string
  }
  developer?: {
    content: string
    version: string
  }
  global?: {
    content: string
    version: string
  }
}

interface TwitchExtension {
  onAuthorized: (callback: (auth: TwitchAuth) => void) => void
  onContext: (callback: (context: TwitchContext, changed: string[]) => void) => void
  onError: (callback: (error: Error) => void) => void
  configuration: TwitchConfiguration & {
    onChanged: (callback: () => void) => void
    set: (segment: 'broadcaster' | 'developer' | 'global', version: string, content: string) => void
  }
  actions: {
    followChannel: (channelName: string) => void
    minimize: () => void
    onFollow: (callback: (didFollow: boolean, channelName: string) => void) => void
    requestIdShare: () => void
  }
  bits?: {
    getProducts: () => Promise<any[]>
    onTransactionComplete: (callback: (transaction: any) => void) => void
    onTransactionCancelled: (callback: () => void) => void
    useBits: (sku: string) => void
    showBitsBalance: () => void
    setUseLoopback: (useLoopback: boolean) => void
  }
  viewer?: {
    id: string
    sessionToken: string
    isLinked: boolean
    onIdChanged: (callback: (id: string) => void) => void
  }
}

declare global {
  interface Window {
    Twitch?: {
      ext: TwitchExtension
    }
  }
}

export interface UseTwitchExtensionReturn {
  /** Whether the extension is authorized and ready */
  isReady: boolean
  /** Whether there was an error loading the Twitch extension */
  isError: boolean
  /** Error message if any */
  error: string | null
  /** The authenticated channel ID */
  channelId: string | null
  /** The viewer's user ID */
  userId: string | null
  /** JWT token for API calls */
  token: string | null
  /** Current Twitch context (theme, fullscreen, etc.) */
  context: TwitchContext | null
  /** Current theme from Twitch */
  theme: 'light' | 'dark'
  /** Broadcaster configuration */
  broadcasterConfig: string | null
  /** Set broadcaster configuration */
  setBroadcasterConfig: (content: string) => void
  /** Minimize the extension (for overlay) */
  minimize: () => void
}

/**
 * Hook to interact with Twitch Extension Helper
 * 
 * Provides access to channel ID, auth token, context, and configuration.
 * Must be used within extension pages that include the Twitch helper script.
 */
export function useTwitchExtension(): UseTwitchExtensionReturn {
  const [isReady, setIsReady] = useState(false)
  const [isError, setIsError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [channelId, setChannelId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [context, setContext] = useState<TwitchContext | null>(null)
  const [broadcasterConfig, setBroadcasterConfigState] = useState<string | null>(null)

  useEffect(() => {
    // Check if Twitch extension helper is loaded
    const initTwitch = () => {
      if (typeof window === 'undefined') return

      if (!window.Twitch?.ext) {
        // Retry a few times as script might still be loading
        const maxRetries = 10
        let retries = 0
        
        const checkInterval = setInterval(() => {
          retries++
          if (window.Twitch?.ext) {
            clearInterval(checkInterval)
            setupTwitchHandlers()
          } else if (retries >= maxRetries) {
            clearInterval(checkInterval)
            setIsError(true)
            setError('Twitch Extension Helper not available')
          }
        }, 200)
        
        return () => clearInterval(checkInterval)
      } else {
        setupTwitchHandlers()
      }
    }

    const setupTwitchHandlers = () => {
      const ext = window.Twitch!.ext

      // Handle authorization
      ext.onAuthorized((auth) => {
        console.log('Twitch Extension authorized:', auth.channelId)
        setChannelId(auth.channelId)
        setUserId(auth.userId)
        setToken(auth.token)
        setIsReady(true)
      })

      // Handle context changes
      ext.onContext((ctx, changed) => {
        setContext(ctx)
      })

      // Handle errors
      ext.onError((err) => {
        console.error('Twitch Extension error:', err)
        setIsError(true)
        setError(err.message)
      })

      // Handle configuration changes
      ext.configuration.onChanged(() => {
        if (ext.configuration.broadcaster?.content) {
          setBroadcasterConfigState(ext.configuration.broadcaster.content)
        }
      })
    }

    initTwitch()
  }, [])

  const setBroadcasterConfig = useCallback((content: string) => {
    if (window.Twitch?.ext) {
      window.Twitch.ext.configuration.set('broadcaster', '1', content)
      setBroadcasterConfigState(content)
    }
  }, [])

  const minimize = useCallback(() => {
    if (window.Twitch?.ext) {
      window.Twitch.ext.actions.minimize()
    }
  }, [])

  return {
    isReady,
    isError,
    error,
    channelId,
    userId,
    token,
    context,
    theme: context?.theme ?? 'dark',
    broadcasterConfig,
    setBroadcasterConfig,
    minimize,
  }
}

