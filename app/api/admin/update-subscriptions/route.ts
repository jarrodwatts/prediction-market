import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/middleware/auth'
import { validateBody } from '@/lib/middleware/validation'
import { updateSubscriptionsSchema } from '@/lib/validation/schemas'

const TWITCH_API_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

async function getAppAccessToken(): Promise<string> {
  const clientId = process.env.TWITCH_CLIENT_ID!
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!
  
  const response = await fetch(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  
  const data = await response.json()
  return data.access_token
}

export async function POST(request: NextRequest) {
  try {
    // Verify admin authorization
    const { error: authError } = await requireAdmin(request)
    if (authError) return authError

    // Validate request body
    const { data: body, error: validationError } = await validateBody(
      request,
      updateSubscriptionsSchema
    )
    if (validationError) return validationError

    const { channelId, webhookUrl } = body

    const appToken = await getAppAccessToken()
    const clientId = process.env.TWITCH_CLIENT_ID!
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET || 'your-webhook-secret'
    
    // First, get existing subscriptions for this channel
    const listResponse = await fetch(TWITCH_API_URL, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Client-Id': clientId,
      },
    })
    
    const listData = await listResponse.json()
    const existingSubs = listData.data?.filter((sub: any) => 
      sub.condition?.broadcaster_user_id === channelId
    ) || []
    
    console.log(`Found ${existingSubs.length} existing subscriptions for channel ${channelId}`)
    
    // Delete old subscriptions
    for (const sub of existingSubs) {
      console.log(`Deleting subscription ${sub.id} (${sub.type})`)
      await fetch(`${TWITCH_API_URL}?id=${sub.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Client-Id': clientId,
        },
      })
    }
    
    // Create new subscriptions
    const subscriptionTypes = [
      'channel.prediction.begin',
      'channel.prediction.lock',
      'channel.prediction.end',
    ]
    
    const results = []
    for (const type of subscriptionTypes) {
      const response = await fetch(TWITCH_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Client-Id': clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: { broadcaster_user_id: channelId },
          transport: {
            method: 'webhook',
            callback: webhookUrl,
            secret: webhookSecret,
          },
        }),
      })
      
      const data = await response.json()
      results.push({ type, status: response.status, data })
      console.log(`Created subscription ${type}:`, response.status)
    }
    
    return NextResponse.json({ success: true, deleted: existingSubs.length, created: results })
  } catch (error: any) {
    console.error('Error updating subscriptions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

