import { NextRequest, NextResponse } from 'next/server'
import { storeStreamerSession, getStreamerSession, storeWalletStreamerProfile } from '@/lib/kv'
import { requireChannelOwnership } from '@/lib/middleware/auth'
import { validateBody, validateSearchParams } from '@/lib/middleware/validation'
import { streamerSettingsPostSchema, streamerSettingsGetSchema } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const { data: body, error: validationError } = await validateBody(
      request,
      streamerSettingsPostSchema
    )
    if (validationError) return validationError

    // Verify user owns this channel
    const { error: authError } = await requireChannelOwnership(body.channelId)
    if (authError) return authError

    const { channelId, walletAddress } = body

    // Get existing session or create new one
    const existingSession = await getStreamerSession(channelId)

    // Update session with wallet address
    await storeStreamerSession(channelId, {
      accessToken: existingSession?.accessToken || '',
      refreshToken: existingSession?.refreshToken || '',
      walletAddress,
      expiresAt: existingSession?.expiresAt || 0,
      twitchLogin: existingSession?.twitchLogin,
      twitchDisplayName: existingSession?.twitchDisplayName,
      profileImageUrl: existingSession?.profileImageUrl,
    })

    // Also store reverse lookup so the UI can show the streamer on cards
    await storeWalletStreamerProfile(walletAddress, {
      twitchUserId: channelId,
      twitchLogin: existingSession?.twitchLogin,
      twitchDisplayName: existingSession?.twitchDisplayName,
      profileImageUrl: existingSession?.profileImageUrl,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving streamer settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate query params
    const { data: params, error: validationError } = validateSearchParams(
      request,
      streamerSettingsGetSchema
    )
    if (validationError) return validationError

    // Verify user owns this channel
    const { error: authError } = await requireChannelOwnership(params.channelId)
    if (authError) return authError

    const session = await getStreamerSession(params.channelId)

    if (!session) {
      return NextResponse.json(
        { error: 'Streamer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      walletAddress: session.walletAddress,
      authorized: !!session.accessToken,
    })
  } catch (error) {
    console.error('Error getting streamer settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

