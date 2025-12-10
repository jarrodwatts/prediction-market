import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { storeStreamerSession, getStreamerSession } from '@/lib/kv'

const TWITCH_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

/**
 * Get an App Access Token using Client Credentials flow
 * This is required for EventSub webhook subscriptions
 */
async function getAppAccessToken(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID!
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!
  
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to get app access token: ${JSON.stringify(error)}`)
  }
  
  const data = await response.json()
  return data.access_token
}

export async function POST(request: NextRequest) {
  try {
    // Get the authenticated session
    const session = await auth()
    
    if (!session?.twitchId || !session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated with Twitch' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    const clientId = process.env.TWITCH_CLIENT_ID!
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET!
    const webhookUrl = `${process.env.NEXTAUTH_URL}/api/twitch/webhook`

    console.log('Subscribing to EventSub for channel:', session.twitchId)
    console.log('Webhook URL:', webhookUrl)
    
    // Get App Access Token (required for EventSub subscriptions)
    console.log('Getting App Access Token...')
    const appAccessToken = await getAppAccessToken()
    console.log('✅ Got App Access Token')

    // Event types to subscribe to
    const eventTypes = [
      'channel.prediction.begin',
      'channel.prediction.progress', 
      'channel.prediction.lock',
      'channel.prediction.end',
    ]

    // First, check existing subscriptions to avoid duplicates
    const existingResponse = await fetch(TWITCH_API_URL, {
      headers: {
        'Authorization': `Bearer ${appAccessToken}`,
        'Client-Id': clientId,
      },
    })
    const existingData = await existingResponse.json()
    const existingSubscriptions = existingData.data?.filter(
      (sub: any) => sub.condition?.broadcaster_user_id === session.twitchId && sub.status === 'enabled'
    ) || []
    
    const existingTypes = new Set(existingSubscriptions.map((sub: any) => sub.type))
    console.log(`📋 Found ${existingSubscriptions.length} existing subscriptions:`, Array.from(existingTypes))

    const results = []

    for (const type of eventTypes) {
      // Skip if subscription already exists
      if (existingTypes.has(type)) {
        console.log(`⏭️ Already subscribed to ${type}, skipping`)
        results.push({ type, success: true, skipped: true })
        continue
      }
      
      try {
        const response = await fetch(TWITCH_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${appAccessToken}`,
            'Client-Id': clientId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            version: '1',
            condition: {
              broadcaster_user_id: session.twitchId,
            },
            transport: {
              method: 'webhook',
              callback: webhookUrl,
              secret: webhookSecret,
            },
          }),
        })

        const data = await response.json()
        
        if (response.ok) {
          console.log(`✅ Subscribed to ${type}`)
          results.push({ type, success: true, id: data.data?.[0]?.id })
        } else if (response.status === 409) {
          // Subscription already exists (race condition)
          console.log(`⏭️ ${type} already exists (409), skipping`)
          results.push({ type, success: true, skipped: true })
        } else {
          console.error(`❌ Failed to subscribe to ${type}:`, data)
          results.push({ type, success: false, error: data.message || data.error })
        }
      } catch (error) {
        console.error(`Error subscribing to ${type}:`, error)
        results.push({ type, success: false, error: String(error) })
      }
    }

    // Store streamer session with wallet address
    await storeStreamerSession(session.twitchId, {
      accessToken: session.accessToken,
      refreshToken: '', // We don't have refresh token in session currently
      walletAddress,
      expiresAt: Date.now() + 3600000, // 1 hour from now
    })

    const successCount = results.filter(r => r.success).length
    
    return NextResponse.json({
      success: successCount > 0,
      message: `Subscribed to ${successCount}/${eventTypes.length} events`,
      results,
      webhookUrl,
    })
  } catch (error) {
    console.error('Error in subscribe route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// GET: Check current subscriptions
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session?.twitchId) {
      return NextResponse.json(
        { error: 'Not authenticated with Twitch' },
        { status: 401 }
      )
    }

    const clientId = process.env.TWITCH_CLIENT_ID!
    
    // Get App Access Token for EventSub API
    const appAccessToken = await getAppAccessToken()

    const response = await fetch(TWITCH_API_URL, {
      headers: {
        'Authorization': `Bearer ${appAccessToken}`,
        'Client-Id': clientId,
      },
    })

    const data = await response.json()
    
    // Filter to only show subscriptions for this user's channel
    const mySubscriptions = data.data?.filter(
      (sub: any) => sub.condition?.broadcaster_user_id === session.twitchId
    ) || []

    return NextResponse.json({
      subscriptions: mySubscriptions,
      total: mySubscriptions.length,
    })
  } catch (error) {
    console.error('Error getting subscriptions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

