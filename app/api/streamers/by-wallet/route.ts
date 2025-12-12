import { NextRequest, NextResponse } from "next/server";
import { getWalletStreamerProfile } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  // Basic sanity check (don't hard-fail on checksum/casing)
  if (!wallet.startsWith("0x") || wallet.length < 10) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

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

