/**
 * CORS configuration for API endpoints
 */

/**
 * Allowed origins for CORS requests
 * - Twitch extension overlay URLs
 * - Local development
 * - Production app domain
 */
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  // Twitch CDN for extensions
  /^https:\/\/[a-z0-9-]+\.ext-twitch\.tv$/,
  // Local development
  'http://localhost:3000',
  'http://localhost:8080',
  // Production (update with your actual domain)
  process.env.NEXT_PUBLIC_APP_URL,
  // Ngrok tunnels for development
  /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
].filter((x): x is string | RegExp => Boolean(x)) // Remove undefined values with type guard

/**
 * Get CORS headers for a request
 *
 * @param origin - Request origin header
 * @param allowMethods - Allowed HTTP methods
 * @returns CORS headers object
 */
export function getCorsHeaders(
  origin: string | null,
  allowMethods: string = 'GET, OPTIONS'
): Record<string, string> {
  // Check if origin is allowed
  const isAllowed =
    !origin ||
    ALLOWED_ORIGINS.some((allowed) => {
      if (typeof allowed === 'string') {
        return allowed === origin
      }
      // RegExp pattern
      return allowed.test(origin)
    })

  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : '*',
    'Access-Control-Allow-Methods': allowMethods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 24 hours
  }
}

/**
 * Default CORS headers for public API endpoints
 */
export const DEFAULT_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
