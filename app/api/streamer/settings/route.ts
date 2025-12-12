import { NextRequest, NextResponse } from 'next/server'
import { storeStreamerSession, getStreamerSession, storeWalletStreamerProfile } from '@/lib/kv'
import { subscribeToChannelPredictions } from '@/lib/twitch/eventsub'
import { auth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { channelId, walletAddress, defaultLiquidity } = body

    if (!channelId || !walletAddress) {
      return NextResponse.json(
        { error: 'channelId and walletAddress are required' },
        { status: 400 }
      )
    }

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
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

    if (!channelId) {
      return NextResponse.json(
        { error: 'channelId is required' },
        { status: 400 }
      )
    }

    const session = await getStreamerSession(channelId)

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

