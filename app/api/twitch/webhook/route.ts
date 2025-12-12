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
import { createMarketWithLiquidity, resolveMarket, voidMarket, lockMarket } from '@/lib/liquidity'
import { recordEventSubWebhook } from '@/lib/dev/eventsub-debug'

// Protocol treasury address (update with actual address)
const PROTOCOL_TREASURY = process.env.PROTOCOL_TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000'

// In-memory cache to track processed message IDs (prevents duplicate webhook processing)
// Note: In production with multiple instances, use Redis/KV instead
const processedMessageIds = new Set<string>()
const MAX_PROCESSED_IDS = 1000 // Prevent memory leak

function markMessageProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) {
    return false // Already processed
  }
  
  // Clean up old entries if too many
  if (processedMessageIds.size >= MAX_PROCESSED_IDS) {
    const iterator = processedMessageIds.values()
    for (let i = 0; i < 100; i++) {
      const val = iterator.next().value
      if (val) processedMessageIds.delete(val)
    }
  }
  
  processedMessageIds.add(messageId)
  return true // First time seeing this message
}

/**
 * Fetch Twitch user's profile image URL
 */
async function getTwitchProfileImage(userId: string): Promise<string | undefined> {
  try {
    const clientId = process.env.TWITCH_CLIENT_ID
    const clientSecret = process.env.TWITCH_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      console.log('Missing Twitch credentials, skipping profile image fetch')
      return undefined
    }
    
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
  console.log('=== Twitch Webhook Received ===')
  
  try {
    const body = await request.text()
    const headers = getTwitchHeaders(request.headers)
    
    console.log('Headers:', {
      messageId: headers.messageId ? 'present' : 'missing',
      timestamp: headers.timestamp ? 'present' : 'missing',
      signature: headers.signature ? 'present' : 'missing',
      messageType: headers.messageType,
    })
    
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
      // DEDUPLICATION: Check if we've already processed this message
      if (!markMessageProcessed(headers.messageId)) {
        console.log(`⏭️ Duplicate message ${headers.messageId}, skipping`)
        return NextResponse.json({ received: true })
      }
      
      const subscriptionType = payload.subscription.type
      const event = payload.event
      
      console.log(`📢 Received EventSub notification: ${subscriptionType}`)
      console.log('Event:', JSON.stringify(event, null, 2))
      
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
    }
    
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Handle prediction.begin - Create a new market
 */
async function handlePredictionBegin(event: TwitchPredictionBeginEvent) {
  console.log(`🎯 Prediction started: ${event.title}`)
  
  // IDEMPOTENCY CHECK: Skip if we've already created a market for this prediction
  const existingMarket = await getPredictionData(event.id)
  if (existingMarket) {
    console.log(`⏭️ Market already exists for prediction ${event.id} (market ID: ${existingMarket.marketId}), skipping`)
    return
  }
  
  // Get streamer session to find their wallet address
  const streamerSession = await getStreamerSession(event.broadcaster_user_id)
  
  if (!streamerSession) {
    console.log(`⚠️ Streamer ${event.broadcaster_user_login} not registered, skipping market creation`)
    return
  }
  
  console.log(`✅ Streamer found, wallet: ${streamerSession.walletAddress}`)
  
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
  
  console.log(`📝 Prediction stored immediately (pending on-chain creation)`)
  
  try {
    // Fetch streamer's profile image from Twitch
    const profileImage = await getTwitchProfileImage(event.broadcaster_user_id)

    // Cache reverse lookup (wallet -> Twitch profile) for market cards
    await storeWalletStreamerProfile(streamerSession.walletAddress, {
      twitchUserId: event.broadcaster_user_id,
      twitchLogin: event.broadcaster_user_login,
      twitchDisplayName: event.broadcaster_user_name,
      profileImageUrl: profileImage,
    })
    
    console.log(`Creating market with ${event.outcomes.length} outcomes, closes at ${new Date(locksAt * 1000).toISOString()}`)
    
    // Create the market with liquidity (this takes a few seconds)
    const { marketId, txHash } = await createMarketWithLiquidity({
      question: event.title,
      outcomes: event.outcomes.length,
      closesAt: locksAt,
      distributorAddress: streamerSession.walletAddress,
      treasuryAddress: PROTOCOL_TREASURY,
      image: profileImage,
    })
    
    console.log(`✅ Market created: ${marketId} (tx: ${txHash})`)
    
    // Update KV with the market ID now that it's confirmed on-chain
    await updatePredictionMapping(event.id, {
      marketId,
      state: 'active',
    })

    // Store market-level outcomes (for list/card rendering)
    // Best-effort: if KV fails, don't break webhook processing
    try {
      await storeMarketOutcomes(marketId, event.outcomes.map((o) => o.title))
    } catch {}
    
    console.log(`✅ Prediction mapping updated with marketId ${marketId}`)
  } catch (error) {
    console.error('❌ Error creating market:', error)
    // Clean up the pending entry on error
    await clearActivePrediction(event.broadcaster_user_id)
    // Don't throw - we don't want to cause Twitch to retry
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
  await updatePredictionMapping(event.id, { state: 'locked' })
  console.log(`📝 KV state updated to 'locked' immediately`)
  
  try {
    // Only proceed with on-chain lock if we have a marketId
    if (!predictionData.marketId) {
      console.log(`⚠️ Market not yet created on-chain for prediction ${event.id}`)
      return
    }
    
    const txHash = await lockMarket(predictionData.marketId)
    
    if (txHash) {
      console.log(`✅ Market ${predictionData.marketId} locked on-chain (tx: ${txHash})`)
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
