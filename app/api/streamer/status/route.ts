import { NextRequest, NextResponse } from 'next/server'
import { getStreamerSession } from '@/lib/kv'

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
      return NextResponse.json({
        registered: false,
        authorized: false,
        walletConnected: false,
      })
    }

    return NextResponse.json({
      registered: true,
      authorized: !!session.accessToken,
      walletConnected: !!session.walletAddress,
      walletAddress: session.walletAddress || null,
    })
  } catch (error) {
    console.error('Error getting streamer status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

