import { NextRequest, NextResponse } from "next/server";
import { getWalletStreamerProfile } from "@/lib/kv";
import { validateSearchParams } from "@/lib/middleware/validation";
import { streamerByWalletSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  // Validate query params using Zod schema
  const { data: params, error: validationError } = validateSearchParams(
    request,
    streamerByWalletSchema
  );
  if (validationError) return validationError;

  const { wallet } = params;

  const profile = await getWalletStreamerProfile(wallet);
  if (!profile) {
    return NextResponse.json({ found: false, walletAddress: wallet });
  }

  return NextResponse.json({
    found: true,
    walletAddress: wallet,
    ...profile,
  });
}

