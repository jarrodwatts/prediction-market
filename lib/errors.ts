/**
 * User-Friendly Error Parsing
 * 
 * Transforms technical blockchain/wallet errors into clear, actionable messages.
 * Technical details are logged to console for debugging but hidden from users.
 */

export interface ParsedError {
  /** User-friendly title */
  title: string;
  /** User-friendly description/message */
  message: string;
  /** Suggested action for the user */
  suggestion?: string;
  /** Original error for debugging */
  original: unknown;
}

type ErrorPattern = {
  pattern: RegExp;
  title: string;
  message: string;
  suggestion?: string;
};

/**
 * Error patterns matched against error messages.
 * Order matters - first match wins, so more specific patterns should come first.
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // ============ User Action Errors ============
  {
    pattern: /user rejected|user denied|rejected by user|request rejected/i,
    title: "Transaction Cancelled",
    message: "You cancelled the transaction in your wallet.",
    suggestion: "Try again when you're ready to confirm.",
  },
  {
    pattern: /user closed|popup closed|window closed/i,
    title: "Wallet Closed",
    message: "The wallet window was closed before completing.",
    suggestion: "Please try again and complete the action in your wallet.",
  },

  // ============ Balance & Allowance Errors ============
  {
    pattern: /insufficient funds for gas|insufficient balance for gas/i,
    title: "Not Enough ETH for Gas",
    message: "You don't have enough ETH to pay for transaction fees.",
    suggestion: "Add more ETH to your wallet to cover gas costs.",
  },
  {
    pattern: /insufficient funds|insufficient balance|balance too low|exceeds balance/i,
    title: "Insufficient Balance",
    message: "You don't have enough funds for this transaction.",
    suggestion: "Check your balance and try a smaller amount.",
  },
  {
    pattern: /transfer amount exceeds allowance|allowance/i,
    title: "Approval Required",
    message: "You need to approve token spending first.",
    suggestion: "Approve the token and try again.",
  },

  // ============ Trading Errors ============
  {
    pattern: /slippage|price.*changed|price.*moved|price impact too high/i,
    title: "Price Changed",
    message: "The price moved while processing your order.",
    suggestion: "Try again or increase slippage tolerance.",
  },
  {
    pattern: /minimum.*amount|amount too low|below minimum/i,
    title: "Amount Too Low",
    message: "The amount is below the minimum required.",
    suggestion: "Enter a larger amount and try again.",
  },
  {
    pattern: /maximum.*exceeded|amount too high|exceeds maximum/i,
    title: "Amount Too High", 
    message: "The amount exceeds the maximum allowed.",
    suggestion: "Enter a smaller amount and try again.",
  },

  // ============ Market State Errors ============
  {
    pattern: /market.*closed|market.*expired|trading.*closed/i,
    title: "Market Closed",
    message: "This market is no longer accepting trades.",
  },
  {
    pattern: /market.*not.*resolved|awaiting.*resolution/i,
    title: "Not Yet Resolved",
    message: "This market hasn't been resolved yet.",
    suggestion: "Check back after the outcome is determined.",
  },
  {
    pattern: /already.*claimed|nothing.*claim|no.*winnings/i,
    title: "Already Claimed",
    message: "You've already claimed your rewards.",
  },
  {
    pattern: /no.*position|no.*shares|position.*empty/i,
    title: "No Position",
    message: "You don't have any shares to sell or claim.",
  },

  // ============ Network & Connection Errors ============
  {
    pattern: /network.*error|connection.*failed|failed to fetch|network request/i,
    title: "Connection Error",
    message: "Unable to connect to the network.",
    suggestion: "Check your internet connection and try again.",
  },
  {
    pattern: /timeout|request timed out|took too long/i,
    title: "Request Timeout",
    message: "The request took too long to complete.",
    suggestion: "Please try again.",
  },
  {
    pattern: /rate.*limit|too many requests|throttle/i,
    title: "Too Many Requests",
    message: "Please slow down and try again shortly.",
    suggestion: "Wait a moment before trying again.",
  },

  // ============ Transaction Errors ============
  {
    pattern: /nonce.*too.*low|nonce.*already.*used/i,
    title: "Transaction Conflict",
    message: "There's a pending transaction conflict.",
    suggestion: "Wait for pending transactions to complete, then try again.",
  },
  {
    pattern: /nonce.*too.*high/i,
    title: "Transaction Queue Issue",
    message: "There's an issue with your transaction queue.",
    suggestion: "Try resetting your wallet's transaction history.",
  },
  {
    pattern: /out of gas|gas.*limit|intrinsic gas/i,
    title: "Gas Limit Error",
    message: "The transaction ran out of gas.",
    suggestion: "Try again with a higher gas limit.",
  },
  {
    pattern: /underpriced|gas.*price.*too.*low/i,
    title: "Gas Price Too Low",
    message: "The gas price is too low for current network conditions.",
    suggestion: "Try again with a higher gas price.",
  },
  {
    pattern: /replacement.*underpriced/i,
    title: "Speed Up Failed",
    message: "The replacement transaction fee is too low.",
    suggestion: "Use a higher gas price to speed up the transaction.",
  },

  // ============ Contract Execution Errors ============
  {
    pattern: /execution reverted.*reason/i,
    title: "Transaction Failed",
    message: "The transaction couldn't be completed.",
    suggestion: "The contract rejected the transaction. Please try again.",
  },
  {
    pattern: /execution reverted|revert|reverted/i,
    title: "Transaction Reverted",
    message: "The transaction was rejected by the contract.",
    suggestion: "Please check your inputs and try again.",
  },
  {
    pattern: /invalid signature|signature.*invalid/i,
    title: "Signature Error",
    message: "The transaction signature is invalid.",
    suggestion: "Try disconnecting and reconnecting your wallet.",
  },

  // ============ Wallet Errors ============
  {
    pattern: /wallet.*not.*connected|not connected|disconnected/i,
    title: "Wallet Disconnected",
    message: "Your wallet is not connected.",
    suggestion: "Connect your wallet and try again.",
  },
  {
    pattern: /wrong.*network|chain.*mismatch|unsupported.*chain/i,
    title: "Wrong Network",
    message: "Your wallet is connected to the wrong network.",
    suggestion: "Switch to the correct network in your wallet.",
  },
  {
    pattern: /account.*changed|account.*switched/i,
    title: "Account Changed",
    message: "Your wallet account changed during the transaction.",
    suggestion: "Please try the transaction again.",
  },
];

/**
 * Parse a raw error into a user-friendly format.
 * 
 * @param error - The raw error from the blockchain/wallet
 * @param context - Optional context about what operation failed
 * @returns ParsedError with user-friendly messages
 */
