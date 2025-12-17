/**
 * Market Math - parimutuel pricing calculations
 */

/**
 * Calculate indicative payout for a bet
 * 
 * Formula: payout = (bet_amount / new_outcome_pool) * net_pot
 */
export function calcBuyAmount(
  amount: bigint,
  outcomeId: number,
  outcomesShares: readonly bigint[],
  totalFeeBps: bigint
): bigint {
  if (amount <= 0n) return 0n;
  if (outcomeId < 0 || outcomeId >= outcomesShares.length) return 0n;

  // Calculate current total pot
  const currentTotalPot = outcomesShares.reduce((sum, pool) => sum + pool, 0n);
  const currentOutcomePool = outcomesShares[outcomeId];

  // After betting:
  const newTotalPot = currentTotalPot + amount;
  const newOutcomePool = currentOutcomePool + amount;

  if (newOutcomePool === 0n) return 0n;

  // Calculate net pot after fees (fees in basis points, 10000 = 100%)
  const feeAmount = (newTotalPot * totalFeeBps) / 10000n;
  const netPot = newTotalPot - feeAmount;

  // User's indicative payout = (bet_amount / new_outcome_pool) * net_pot
  const payout = (amount * netPot) / newOutcomePool;

  return payout;
}

/**
 * Calculate indicative price (probability) for an outcome
 *
 * Price = outcomePool / totalPot
 *
 * If no bets yet, returns equal probability for all outcomes.
 *
 * @param outcomeId - The outcome index
 * @param pools - Array of pool sizes per outcome
 * @returns Price as a number between 0 and 1
 */
export function getPrice(
  outcomeId: number,
  pools: readonly bigint[]
): number {
  const totalPot = pools.reduce((sum, pool) => sum + pool, 0n);

  // If no bets yet, return equal probability
  if (totalPot === 0n) {
    return 1 / pools.length;
  }

  const pool = pools[outcomeId];
  if (pool === 0n) return 0;

  return Number(pool) / Number(totalPot);
}

/**
 * Calculate all prices (probabilities) for a market
 *
 * @param pools - Array of pool sizes per outcome
 * @returns Array of prices (0-1) for each outcome
 */
export function getPrices(pools: readonly bigint[]): number[] {
  const totalPot = pools.reduce((sum, pool) => sum + pool, 0n);

  // If no bets yet, return equal probabilities
  if (totalPot === 0n) {
    return pools.map(() => 1 / pools.length);
  }

  return pools.map((pool) => Number(pool) / Number(totalPot));
}

