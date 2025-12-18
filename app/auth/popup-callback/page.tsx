'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

/**
 * OAuth Popup Callback Page
 *
 * This page is loaded after OAuth completes in a popup window.
 * Waits for session to be established, then notifies parent and closes.
 */
export default function PopupCallbackPage() {
  const { data: session, status, update } = useSession()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const attemptCount = useRef(0)
  const maxAttempts = 10

  useEffect(() => {
    const checkSession = async () => {
      attemptCount.current++
      
      // Force a session refresh
      await update()
      
      // Check if we have a valid session now
      if (session?.twitchId) {
        setState('success')
        // Notify parent window of success
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-success', twitchId: session.twitchId }, '*')
        }
        // Close after brief delay
        setTimeout(() => window.close(), 500)
        return
      }

      // If still loading and haven't exceeded attempts, try again
      if (attemptCount.current < maxAttempts) {
        setTimeout(checkSession, 500)
      } else {
        // Give up after max attempts
        setState('error')
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth-error', error: 'Session not established' }, '*')
        }
        setTimeout(() => window.close(), 2000)
      }
    }

    // Start checking after initial render
    const timer = setTimeout(checkSession, 500)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Also react to session changes from useSession
  useEffect(() => {
    if (session?.twitchId && state === 'loading') {
      setState('success')
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-success', twitchId: session.twitchId }, '*')
      }
      setTimeout(() => window.close(), 500)
    }
  }, [session, state])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Completing sign in...</p>
        </div>
      </div>
    )
  }

  if (state === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
          <p className="text-sm text-muted-foreground">Sign in successful!</p>
          <p className="text-xs text-muted-foreground">This window will close automatically.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <XCircle className="h-8 w-8 mx-auto text-destructive" />
        <p className="text-sm text-muted-foreground">Sign in failed</p>
        <p className="text-xs text-muted-foreground">This window will close automatically.</p>
      </div>
    </div>
  )
}
