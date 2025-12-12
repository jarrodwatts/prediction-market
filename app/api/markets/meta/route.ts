import { NextRequest, NextResponse } from "next/server";
import { getMarketOutcomes } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("marketId");

  if (!marketId) {
    return NextResponse.json({ error: "marketId is required" }, { status: 400 });
  }

  let id: bigint;
  try {
    id = BigInt(marketId);
  } catch {
    return NextResponse.json({ error: "invalid marketId" }, { status: 400 });
  }

  const data = await getMarketOutcomes(id);
  if (!data) {
    return NextResponse.json({ found: false, marketId });
  }

  return NextResponse.json({
    found: true,
    marketId,
    outcomes: data.outcomes,
  });
}