export function parseError(error: unknown, context?: string): ParsedError {
  // Extract the error message string
  const errorMessage = extractErrorMessage(error);
  
  // Log the full technical error for debugging
  console.error(`[${context || 'Error'}]`, error);

  // Try to match against known patterns
  for (const { pattern, title, message, suggestion } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return {
        title,
        message,
        suggestion,
        original: error,
      };
    }
  }

  // Fallback for unrecognized errors
  return {
    title: "Something Went Wrong",
    message: "An unexpected error occurred.",
    suggestion: "Please try again or contact support if the issue persists.",
    original: error,
  };
}

/**
 * Extract a string message from various error types.
 */
function extractErrorMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    // Check for nested error messages (common in viem/wagmi)
    const err = error as Error & { 
      shortMessage?: string; 
      details?: string;
      cause?: Error;
      reason?: string;
    };

    // viem often provides a shortMessage which is cleaner
    if (err.shortMessage) {
      return err.shortMessage;
    }

    // Check for a reason field (ethers.js style)
    if (err.reason) {
      return err.reason;
    }

    // Check for nested cause
    if (err.cause instanceof Error) {
      return extractErrorMessage(err.cause);
    }

    // Check for details
    if (err.details) {
      return `${err.message} ${err.details}`;
    }

    return err.message;
  }

  // Handle object errors
  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    
    if (typeof obj.message === "string") {
      return obj.message;
    }
    
    if (typeof obj.error === "string") {
      return obj.error;
    }

    if (obj.error && typeof obj.error === "object") {
      return extractErrorMessage(obj.error);
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  return String(error);
}

/**
 * Get just the user-friendly message without the full parsed object.
 * Useful for simple toast displays.
 */
export function getFriendlyErrorMessage(error: unknown, context?: string): string {
  const parsed = parseError(error, context);
  return parsed.message;
}

/**
 * Check if an error was caused by user cancellation.
 * Useful for suppressing error toasts when user intentionally cancelled.
 */
export function isUserRejection(error: unknown): boolean {
  const errorMessage = extractErrorMessage(error);
  return /user rejected|user denied|rejected by user|request rejected|user closed|popup closed/i.test(errorMessage);
}
