import { NextRequest, NextResponse } from 'next/server'
import { clearActivePrediction, getActivePrediction, deletePredictionMapping } from '@/lib/kv'
import { requireAdmin } from '@/lib/middleware/auth'
import { validateBody } from '@/lib/middleware/validation'
import { clearPredictionSchema } from '@/lib/validation/schemas'

// Admin endpoint to clear stale predictions
// Requires ADMIN_API_TOKEN in Authorization header
export async function POST(request: NextRequest) {
  // Verify admin authorization
  const { error: authError } = await requireAdmin(request)
  if (authError) return authError

  // Validate request body
  const { data: body, error: validationError } = await validateBody(
    request,
    clearPredictionSchema
  )
  if (validationError) return validationError

  const { channelId } = body

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
    message: `Cleared active prediction ${activePredictionId} for channel ${channelId}`,
  })
}

