/**
 * Authentication middleware for API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * Verify the user has an active session
 */
export async function requireAuth() {
  const session = await auth()

  if (!session) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      ),
      session: null,
    }
  }

  return { error: null, session }
}

/**
 * Verify the authenticated user owns the specified channel
 *
 * @param channelId - The Twitch channel ID being accessed
 */
export async function requireChannelOwnership(channelId: string) {
  const { error, session } = await requireAuth()

  if (error) {
    return { error, session: null }
  }

  if (session!.twitchId !== channelId) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden - You do not own this channel' },
        { status: 403 }
      ),
      session: null,
    }
  }

  return { error: null, session }
}

/**
 * Verify request is from an admin (backend wallet owner)
 *
 * Currently checks against a bearer token for simplicity.
 * For production, consider implementing proper RBAC or multi-sig verification.
 */
export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const adminToken = process.env.ADMIN_API_TOKEN

  // If no admin token is configured, reject all requests
  if (!adminToken) {
    console.error('ADMIN_API_TOKEN not configured')
    return {
      error: NextResponse.json(
        { error: 'Admin API not configured' },
        { status: 503 }
      ),
      authorized: false,
    }
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized - Bearer token required' },
        { status: 401 }
      ),
      authorized: false,
    }
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix

  if (token !== adminToken) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden - Invalid admin token' },
        { status: 403 }
      ),
      authorized: false,
    }
  }

  return { error: null, authorized: true }
}
