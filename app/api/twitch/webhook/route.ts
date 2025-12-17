import { NextRequest, NextResponse } from 'next/server'
import {
  verifyTwitchSignature,
  getTwitchHeaders,
  MESSAGE_TYPE_VERIFICATION,
  MESSAGE_TYPE_NOTIFICATION,
  type TwitchPredictionBeginEvent,
  type TwitchPredictionLockEvent,
  type TwitchPredictionEndEvent,
} from '@/lib/twitch/eventsub'
import {
  storePredictionMapping,
  updatePredictionMapping,
  getPredictionData,
  clearActivePrediction,
  getStreamerSession,
  storeWalletStreamerProfile,
  storeMarketOutcomes,
} from '@/lib/kv'
import { createMarket, resolveMarket, voidMarket, lockMarket } from '@/lib/market-service'
import { recordEventSubWebhook } from '@/lib/dev/eventsub-debug'
import { markWebhookProcessed } from '@/lib/webhook-dedup'
import { withIdempotency, checkOperation } from '@/lib/idempotency'
import { logger } from '@/lib/logger'
import { TWITCH } from '@/lib/config'
import { runInBackground } from '@/lib/background-tasks'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Fetch Twitch user's profile image URL
 */
async function getTwitchProfileImage(userId: string): Promise<string | undefined> {
  try {
    const clientId = TWITCH.CLIENT_ID
    const clientSecret = TWITCH.CLIENT_SECRET
    
    // Get an app access token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })
    
    if (!tokenRes.ok) {
      console.error('Failed to get Twitch access token')
      return undefined
    }
    
    const { access_token } = await tokenRes.json()
    
    // Fetch user info
    const userRes = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Client-Id': clientId,
      },
    })
    
    if (!userRes.ok) {
      console.error('Failed to fetch Twitch user info')
      return undefined
    }
    
    const userData = await userRes.json()
    const profileImageUrl = userData.data?.[0]?.profile_image_url
    
    console.log(`📷 Got Twitch profile image: ${profileImageUrl}`)
    return profileImageUrl
  } catch (error) {
    console.error('Error fetching Twitch profile image:', error)
    return undefined
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now()
  let messageId = 'unknown' // Declare at function scope

  // Rate limit check BEFORE signature verification (prevent DoS)
  const rateLimitResponse = await checkRateLimit(request, 'webhook')
  if (rateLimitResponse) return rateLimitResponse

  try {
    const body = await request.text()
    const headers = getTwitchHeaders(request.headers)
    messageId = headers.messageId || 'unknown' // Capture early

    logger.webhook.received(
      headers.messageId || 'unknown',
      headers.messageType || 'unknown'
    )
    
    // For verification challenges, we need to respond quickly
    // Parse the body first to check message type
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (e) {
      console.error('Failed to parse body:', e)
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    
    // Record for local/dev diagnostics (best-effort; never throw)
    try {
      const subscriptionType =
        payload?.subscription?.type ||
        payload?.subscription?.subscription_type ||
        payload?.type
      const broadcasterUserId =
        payload?.event?.broadcaster_user_id ||
        payload?.subscription?.condition?.broadcaster_user_id

      recordEventSubWebhook({
        receivedAt: Date.now(),
        messageType: headers.messageType || 'unknown',
        messageId: headers.messageId || undefined,
        timestamp: headers.timestamp || undefined,
        subscriptionType: typeof subscriptionType === 'string' ? subscriptionType : undefined,
        broadcasterUserId: typeof broadcasterUserId === 'string' ? broadcasterUserId : undefined,
        signaturePresent: Boolean(headers.signature),
      })
    } catch {
      // ignore
    }

    // Handle webhook verification challenge FIRST (before signature verification)
    // This is critical - Twitch expects a response within 10 seconds
    if (headers.messageType === MESSAGE_TYPE_VERIFICATION) {
      console.log('🔐 Verification challenge received!')
      console.log('Challenge:', payload.challenge)
      
      // Still verify the signature for security
      const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET
      if (webhookSecret && headers.signature) {
        try {
          const isValid = verifyTwitchSignature(
            headers.messageId,
            headers.timestamp,
            body,
            headers.signature,
            webhookSecret
          )
          if (!isValid) {
            console.error('❌ Invalid signature on verification challenge')
            try {
              recordEventSubWebhook({
                receivedAt: Date.now(),
                messageType: headers.messageType || 'webhook_callback_verification',
                messageId: headers.messageId || undefined,
                timestamp: headers.timestamp || undefined,
                signaturePresent: true,
                signatureValid: false,
                notes: 'Invalid signature on verification challenge',
              })
            } catch {}
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
          }
          console.log('✅ Signature verified')
          try {
            recordEventSubWebhook({
              receivedAt: Date.now(),
              messageType: headers.messageType || 'webhook_callback_verification',
              messageId: headers.messageId || undefined,
              timestamp: headers.timestamp || undefined,
              signaturePresent: true,
              signatureValid: true,
              notes: 'Verification challenge signature OK',
            })
          } catch {}
        } catch (e) {
          console.error('Signature verification error:', e)
          // Continue anyway for verification - Twitch needs a response
        }
      }
      
      console.log('✅ Responding to verification challenge')
      return new NextResponse(payload.challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
    
    // For notifications, verify signature strictly
    const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('TWITCH_WEBHOOK_SECRET not configured')
      try {
        recordEventSubWebhook({
          receivedAt: Date.now(),
          messageType: headers.messageType || 'notification',
          messageId: headers.messageId || undefined,
          timestamp: headers.timestamp || undefined,
          signaturePresent: Boolean(headers.signature),
          notes: 'TWITCH_WEBHOOK_SECRET not configured',
        })
      } catch {}
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    if (!headers.signature) {
      console.error('Missing signature header')
      try {
        recordEventSubWebhook({
          receivedAt: Date.now(),
          messageType: headers.messageType || 'notification',
          messageId: headers.messageId || undefined,
          timestamp: headers.timestamp || undefined,
          signaturePresent: false,
          notes: 'Missing signature header',
        })
      } catch {}
      return NextResponse.json({ error: 'Missing signature' }, { status: 403 })
    }
    
    try {
      const isValid = verifyTwitchSignature(
        headers.messageId,
        headers.timestamp,
        body,
        headers.signature,
        webhookSecret
      )
      
      if (!isValid) {
        console.error('Invalid Twitch signature')
        try {
          recordEventSubWebhook({
            receivedAt: Date.now(),
            messageType: headers.messageType || 'notification',
            messageId: headers.messageId || undefined,
            timestamp: headers.timestamp || undefined,
            signaturePresent: true,
            signatureValid: false,
            notes: 'Invalid Twitch signature',
          })
        } catch {}
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
      try {
        recordEventSubWebhook({
          receivedAt: Date.now(),
          messageType: headers.messageType || 'notification',
          messageId: headers.messageId || undefined,
          timestamp: headers.timestamp || undefined,
          signaturePresent: true,
          signatureValid: true,
          notes: 'Signature OK',
        })
      } catch {}
    } catch (e) {
      console.error('Signature verification error:', e)
      try {
        recordEventSubWebhook({
          receivedAt: Date.now(),
          messageType: headers.messageType || 'notification',
          messageId: headers.messageId || undefined,
          timestamp: headers.timestamp || undefined,
          signaturePresent: true,
          signatureValid: false,
          notes: 'Signature verification error',
        })
      } catch {}
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 })
    }
    
    // Handle notifications
    if (headers.messageType === MESSAGE_TYPE_NOTIFICATION) {
      // DEDUPLICATION: Check if we've already processed this message (distributed via KV)
      const { isNew, reason } = await markWebhookProcessed(headers.messageId, headers.timestamp)
      if (!isNew) {
        logger.webhook.duplicate(headers.messageId, reason || 'Unknown reason')
        return NextResponse.json({ received: true })
      }

      const subscriptionType = payload.subscription.type
      const event = payload.event

      logger.webhook.processing(headers.messageId, subscriptionType, event.id || 'unknown')
      
      switch (subscriptionType) {
        case 'channel.prediction.begin':
          await handlePredictionBegin(event as TwitchPredictionBeginEvent)
          break
        
        case 'channel.prediction.lock':
          await handlePredictionLock(event as TwitchPredictionLockEvent)
          break
        
        case 'channel.prediction.end':
          await handlePredictionEnd(event as TwitchPredictionEndEvent)
          break
        
        default:
          console.log(`Unhandled subscription type: ${subscriptionType}`)
      }

      // Log successful webhook processing
      const duration = Date.now() - requestStartTime
      logger.webhook.completed(headers.messageId, duration)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.webhook.failed(messageId, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Handle prediction.begin - Create a new market
 */
async function handlePredictionBegin(event: TwitchPredictionBeginEvent) {
  const operationKey = `create_market:${event.id}`

  logger.info('Prediction started', {
    predictionId: event.id,
    title: event.title,
  })

  // IDEMPOTENCY CHECK: Check if operation already in progress or completed
  const existingOp = await checkOperation(operationKey)
  if (existingOp) {
    if (existingOp.status === 'completed') {
      logger.market.duplicate(event.id, 'completed')
      return
    }
    if (existingOp.status === 'pending') {
      logger.market.duplicate(event.id, 'pending')
      return
    }
    // If failed, we'll retry below
  }

  // Double-check KV for existing market (belt and suspenders)
  const existingMarket = await getPredictionData(event.id)
  if (existingMarket?.marketId) {
    logger.market.duplicate(event.id, `exists: ${existingMarket.marketId}`)
    return
  }

  // Get streamer session to find their wallet address
  const streamerSession = await getStreamerSession(event.broadcaster_user_id)

  if (!streamerSession) {
    logger.warn('Streamer not registered, skipping market creation', {
      predictionId: event.id,
      streamerLogin: event.broadcaster_user_login,
    })
    return
  }

  if (!streamerSession.walletAddress) {
    logger.warn('Streamer has no wallet configured, skipping', {
      predictionId: event.id,
      streamerLogin: event.broadcaster_user_login,
    })
    return
  }

  // Calculate close time from locks_at
  const locksAt = Math.floor(new Date(event.locks_at).getTime() / 1000)

  // Create outcome mapping (Twitch outcome ID -> our index)
  const outcomeMap: Record<string, number> = {}
  event.outcomes.forEach((outcome, index) => {
    outcomeMap[outcome.id] = index
  })

  // OPTIMIZATION: Store to KV IMMEDIATELY so UI can show "pending" state
  // This allows the overlay to display the prediction instantly while the market is being created on-chain
  await storePredictionMapping(event.id, {
    marketId: null, // Will be set after on-chain creation
    channelId: event.broadcaster_user_id,
    question: event.title,
    outcomes: event.outcomes.map(o => o.title),
    outcomeMap,
    locksAt,
    createdAt: Date.now(),
    state: 'pending',
  })

  try {
    // Use idempotency wrapper to prevent duplicate market creation
    const marketCreationStartTime = Date.now()
    const result = await withIdempotency(operationKey, async () => {
      logger.market.creating(event.id, event.title)

      // Create market
      const { marketId, txHash } = await createMarket({
        question: event.title,
        outcomeCount: event.outcomes.length,
        closesAt: locksAt,
        creatorAddress: streamerSession.walletAddress!,
        image: undefined, // Will cache profile in background for future markets
      })

      // AFTER market created, fetch profile in background (non-blocking)
      runInBackground('fetch-profile-' + event.broadcaster_user_id, async () => {
        const profileImage = await getTwitchProfileImage(event.broadcaster_user_id)

        // Cache reverse lookup (wallet -> Twitch profile) for future markets
        await storeWalletStreamerProfile(streamerSession.walletAddress!, {
          twitchUserId: event.broadcaster_user_id,
          twitchLogin: event.broadcaster_user_login,
          twitchDisplayName: event.broadcaster_user_name,
          profileImageUrl: profileImage,
        })

        logger.debug('Profile image cached for future markets', {
          userId: event.broadcaster_user_id,
          profileImage,
        })
      })

      // Update KV with the market ID now that it's confirmed on-chain
      await updatePredictionMapping(event.id, {
        marketId,
        state: 'active',
      })

      // Store market-level outcomes (for list/card rendering)
      // Best-effort: if KV fails, don't break webhook processing
      try {
        await storeMarketOutcomes(marketId, event.outcomes.map((o) => o.title))
      } catch (e) {
        logger.error('Failed to store market outcomes (non-critical)', e)
      }

      return { marketId, txHash }
    })

    const marketCreationDuration = Date.now() - marketCreationStartTime
    logger.market.created(event.id, result.marketId, result.txHash, marketCreationDuration)

    // CHECK: Was lock event received while we were creating the market?
    const updatedPrediction = await getPredictionData(event.id)
    if (updatedPrediction?.pendingLock) {
      logger.info('Processing pending lock after market creation', {
        predictionId: event.id,
        marketId: result.marketId.toString(),
      })

      // Lock the market immediately
      try {
        const lockTxHash = await lockMarket(result.marketId)
        if (lockTxHash) {
          logger.market.locked(result.marketId, lockTxHash)
          await updatePredictionMapping(event.id, {
            state: 'locked',
            pendingLock: false
          })
        }
      } catch (error) {
        logger.error('Failed to apply pending lock', error, {
          predictionId: event.id,
          marketId: result.marketId.toString(),
        })
      }
    }
  } catch (error) {
    // Check if circuit breaker is open
    if (error instanceof Error && error.message.includes('Circuit breaker open')) {
      logger.error('Market creation skipped - RPC circuit breaker open', error, {
        predictionId: event.id,
      })

      // Update prediction state to indicate RPC unavailable
      await updatePredictionMapping(event.id, {
        state: 'failed',
      })

      // Return 200 to Twitch (don't retry - service is down)
      return
    }

    logger.market.failed(event.id, error)

    // Update prediction state to failed
    await updatePredictionMapping(event.id, {
      state: 'failed',
    })

    // Note: We DON'T throw here - returning 200 to Twitch prevents retries
    // The UI will show the prediction as "failed to create market"
  }
}

/**
 * Handle prediction.lock - Lock the market early (stop trading)
 */
async function handlePredictionLock(event: TwitchPredictionLockEvent) {
  console.log(`🔒 Prediction locked: ${event.title}`)

  const predictionData = await getPredictionData(event.id)

  if (!predictionData) {
    console.log(`⚠️ No market found for prediction ${event.id}`)
    return
  }

  // OPTIMIZATION: Update KV state to 'locked' IMMEDIATELY
  // This allows the UI to show "locked" state before the on-chain tx confirms
  await updatePredictionMapping(event.id, {
    state: 'locked',
    pendingLock: !predictionData.marketId // Flag if market not yet created
  })
  console.log(`📝 KV state updated to 'locked' immediately`)

  try {
    // If market not yet created, the flag will be checked after creation
    if (!predictionData.marketId) {
      logger.info('Lock received before market created, flagging for later', {
        predictionId: event.id,
      })
      return
    }
    
    const txHash = await lockMarket(predictionData.marketId)

    if (txHash) {
      console.log(`✅ Market ${predictionData.marketId} locked on-chain (tx: ${txHash})`)
      // Clear pending flag on success
      await updatePredictionMapping(event.id, { pendingLock: false })
    } else {
      console.log(`⏭️ Market ${predictionData.marketId} was already locked or not open`)
    }
  } catch (error) {
    console.error('❌ Error locking market on-chain:', error)
    // Note: KV state remains 'locked' even if on-chain fails
    // This is intentional - the prediction IS locked on Twitch
  }
}

/**
 * Handle prediction.end - Resolve or void the market
 */
async function handlePredictionEnd(event: TwitchPredictionEndEvent) {
  console.log(`🏁 Prediction ended: ${event.title} - Status: ${event.status}`)
  
  const predictionData = await getPredictionData(event.id)
  
  if (!predictionData) {
    console.log(`⚠️ No market found for prediction ${event.id}`)
    return
  }
  
  // Check if market was created on-chain
  if (!predictionData.marketId) {
    console.log(`⚠️ Market not yet created on-chain for prediction ${event.id}, clearing active prediction`)
    await clearActivePrediction(predictionData.channelId)
    return
  }
  
  const marketId = predictionData.marketId // Non-null at this point
  
  try {
    let txHash: string = ''
    
    if (event.status === 'canceled' || !event.winning_outcome_id) {
      // Prediction was canceled - void the market
      console.log(`🚫 Voiding market ${marketId}`)
      txHash = await voidMarket(marketId)
    } else {
      // Prediction resolved - find the winning outcome index
      const winningIndex = predictionData.outcomeMap[event.winning_outcome_id]
      
      if (winningIndex === undefined) {
        console.error(`Winning outcome ${event.winning_outcome_id} not found in outcome map`)
        txHash = await voidMarket(marketId)
      } else {
        console.log(`🏆 Resolving market ${marketId} with outcome ${winningIndex}`)
        txHash = await resolveMarket(marketId, winningIndex)
      }
    }
    
    if (txHash) {
      console.log(`✅ Market ${marketId} resolved on-chain (tx: ${txHash})`)
      
      // Update KV state to 'resolved' so the UI can show the result card
      // The result card stays visible until:
      // 1. User claims their winnings (client clears it)
      // 2. Streamer creates a new prediction (replaces this one)
      await updatePredictionMapping(event.id, { state: 'resolved' })
      console.log(`📝 KV state updated to 'resolved' - result card will stay until claim or new prediction`)
    } else {
      console.log(`⏳ Market ${marketId} could not be resolved yet - will need manual resolution`)
    }
  } catch (error) {
    console.error('❌ Error resolving market:', error)
  }
}
