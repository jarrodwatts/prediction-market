/**
 * Structured logging utility for production observability
 *
 * Outputs JSON logs in production for easy parsing in Vercel logs
 * Uses console.log in development for readability
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    message: string
    stack?: string
    name?: string
  }
}

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Format error object for logging
 */
function formatError(error: unknown): LogEntry['error'] {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name,
    }
  }
  return {
    message: String(error),
  }
}

/**
 * Core logging function
 */
function log(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
    ...(error ? { error: formatError(error) } : {}),
  }

  if (isProduction) {
    // JSON logging for Vercel logs (easy to parse/filter)
    console.log(JSON.stringify(entry))
  } else {
    // Readable logging for development
    const emoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    }[level]

    console.log(`${emoji} [${level.toUpperCase()}] ${message}`)
    if (context) {
      console.log('  Context:', context)
    }
    if (error) {
      console.error('  Error:', error)
    }
  }
}

/**
 * Logger interface with semantic methods
 */
export const logger = {
  debug: (message: string, context?: LogContext) => {
    log('debug', message, context)
  },

  info: (message: string, context?: LogContext) => {
    log('info', message, context)
  },

  warn: (message: string, context?: LogContext) => {
    log('warn', message, context)
  },

  error: (message: string, error?: unknown, context?: LogContext) => {
    log('error', message, context, error)
  },

  /**
   * Log webhook processing events
   */
  webhook: {
    received: (messageId: string, type: string) => {
      log('info', 'Webhook received', {
        messageId,
        webhookType: type,
      })
    },

    duplicate: (messageId: string, reason: string) => {
      log('info', 'Webhook duplicate detected', {
        messageId,
        reason,
      })
    },

    processing: (messageId: string, eventType: string, eventId: string) => {
      log('info', 'Processing webhook event', {
        messageId,
        eventType,
        eventId,
      })
    },

    completed: (messageId: string, duration: number) => {
      log('info', 'Webhook processing completed', {
        messageId,
        durationMs: duration,
      })
    },

    failed: (messageId: string, error: unknown) => {
      log('error', 'Webhook processing failed', { messageId }, error)
    },
  },

  /**
   * Log market creation events
   */
  market: {
    creating: (predictionId: string, question: string) => {
      log('info', 'Creating market', {
        predictionId,
        question,
      })
    },

    created: (
      predictionId: string,
      marketId: string | bigint,
      txHash: string,
      durationMs: number
    ) => {
      log('info', 'Market created successfully', {
        predictionId,
        marketId: marketId.toString(),
        txHash,
        durationMs,
      })
    },

    duplicate: (predictionId: string, status: string) => {
      log('info', 'Market creation skipped - already processed', {
        predictionId,
        existingStatus: status,
      })
    },

    failed: (predictionId: string, error: unknown) => {
      log('error', 'Market creation failed', { predictionId }, error)
    },

    locking: (marketId: string | bigint) => {
      log('info', 'Locking market', {
        marketId: marketId.toString(),
      })
    },

    locked: (marketId: string | bigint, txHash: string) => {
      log('info', 'Market locked successfully', {
        marketId: marketId.toString(),
        txHash,
      })
    },

    resolving: (marketId: string | bigint, outcomeId: number) => {
      log('info', 'Resolving market', {
        marketId: marketId.toString(),
        outcomeId,
      })
    },

    resolved: (marketId: string | bigint, outcomeId: number, txHash: string) => {
      log('info', 'Market resolved successfully', {
        marketId: marketId.toString(),
        outcomeId,
        txHash,
      })
    },

    voiding: (marketId: string | bigint) => {
      log('info', 'Voiding market', {
        marketId: marketId.toString(),
      })
    },

    voided: (marketId: string | bigint, txHash: string) => {
      log('info', 'Market voided successfully', {
        marketId: marketId.toString(),
        txHash,
      })
    },
  },

  /**
   * Log transaction events
   */
  transaction: {
    submitted: (txHash: string, operation: string) => {
      log('info', 'Transaction submitted', {
        txHash,
        operation,
      })
    },

    waiting: (txHash: string) => {
      log('debug', 'Waiting for transaction confirmation', {
        txHash,
      })
    },

    confirmed: (txHash: string, blockNumber: string | bigint, durationMs: number) => {
      log('info', 'Transaction confirmed', {
        txHash,
        blockNumber: blockNumber.toString(),
        durationMs,
      })
    },

    reverted: (txHash: string, operation: string) => {
      log('error', 'Transaction reverted', {
        txHash,
        operation,
      })
    },

    failed: (operation: string, error: unknown) => {
      log('error', 'Transaction failed', { operation }, error)
    },
  },

  /**
   * Log RPC events (for monitoring connection issues)
   */
  rpc: {
    timeout: (method: string, durationMs: number) => {
      log('warn', 'RPC request timeout', {
        method,
        durationMs,
      })
    },

    retry: (method: string, attempt: number, error: unknown) => {
      log('warn', 'RPC request retry', { method, attempt }, error)
    },

    error: (method: string, error: unknown) => {
      log('error', 'RPC request failed', { method }, error)
    },
  },

  /**
   * Log authentication events
   */
  auth: {
    unauthorized: (endpoint: string, reason: string) => {
      log('warn', 'Unauthorized access attempt', {
        endpoint,
        reason,
      })
    },

    forbidden: (endpoint: string, userId?: string) => {
      log('warn', 'Forbidden access attempt', {
        endpoint,
        ...(userId && { userId }),
      })
    },
  },
}
