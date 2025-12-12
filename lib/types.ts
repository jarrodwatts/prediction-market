export interface MarketData {
  id: bigint;
  question: string;
  image: string;
  token: string;
  state: number; // 0: Open, 1: Closed, 2: Resolved
  closesAt: bigint;
  liquidity: bigint;
  balance: bigint;
  sharesAvailable: bigint;
  resolvedOutcomeId: bigint;
  outcomeCount: number;
  createdAt: bigint;
  volume: bigint;

  /**
   * Optional computed fields for list views.
   * - prices are normalized 0-1 (probabilities) per outcome
   * - distributor is the fee recipient (streamer wallet for Twitch-created markets)
   * - creator is display metadata for UI (resolved via KV / Twitch)
   */
  prices?: number[];
  outcomes?: string[];
  distributor?: `0x${string}`;
  creator?: {
    name: string;
    imageUrl?: string;
    url?: string;
  };
}

