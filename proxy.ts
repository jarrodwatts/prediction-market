/**
 * Next.js proxy for security headers and request handling
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  // Add pathname header for layout detection
  response.headers.set('x-pathname', request.nextUrl.pathname)

  // Security headers
  const headers = response.headers

  // Prevent clickjacking attacks
  headers.set('X-Frame-Options', 'SAMEORIGIN') // Allow Twitch to embed extension

  // Prevent MIME type sniffing
  headers.set('X-Content-Type-Options', 'nosniff')

  // Referrer policy
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy - restrict sensitive browser features
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://extension-files.twitch.tv https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.twitch.tv https://*.abstract.xyz https://*.upstash.io wss://*.abstract.xyz",
    "frame-ancestors https://*.twitch.tv", // Allow Twitch to embed
    "base-uri 'self'",
    "form-action 'self'",
  ]
  headers.set('Content-Security-Policy', cspDirectives.join('; '))

  // HSTS - force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: [
    // Match all routes except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}


