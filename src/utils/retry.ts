import { logger } from './logger';

// Retries an async operation with exponential backoff.
// Returns undefined if all retries fail, enabling graceful degradation.
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T | undefined> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${msg}`);

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  logger.error(`[${label}] All ${maxRetries} retries exhausted — returning undefined`);
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
