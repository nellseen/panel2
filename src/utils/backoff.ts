export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterRatio?: number;
  maxAttempts?: number;
  randomFn?: () => number;
}

const DEFAULT_BASE_MS = 1000;
const DEFAULT_MAX_MS = 30000;
const DEFAULT_FACTOR = 2;
const DEFAULT_JITTER_RATIO = 0.2;

/**
 * Calculates exponential backoff delay in milliseconds with bounded symmetric jitter.
 * Attempt is 0-indexed (attempt 0 => ~baseDelayMs).
 */
export function calculateBackoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? DEFAULT_BASE_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_MAX_MS);
  const factor = Math.max(1.1, options.factor ?? DEFAULT_FACTOR);
  const jitterRatio = Math.min(0.5, Math.max(0, options.jitterRatio ?? DEFAULT_JITTER_RATIO));
  const random = options.randomFn ?? Math.random;

  const safeAttempt = Math.max(0, Math.min(attempt, 20));
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, safeAttempt));

  if (jitterRatio === 0) {
    return Math.round(exponential);
  }

  // Symmetric jitter in [-jitterRatio, +jitterRatio]
  const offset = (random() * 2 - 1) * jitterRatio * exponential;
  const jittered = Math.min(maxDelayMs, Math.max(baseDelayMs * 0.5, exponential + offset));
  return Math.round(jittered);
}

export function shouldContinueRetrying(attempt: number, maxAttempts?: number): boolean {
  if (maxAttempts === undefined || maxAttempts <= 0) {
    return true;
  }
  return attempt < maxAttempts;
}
