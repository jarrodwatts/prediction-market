/**
 * Backend error classes for API routes and server-side code
 */

export class BackendError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.context = context
    Error.captureStackTrace(this, this.constructor)
  }
}

export class BlockchainError extends BackendError {
  constructor(message: string, public readonly txHash?: string) {
    super(message, 500, true, { txHash })
  }
}

export class TransactionRevertedError extends BlockchainError {
  public readonly operation: string

  constructor(txHash: string, operation: string) {
    super(
      `Transaction reverted during ${operation}. This may indicate insufficient gas, contract error, or invalid parameters.`,
      txHash
    )
    this.operation = operation
  }
}

export class ConfigurationError extends BackendError {
  constructor(message: string, configKey?: string) {
    super(message, 500, false, { configKey })
  }
}

export class MissingConfigError extends ConfigurationError {
  constructor(configKey: string) {
    super(`Missing required configuration: ${configKey}`, configKey)
  }
}
