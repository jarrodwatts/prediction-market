export const ONE = 10n ** 18n;

export function ceildiv(x: bigint, y: bigint): bigint {
  if (x > 0n) return (x - 1n) / y + 1n;
  return 0n;
}

export function calcBuyAmount(
  amount: bigint,
  outcomeId: number,
  outcomesShares: bigint[],
  fee: bigint
): bigint {
  const amountMinusFees = amount - (amount * fee) / ONE;
  const buyTokenPoolBalance = outcomesShares[outcomeId];
  let endingOutcomeBalance = buyTokenPoolBalance * ONE;

  for (let i = 0; i < outcomesShares.length; ++i) {
    if (i !== outcomeId) {
      const outcomeShares = outcomesShares[i];
      endingOutcomeBalance = ceildiv(
        endingOutcomeBalance * outcomeShares,
        outcomeShares + amountMinusFees
      );
    }
  }

  const result =
    buyTokenPoolBalance + amountMinusFees - ceildiv(endingOutcomeBalance, ONE);
  return result > 0n ? result : 0n;
}

export function calcSellAmount(
  amount: bigint,
  outcomeId: number,
  outcomesShares: bigint[],
  fee: bigint
): bigint {
  const amountPlusFees = (amount * ONE) / (ONE - fee);
  const sellTokenPoolBalance = outcomesShares[outcomeId];
  let endingOutcomeBalance = sellTokenPoolBalance * ONE;

  for (let i = 0; i < outcomesShares.length; ++i) {
    if (i !== outcomeId) {
      const outcomeShares = outcomesShares[i];
      endingOutcomeBalance = ceildiv(
        endingOutcomeBalance * outcomeShares,
        outcomeShares - amountPlusFees
      );
    }
  }

  const result =
    amountPlusFees + ceildiv(endingOutcomeBalance, ONE) - sellTokenPoolBalance;
  return result > 0n ? result : 0n;
}

export function getPrice(
  outcomeId: number,
  outcomesShares: bigint[],
  liquidity: bigint
): number {
  // If liquidty is 0, avoid div by zero
  if (liquidity === 0n) return 0;

  let div = ONE;
  for (let i = 0; i < outcomesShares.length; ++i) {
    if (i === outcomeId) continue;
    if (outcomesShares[i] === 0n) return 0; // Handle edge case
    div = div + (outcomesShares[outcomeId] * ONE) / outcomesShares[i];
  }

  // price = ONE * ONE / div
  // We return a number for display purposes, normalized to 0-1
  const price = (ONE * ONE) / div;
  return Number(price) / 1e18;
}

