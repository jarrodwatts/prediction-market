import crypto from 'crypto'

const TWITCH_MESSAGE_ID = 'Twitch-Eventsub-Message-Id'
const TWITCH_MESSAGE_TIMESTAMP = 'Twitch-Eventsub-Message-Timestamp'
const TWITCH_MESSAGE_SIGNATURE = 'Twitch-Eventsub-Message-Signature'
const TWITCH_MESSAGE_TYPE = 'Twitch-Eventsub-Message-Type'

const MESSAGE_TYPE_VERIFICATION = 'webhook_callback_verification'
const MESSAGE_TYPE_NOTIFICATION = 'notification'
const MESSAGE_TYPE_REVOCATION = 'revocation'

const HMAC_PREFIX = 'sha256='

/**
 * Verify that the request is from Twitch
 */
export function verifyTwitchSignature(
  messageId: string,
  timestamp: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!messageId || !timestamp || !signature || !secret) {
    console.error('Missing required fields for signature verification')
    return false
  }
  
  const message = messageId + timestamp + body
  const hmac = HMAC_PREFIX + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex')
  
  // Ensure buffers are same length before comparison
  const hmacBuffer = Buffer.from(hmac)
  const signatureBuffer = Buffer.from(signature)
  
  if (hmacBuffer.length !== signatureBuffer.length) {
    console.error(`Signature length mismatch: expected ${hmacBuffer.length}, got ${signatureBuffer.length}`)
    return false
  }
  
  return crypto.timingSafeEqual(hmacBuffer, signatureBuffer)
}

/**
 * Get headers from request
 */
export function getTwitchHeaders(headers: Headers) {
  return {
    messageId: headers.get(TWITCH_MESSAGE_ID.toLowerCase()) || '',
    timestamp: headers.get(TWITCH_MESSAGE_TIMESTAMP.toLowerCase()) || '',
    signature: headers.get(TWITCH_MESSAGE_SIGNATURE.toLowerCase()) || '',
    messageType: headers.get(TWITCH_MESSAGE_TYPE.toLowerCase()) || '',
  }
}

export { MESSAGE_TYPE_VERIFICATION, MESSAGE_TYPE_NOTIFICATION, MESSAGE_TYPE_REVOCATION }

/**
 * Twitch EventSub prediction event types
 */
export interface TwitchPredictionOutcome {
  id: string
  title: string
  color: string
  users: number
  channel_points: number
  top_predictors: Array<{
    user_id: string
    user_login: string
    user_name: string
    channel_points_used: number
    channel_points_won: number
  }> | null
}

export interface TwitchPredictionBeginEvent {
  id: string
  broadcaster_user_id: string
  broadcaster_user_login: string
  broadcaster_user_name: string
  title: string
  outcomes: TwitchPredictionOutcome[]
  started_at: string
  locks_at: string
}

export interface TwitchPredictionProgressEvent extends TwitchPredictionBeginEvent {}

export interface TwitchPredictionLockEvent extends TwitchPredictionBeginEvent {
  locked_at: string
}

export interface TwitchPredictionEndEvent extends TwitchPredictionBeginEvent {
  winning_outcome_id: string | null
  status: 'resolved' | 'canceled'
  ended_at: string
}

/**
 * Subscribe to EventSub for a channel's predictions
 */
export async function subscribeToChannelPredictions(
  broadcasterId: string,
  accessToken: string
): Promise<boolean> {
  const clientId = process.env.TWITCH_CLIENT_ID!
  const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET!
  const webhookUrl = `${process.env.NEXTAUTH_URL}/api/twitch/webhook`

  const eventTypes = [
    'channel.prediction.begin',
    'channel.prediction.progress',
    'channel.prediction.lock',
    'channel.prediction.end',
  ]

  for (const type of eventTypes) {
    try {
      const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: {
            broadcaster_user_id: broadcasterId,
          },
          transport: {
            method: 'webhook',
            callback: webhookUrl,
            secret: webhookSecret,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error(`Failed to subscribe to ${type}:`, error)
        // Continue with other subscriptions even if one fails
      }
    } catch (error) {
      console.error(`Error subscribing to ${type}:`, error)
    }
  }

  return true
}

/**
 * Unsubscribe from all EventSub subscriptions for a channel
 */
export async function unsubscribeFromChannelPredictions(
  subscriptionIds: string[],
  accessToken: string
): Promise<void> {
  const clientId = process.env.TWITCH_CLIENT_ID!

  for (const id of subscriptionIds) {
    try {
      await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': clientId,
        },
      })
    } catch (error) {
      console.error(`Error unsubscribing from ${id}:`, error)
    }
  }
}

