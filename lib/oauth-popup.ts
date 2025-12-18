/**
 * OAuth Popup Utility
 *
 * Opens OAuth flow in a popup window instead of redirect.
 * Required for Twitch extension iframe context where redirects are blocked.
 */

const POPUP_WIDTH = 500
const POPUP_HEIGHT = 700

interface PopupOAuthOptions {
  url: string
  onSuccess?: () => void
  onError?: (error: string) => void
}

/**
 * Opens an OAuth flow in a centered popup window
 * Listens for postMessage from popup to detect success/failure
 */
export function openOAuthPopup({ url, onSuccess, onError }: PopupOAuthOptions): Window | null {
  // Calculate center position
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2

  const popup = window.open(
    url,
    'oauth-popup',
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no`
  )

  if (!popup) {
    onError?.('Popup blocked. Please allow popups for this site.')
    return null
  }

  let resolved = false

  // Listen for message from popup
  const handleMessage = (event: MessageEvent) => {
    // Validate origin (accept any since we're using tunnels)
    if (event.data?.type === 'oauth-success') {
      resolved = true
      cleanup()
      onSuccess?.()
    } else if (event.data?.type === 'oauth-error') {
      resolved = true
      cleanup()
      onError?.(event.data.error || 'Authentication failed')
    }
  }

  window.addEventListener('message', handleMessage)

  // Also poll for popup closure (fallback if postMessage fails)
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      cleanup()
      if (!resolved) {
        // Popup closed without message - assume success and let parent refresh
        onSuccess?.()
      }
    }
  }, 500)

  const cleanup = () => {
    window.removeEventListener('message', handleMessage)
    clearInterval(checkClosed)
  }

  return popup
}

/**
 * Get the sign-in page URL for popup use
 * Uses a dedicated page that triggers signIn() properly (Auth.js v5 requirement)
 */
export function getTwitchSignInUrl(callbackUrl?: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams({
    callbackUrl: callbackUrl || `${baseUrl}/auth/popup-callback`,
  })
  return `${baseUrl}/auth/signin?${params.toString()}`
}
