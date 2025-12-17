/**
 * Background task execution utility
 *
 * Executes tasks asynchronously without blocking the main request/response flow.
 * Useful for non-critical operations like fetching external data, caching, etc.
 */

import { logger } from './logger'

type TaskFunction = () => Promise<void>

/**
 * Execute a task in the background (fire-and-forget)
 *
 * The task runs asynchronously and does not block the calling code.
 * Errors are logged but do not throw.
 *
 * @param taskName - Descriptive name for logging
 * @param task - Async function to execute
 *
 * @example
 * ```typescript
 * runInBackground('fetch-profile', async () => {
 *   const data = await fetchExternalAPI()
 *   await cacheData(data)
 * })
 * ```
 */
export function runInBackground(taskName: string, task: TaskFunction): void {
  task()
    .then(() => {
      logger.debug(`Background task completed: ${taskName}`)
    })
    .catch((error) => {
      logger.error(`Background task failed: ${taskName}`, error)
    })
}
