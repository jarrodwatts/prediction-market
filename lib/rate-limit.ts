/**
 * Rate limiting utility using Upstash Rate Limit
 *
 * Protects endpoints from abuse and DoS attacks by limiting requests per IP.
 * Uses Vercel KV (Redis) for distributed rate limiting across serverless instances.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { kv } from '@vercel/kv'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from './logger'

/**
 * Rate limiters for different endpoint types
 */
const limiters = {
  // Public read endpoints: 30 requests per minute per IP
  public: new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    analytics: true,
    prefix: 'ratelimit:public',
  }),

  // Webhook endpoint: 100 requests per minute per IP (Twitch can retry)
  webhook: new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    analytics: true,
    prefix: 'ratelimit:webhook',
  }),

  // Admin endpoints: 10 requests per minute per IP
  admin: new Ratelimit({
    redis: kv,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    analytics: true,
    prefix: 'ratelimit:admin',
  }),
}

/**
 * Get client identifier from request
 * Uses x-forwarded-for header (Vercel provides this)
 */
function getClientId(request: NextRequest): string {
  // Try Vercel-specific headers first
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  // Fallback to x-real-ip
  const ip = request.headers.get('x-real-ip')
  return ip || 'anonymous'
}

/**
 * Apply rate limiting to a request
 *
 * @param request - Next.js request object
 * @param limiterType - Type of rate limiter to use ('public', 'webhook', or 'admin')
 * @returns NextResponse with 429 status if rate limited, null if allowed
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const rateLimitResponse = await checkRateLimit(request, 'public')
 *   if (rateLimitResponse) return rateLimitResponse
 *
 *   // ... normal request handling
 * }
 * ```
 */
export async function checkRateLimit(
  request: NextRequest,
  limiterType: keyof typeof limiters = 'public'
): Promise<NextResponse | null> {
  try {
    const clientId = getClientId(request)
    const limiter = limiters[limiterType]

    const { success, limit, reset, remaining } = await limiter.limit(clientId)

    // Add rate limit headers to response (informational)
    const headers = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
    }

    if (!success) {
      logger.warn('Rate limit exceeded', {
        clientId,
        limiterType,
        limit,
        reset: new Date(reset * 1000).toISOString(),
      })

      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.ceil((reset * 1000 - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': Math.ceil((reset * 1000 - Date.now()) / 1000).toString(),
          },
        }
      )
    }

    // Request allowed - headers would be added to successful response if needed
    return null
  } catch (error) {
    // If rate limiting fails (e.g., KV down), allow the request through
    // Better to have service available than block all traffic
    logger.error('Rate limiting check failed, allowing request', error)
    return null
  }
}

/**
 * Convenience wrapper for route handlers
 * Wraps an entire route handler with rate limiting
 *
 * @param handler - The route handler function
 * @param limiterType - Type of rate limiter to use
 * @returns Wrapped handler with rate limiting
 *
 * @example
 * ```typescript
 * async function handler(request: NextRequest) {
 *   // ... route logic
 * }
 *
 * export const GET = withRateLimit(handler, 'public')
 * ```
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<NextResponse>,
  limiterType: keyof typeof limiters = 'public'
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const rateLimitResponse = await checkRateLimit(request, limiterType)
    if (rateLimitResponse) {
      return rateLimitResponse
    }
    return handler(request)
  }
}
