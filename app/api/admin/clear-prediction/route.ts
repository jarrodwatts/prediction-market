import { NextRequest, NextResponse } from 'next/server'
import { clearActivePrediction, getActivePrediction, deletePredictionMapping } from '@/lib/kv'

// Quick admin endpoint to clear stale predictions
export async function POST(request: NextRequest) {
  const { channelId } = await request.json()
  
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  }
  
  // Get current active prediction
  const activePredictionId = await getActivePrediction(channelId)
  
  if (activePredictionId) {
    // Delete the prediction data
    await deletePredictionMapping(activePredictionId)
  }
  
  // Clear the active prediction reference
  await clearActivePrediction(channelId)
  
  return NextResponse.json({ 
    success: true, 
    message: `Cleared active prediction ${activePredictionId} for channel ${channelId}` 
  })
}

