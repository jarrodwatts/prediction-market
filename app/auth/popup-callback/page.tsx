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
  const { data: session, update } = useSession()
  const [isError, setIsError] = useState(false)
  const attemptCount = useRef(0)
  const maxAttempts = 10

  // Derive state from session and error status
  const state = session?.twitchId ? 'success' : (isError ? 'error' : 'loading')

  useEffect(() => {
    // If we're already in a final state, don't do anything
    if (state !== 'loading') {
      if (state === 'success' && window.opener) {
        window.opener.postMessage({ type: 'oauth-success', twitchId: session?.twitchId }, '*')
        setTimeout(() => window.close(), 500)
      } else if (state === 'error' && window.opener) {
        window.opener.postMessage({ type: 'oauth-error', error: 'Session not established' }, '*')
        setTimeout(() => window.close(), 2000)
      }
      return
    }

    const checkSession = async () => {
      attemptCount.current++
      
      // Force a session refresh
      await update()
      
      // If still loading and haven't exceeded attempts, try again
      if (attemptCount.current < maxAttempts) {
        setTimeout(checkSession, 500)
      } else {
        // Give up after max attempts
        setIsError(true)
      }
    }

    // Start checking after initial render
    const timer = setTimeout(checkSession, 500)
    return () => clearTimeout(timer)
  }, [state, update, session?.twitchId])

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
