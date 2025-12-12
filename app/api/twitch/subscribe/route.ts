import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { storeStreamerSession, storeWalletStreamerProfile } from '@/lib/kv'

const TWITCH_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users'

type EventSubSubscription = {
  type?: string
  status?: string
  condition?: { broadcaster_user_id?: string }
}

type EventSubListResponse = {
  data?: EventSubSubscription[]
}

type EventSubCreateResponse = {
  data?: Array<{ id?: string }>
  message?: string
  error?: string
}

/**
 * Get an App Access Token using Client Credentials flow
 * This is required for EventSub webhook subscriptions
 */
async function getAppAccessToken(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET')
  }
  
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

async function getProfileImageUrl(
  twitchUserId: string,
  appAccessToken: string
): Promise<string | undefined> {
  try {
    const clientId = process.env.TWITCH_CLIENT_ID!
    const res = await fetch(`${TWITCH_USERS_URL}?id=${twitchUserId}`, {
      headers: {
        'Authorization': `Bearer ${appAccessToken}`,
        'Client-Id': clientId,
      },
    })

    if (!res.ok) return undefined
    const data = await res.json()
    return data.data?.[0]?.profile_image_url
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  try {
    const missing: string[] = []
    if (!process.env.TWITCH_CLIENT_ID) missing.push('TWITCH_CLIENT_ID')
    if (!process.env.TWITCH_CLIENT_SECRET) missing.push('TWITCH_CLIENT_SECRET')
    if (!process.env.TWITCH_WEBHOOK_SECRET) missing.push('TWITCH_WEBHOOK_SECRET')
    if (!process.env.NEXTAUTH_URL) missing.push('NEXTAUTH_URL')

    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required server configuration: ${missing.join(', ')}`,
          missing,
          hint:
            'For local EventSub, NEXTAUTH_URL must be a public https URL (ngrok/cloudflared), and Twitch OAuth redirect URLs must include <NEXTAUTH_URL>/api/auth/callback/twitch.',
        },
        { status: 500 }
      )
    }

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
    let appAccessToken: string
    try {
      appAccessToken = await getAppAccessToken()
      console.log('✅ Got App Access Token')
    } catch (e: unknown) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get Twitch app access token (client credentials).',
          details: e instanceof Error ? e.message : String(e),
          hint:
            'Check TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET and that your Twitch app is configured correctly.',
        },
        { status: 502 }
      )
    }

    // Fetch profile image once for nicer UI
    const profileImageUrl = await getProfileImageUrl(session.twitchId, appAccessToken)

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
    const existingData = (await existingResponse.json()) as EventSubListResponse
    if (!existingResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to list existing EventSub subscriptions.',
          status: existingResponse.status,
          details: existingData,
          webhookUrl,
          hint:
            'This usually indicates invalid Twitch credentials, missing app permissions, or a Twitch API outage.',
        },
        { status: 502 }
      )
    }
    const existingSubscriptions =
      existingData.data?.filter(
        (sub) =>
          sub.condition?.broadcaster_user_id === session.twitchId &&
          sub.status === 'enabled'
      ) || []
    
    const existingTypes = new Set(
      existingSubscriptions.map((sub) => sub.type).filter(Boolean) as string[]
    )
    console.log(`📋 Found ${existingSubscriptions.length} existing subscriptions:`, Array.from(existingTypes))

    const results: Array<
      | { type: string; success: true; id?: string; skipped?: boolean }
      | { type: string; success: false; status?: number; error?: string; details?: unknown }
    > = []

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

        const data = (await response.json()) as EventSubCreateResponse
        
        if (response.ok) {
          console.log(`✅ Subscribed to ${type}`)
          results.push({ type, success: true, id: data.data?.[0]?.id })
        } else if (response.status === 409) {
          // Subscription already exists (race condition)
          console.log(`⏭️ ${type} already exists (409), skipping`)
          results.push({ type, success: true, skipped: true })
        } else {
          console.error(`❌ Failed to subscribe to ${type}:`, data)
          results.push({
            type,
            success: false,
            status: response.status,
            error: data.message || data.error,
            details: data,
          })
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
      twitchLogin: session.twitchLogin,
      twitchDisplayName: session.twitchDisplayName,
      profileImageUrl,
    })

    // Store reverse lookup (wallet -> Twitch profile) for market cards
    await storeWalletStreamerProfile(walletAddress, {
      twitchUserId: session.twitchId,
      twitchLogin: session.twitchLogin,
      twitchDisplayName: session.twitchDisplayName,
      profileImageUrl,
    })

    const successCount = results.filter(r => r.success).length
    
    return NextResponse.json({
      success: successCount > 0,
      message: `Subscribed to ${successCount}/${eventTypes.length} events`,
      results,
      webhookUrl,
      troubleshooting:
        'If subscriptions are enabled but webhooks never arrive, confirm NEXTAUTH_URL is the same public https domain you are browsing, and that Twitch can reach <NEXTAUTH_URL>/api/twitch/webhook.',
    })
  } catch (error) {
    console.error('Error in subscribe route:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: String(error),
        hint:
          'If this is local dev, use the Developer diagnostics on /streamer to verify env vars (NEXTAUTH_URL, Twitch secrets) and KV connectivity.',
      },
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

    const data = (await response.json()) as EventSubListResponse
    
    // Filter to only show subscriptions for this user's channel
    const mySubscriptions =
      data.data?.filter(
        (sub) => sub.condition?.broadcaster_user_id === session.twitchId
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

