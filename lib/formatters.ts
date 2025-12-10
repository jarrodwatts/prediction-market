/**
 * Formatters Utility
 *
 * Shared formatting functions used throughout the Myriad Starter Kit.
 * Centralizes all number, currency, date, and percentage formatting.
 */

// =============================================================================
// Currency Formatting
// =============================================================================

/**
 * Formats a number as USD currency.
 *
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a number in compact notation (K, M, B suffixes).
 * Useful for displaying large volumes or liquidity values.
 *
 * @param value - The numeric value to format
 * @param options - Optional configuration
 * @param options.prefix - Prefix to add (default: "$")
 * @param options.suffix - Suffix to add (default: "")
 * @returns Formatted compact string (e.g., "$1.5M")
 */
export function formatCompact(
  value: number,
  options: { prefix?: string; suffix?: string } = {}
): string {
  const { prefix = "$", suffix = "" } = options;

  if (value >= 1_000_000_000) {
    return `${prefix}${(value / 1_000_000_000).toFixed(1)}B${suffix}`;
  }
  if (value >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1)}M${suffix}`;
  }
  if (value >= 1_000) {
    return `${prefix}${(value / 1_000).toFixed(1)}K${suffix}`;
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
 * Formats a value in points notation (K, M suffixes + "pts").
 * Used for displaying market volume in points.
 *
 * @param value - The numeric value to format
 * @returns Formatted points string (e.g., "1.5M pts")
 */
export function formatPoints(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M pts`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K pts`;
  return `${value.toFixed(0)} pts`;
}

// =============================================================================
// Percentage Formatting
// =============================================================================

/**
 * Formats a decimal as a percentage string.
 *
 * @param value - Decimal value (0-1 range, e.g., 0.75 for 75%)
 * @param options - Optional configuration
 * @param options.decimals - Number of decimal places (default: 1)
 * @param options.showSign - Whether to show +/- prefix (default: false)
 * @returns Formatted percentage string (e.g., "75.4%")
 */
export function formatPercent(
  value: number | null,
  options: { decimals?: number; showSign?: boolean } = {}
): string {
  if (value === null) return "—";

  const { decimals = 1, showSign = false } = options;
  const percentage = value * 100;

  if (showSign) {
    return `${percentage >= 0 ? "+" : ""}${percentage.toFixed(decimals)}%`;
  }

  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Formats a price as a percentage (price → cents).
 * Prices in prediction markets are 0-1 representing probability.
 *
 * @param price - Price value (0-1)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "75.4%")
 */
export function formatPricePercent(price: number, decimals: number = 1): string {
  return `${(price * 100).toFixed(decimals)}%`;
}

// =============================================================================
// Date & Time Formatting
// =============================================================================

/**
 * Formats a date string with full details.
 *
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "Nov 27, 2025, 3:45 PM EST")
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
 *
 * @param dateString - ISO date string
 * @returns Formatted short date (e.g., "Nov 27")
 */
export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Calculates and formats time remaining until expiry.
 * Returns human-readable relative time.
 *
 * @param expiresAt - ISO date string or timestamp in ms
 * @returns Relative time string (e.g., "5d", "12h", "< 1h", "Expired")
 */
export function formatTimeRemaining(expiresAt: string | number | bigint): string {
  const now = new Date();
  const expiry = new Date(typeof expiresAt === 'bigint' ? Number(expiresAt) * 1000 : expiresAt);
  const diff = expiry.getTime() - now.getTime();

  if (diff < 0) return "Expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  // If more than 30 days, show the date instead
  if (days > 30) {
    return formatShortDate(expiry.toISOString());
  }
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return "< 1h";
}

/**
 * Formats a timestamp for chart display based on timeframe.
 *
 * @param timestamp - Unix timestamp in seconds
 * @param timeframe - Chart timeframe ("24h" | "7d" | "30d" | "all")
 * @returns Formatted time string appropriate for the timeframe
 */
export function formatChartDate(
  timestamp: number,
  timeframe: "24h" | "7d" | "30d" | "all"
): string {
  // Handle invalid input
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return "";
  }

  const date = new Date(timestamp * 1000);
  
  // Verify the date is valid
  if (isNaN(date.getTime())) {
    return "";
  }

  if (timeframe === "24h") {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  if (timeframe === "7d") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a timestamp for tooltip display (full date with time).
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted tooltip string (e.g., "Nov 27, 3:45 PM")
 */
export function formatTooltipDate(timestamp: number): string {
  // Handle invalid input
  if (timestamp === undefined || timestamp === null || isNaN(timestamp)) {
    return "";
  }

  const date = new Date(timestamp * 1000);
  
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

// =============================================================================
// Address Formatting
// =============================================================================

/**
 * Truncates an Ethereum address for display.
 *
 * @param address - Full Ethereum address
 * @param chars - Number of characters to show at start/end (default: 6/4)
 * @returns Truncated address (e.g., "0x1234...5678")
 */
export function truncateAddress(
  address: string | undefined,
  chars: { start?: number; end?: number } = {}
): string {
  if (!address) return "";
  const { start = 6, end = 4 } = chars;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Formats shares/token amounts with appropriate decimal places.
 *
 * @param value - The numeric value
 * @param decimals - Decimal places (default: 2)
 * @returns Formatted number string
 */
export function formatShares(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

