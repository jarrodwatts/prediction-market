/**
 * Formatting utilities for currency, dates, and display values
 */

/**
 * Formats a number in compact notation (K, M, B suffixes).
 */
export function formatCompact(
  value: number,
  options: { prefix?: string; suffix?: string } = {}
): string {
  const { prefix = "$", suffix = "" } = options;

  if (value >= 1_000_000_000) {
    return `${prefix}${(value / 1_000_000_000).toFixed(1)}B${suffix}`
  }
  if (value >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1)}M${suffix}`
  }
  if (value >= 1_000) {
    return `${prefix}${(value / 1_000).toFixed(1)}K${suffix}`
  }
  if (value >= 1) {
    return `${prefix}${value.toFixed(1)}${suffix}`;
  }
  if (value >= 0.01) {
    return `${prefix}${value.toFixed(2)}${suffix}`;
  }
  if (value >= 0.001) {
    return `${prefix}${value.toFixed(3)}${suffix}`;
  }
  if (value > 0) {
    return `${prefix}${value.toFixed(4)}${suffix}`;
  }
  return `${prefix}0${suffix}`;
}

/**
 * Formats a price as a percentage (price → cents).
 * Prices in prediction markets are 0-1 representing probability.
 */
export function formatPricePercent(price: number, decimals: number = 1): string {
  return `${(price * 100).toFixed(decimals)}%`;
}

/**
 * Formats a date string with full details.
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Formats a date string in short format (month and day only).
 */
export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Calculates and formats time remaining until expiry.
 */
export function formatTimeRemaining(expiresAt: string | number | bigint): string {
  const now = new Date();
  const expiry = new Date(typeof expiresAt === 'bigint' ? Number(expiresAt) * 1_000 : expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff < 0) return "Expired";

  const days = Math.floor(diff / (1_000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1_000 * 60 * 60 * 24)) / (1_000 * 60 * 60));

  // If more than 30 days, show the date instead
  if (days > 30) {
    return formatShortDate(expiry.toISOString());
  }
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return "< 1h";
}

/**
 * Formats a timestamp for chart display based on actual data time span.
 */
export function formatDynamicChartDate(
  timestamp: number,
  dataTimeSpanMs: number
): string {
  // Handle invalid input
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return "";
  }

  const date = new Date(timestamp * 1_000);
  
  // Verify the date is valid
  if (isNaN(date.getTime())) {
    return "";
  }

  const ONE_MINUTE = 60 * 1_000;
  const ONE_HOUR = 60 * ONE_MINUTE;
  const ONE_DAY = 24 * ONE_HOUR;

  // Less than 10 minutes: show time with seconds
  if (dataTimeSpanMs < 10 * ONE_MINUTE) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  }

  // Less than 1 hour: show time with minutes
  if (dataTimeSpanMs < ONE_HOUR) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Less than 24 hours: show time
  if (dataTimeSpanMs < ONE_DAY) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Less than 7 days: show date + time
  if (dataTimeSpanMs < 7 * ONE_DAY) {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
    });
  }

  // 7+ days: show just the date
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a timestamp for tooltip display.
 */
export function formatTooltipDate(timestamp: number): string {
  // Handle invalid input
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return "";
  }

  const date = new Date(timestamp * 1_000);
  
  // Verify the date is valid
  if (isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Truncates an Ethereum address for display.
 */
export function truncateAddress(
  address: string | undefined,
  chars: { start?: number; end?: number } = {}
): string {
  if (!address) return "";
  const { start = 6, end = 4 } = chars;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

