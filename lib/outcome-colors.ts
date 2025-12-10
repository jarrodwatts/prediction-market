/**
 * Outcome Colors Utility
 *
 * Provides consistent color theming for market outcomes across the UI.
 * Standardizes the color logic for Yes/No binary markets and multi-outcome markets.
 */

// =============================================================================
// Color Constants
// =============================================================================

/**
 * Standard colors for binary Yes/No outcomes.
 */
export const OUTCOME_COLORS = {
  yes: "#10b981", // emerald-500
  no: "#f43f5e", // rose-500
} as const;

/**
 * Chart colors from CSS variables (--chart-1 through --chart-10).
 * Used for multi-outcome markets beyond Yes/No.
 */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
] as const;

// =============================================================================
// Color Functions
// =============================================================================

/**
 * Gets the appropriate color for an outcome based on its title.
 * "Yes" outcomes get emerald, "No" outcomes get rose, others use chart colors.
 *
 * @param title - The outcome title (e.g., "Yes", "No", "Option A")
 * @param index - The outcome's index position (used for chart color fallback)
 * @returns CSS color value (hex or var())
 */
export function getOutcomeColor(title: string, index: number): string {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle === "yes") return OUTCOME_COLORS.yes;
  if (lowerTitle === "no") return OUTCOME_COLORS.no;

  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Gets Tailwind CSS class names for outcome-based styling.
 * Useful for backgrounds, borders, and text colors.
 *
 * @param title - The outcome title
 * @returns Object with Tailwind class names for different style properties
 */
export function getOutcomeClasses(title: string): {
  bg: string;
  bgLight: string;
  text: string;
  border: string;
} {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle === "yes") {
    return {
      bg: "bg-emerald-500",
      bgLight: "bg-emerald-500/10",
      text: "text-emerald-500",
      border: "border-emerald-500/20",
    };
  }

  if (lowerTitle === "no") {
    return {
      bg: "bg-rose-500",
      bgLight: "bg-rose-500/10",
      text: "text-rose-500",
      border: "border-rose-500/20",
    };
  }

  // Default/neutral colors for other outcomes
  return {
    bg: "bg-primary",
    bgLight: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/20",
  };
}

/**
 * Determines if an outcome represents a positive action (Yes/Buy).
 *
 * @param title - The outcome title
 * @returns True if the outcome is considered "positive"
 */
export function isPositiveOutcome(title: string): boolean {
  return title.toLowerCase() === "yes";
}

/**
 * Sorts outcomes for binary markets, ensuring Yes comes before No.
 *
 * @param outcomes - Array of outcomes with title and price
 * @returns Sorted array with Yes first (for binary) or by price (for multi)
 */
export function sortBinaryOutcomes<T extends { title: string; price: number }>(
  outcomes: T[]
): T[] {
  if (outcomes.length !== 2) {
    // For non-binary, sort by price descending
    return [...outcomes].sort((a, b) => b.price - a.price);
  }

  const yesOutcome = outcomes.find((o) => o.title.toLowerCase() === "yes");
  const noOutcome = outcomes.find((o) => o.title.toLowerCase() === "no");

  if (yesOutcome && noOutcome) {
    return [yesOutcome, noOutcome];
  }

  // Fallback: sort by price
  return [...outcomes].sort((a, b) => b.price - a.price);
}

