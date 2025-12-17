/**
 * Circuit Breaker pattern for fault tolerance
 *
 * Protects against cascading failures by failing fast when a service is down.
 * Uses three states: closed (normal), open (failing fast), half-open (testing recovery).
 *
 * Benefits:
 * - Prevents wasting resources on requests destined to fail
 * - Gives failing services time to recover
 * - Provides fast feedback instead of slow timeouts
 */

import { logger } from './logger'

interface CircuitBreakerConfig {
  /**
   * Number of failures before opening the circuit
   * Higher = more tolerant of transient errors
   */
  failureThreshold: number

  /**
   * Time in ms to wait before attempting recovery
   * Higher = more conservative recovery
   */
  resetTimeout: number

  /**
   * Time window in ms for counting failures
   * Failures outside this window are not counted
   */
  monitorInterval: number
}

type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Circuit Breaker implementation
 *
 * State transitions:
 * - closed → open: When failures exceed threshold
 * - open → half-open: After reset timeout expires
 * - half-open → closed: When next request succeeds
 * - half-open → open: When next request fails
 */
class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures: number[] = [] // Timestamps of recent failures
  private lastFailureTime = 0
  private nextRetryTime = 0

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * Execute an operation through the circuit breaker
   *
   * @param operation - The async operation to execute
   * @returns Result of the operation
   * @throws Error if circuit is open, or if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.updateState()

    if (this.state === 'open') {
      const waitTime = Math.ceil((this.nextRetryTime - Date.now()) / 1000)
      logger.error(`Circuit breaker open for ${this.name}`, undefined, {
        state: this.state,
        retryIn: `${waitTime}s`,
        failures: this.failures.length,
      })
      throw new Error(
        `Circuit breaker open for ${this.name}. Service temporarily unavailable. Retry in ${waitTime}s.`
      )
    }

    try {
      const result = await operation()

      // Success - if we're in half-open, close the circuit
      if (this.state === 'half-open') {
        logger.info(`Circuit breaker closed for ${this.name}`, {
          previousState: 'half-open',
        })
        this.state = 'closed'
        this.failures = []
      }

      return result
    } catch (error) {
      this.recordFailure()
      throw error
    }
  }

  /**
   * Update circuit state based on current conditions
   */
  private updateState(): void {
    const now = Date.now()

    // If open, check if it's time to try again
    if (this.state === 'open') {
      if (now >= this.nextRetryTime) {
        logger.info(`Circuit breaker half-open for ${this.name}`, {
          previousState: 'open',
          downtime: `${Math.ceil((now - this.lastFailureTime) / 1000)}s`,
        })
        this.state = 'half-open'
      }
      return
    }

    // Clean old failures outside monitoring window
    this.failures = this.failures.filter(
      timestamp => now - timestamp < this.config.monitorInterval
    )

    // Check if we've exceeded failure threshold
    if (this.failures.length >= this.config.failureThreshold) {
      logger.warn(`Circuit breaker opening for ${this.name}`, {
        failures: this.failures.length,
        threshold: this.config.failureThreshold,
        monitorWindow: `${this.config.monitorInterval / 1000}s`,
      })
      this.state = 'open'
      this.nextRetryTime = now + this.config.resetTimeout
    }
  }

  /**
   * Record a failure and update circuit state
   */
  private recordFailure(): void {
    const now = Date.now()
    this.failures.push(now)
    this.lastFailureTime = now
    this.updateState()
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState()
    return this.state
  }

  /**
   * Get circuit health metrics
   */
  getMetrics() {
    this.updateState()
    return {
      state: this.state,
      failures: this.failures.length,
      threshold: this.config.failureThreshold,
      nextRetryTime: this.state === 'open' ? new Date(this.nextRetryTime).toISOString() : null,
    }
  }

  /**
   * Manually reset the circuit (for admin/debugging)
   */
  reset(): void {
    this.state = 'closed'
    this.failures = []
    this.nextRetryTime = 0
    logger.info(`Circuit breaker manually reset for ${this.name}`)
  }
}

/**
 * Predefined circuit breakers for different services
 */
export const circuitBreakers = {
  /**
   * RPC circuit breaker
   * Protects against blockchain RPC failures
   *
   * Config:
   * - 5 failures in 60s → open circuit
   * - Wait 30s before retry
   * - Fail fast (<10ms) instead of 30s timeout
   */
  rpc: new CircuitBreaker('RPC', {
    failureThreshold: 5,
    resetTimeout: 30_000, // 30 seconds
    monitorInterval: 60_000, // 1 minute window
  }),

  /**
   * KV circuit breaker (optional, for monitoring)
   * Less critical than RPC since retry logic already handles transient failures
   */
  kv: new CircuitBreaker('KV', {
    failureThreshold: 3,
    resetTimeout: 10_000, // 10 seconds
    monitorInterval: 30_000, // 30 second window
  }),
}
