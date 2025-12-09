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
}

