import { describe, expect, it } from 'vitest';
import { calculateBackoffDelay, shouldContinueRetrying } from '../../src/utils/backoff';
import { ApiError, isAbortError, normalizeError } from '../../src/utils/errors';

describe('calculateBackoffDelay & shouldContinueRetrying', () => {
  it('computes deterministic exponential delays when jitterRatio is 0', () => {
    expect(calculateBackoffDelay(0, { baseDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0 })).toBe(1000);
    expect(calculateBackoffDelay(1, { baseDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0 })).toBe(2000);
    expect(calculateBackoffDelay(2, { baseDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0 })).toBe(4000);
    expect(calculateBackoffDelay(3, { baseDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0 })).toBe(8000);
  });

  it('caps exponential delay at maxDelayMs even on high attempt counts', () => {
    expect(calculateBackoffDelay(12, { baseDelayMs: 1000, maxDelayMs: 15000, jitterRatio: 0 })).toBe(15000);
    expect(calculateBackoffDelay(99, { baseDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0.2 })).toBeLessThanOrEqual(30000);
  });

  it('applies bounded symmetric jitter using custom randomFn', () => {
    const low = calculateBackoffDelay(1, {
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterRatio: 0.2,
      randomFn: () => 0,
    });
    const mid = calculateBackoffDelay(1, {
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterRatio: 0.2,
      randomFn: () => 0.5,
    });
    const high = calculateBackoffDelay(1, {
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterRatio: 0.2,
      randomFn: () => 1,
    });

    expect(low).toBe(1600);
    expect(mid).toBe(2000);
    expect(high).toBe(2400);
  });

  it('enforces retry attempt limits accurately', () => {
    expect(shouldContinueRetrying(0)).toBe(true);
    expect(shouldContinueRetrying(500)).toBe(true);
    expect(shouldContinueRetrying(0, 5)).toBe(true);
    expect(shouldContinueRetrying(4, 5)).toBe(true);
    expect(shouldContinueRetrying(5, 5)).toBe(false);
    expect(shouldContinueRetrying(6, 5)).toBe(false);
  });
});

describe('ApiError & normalizeError', () => {
  it('marks 5xx, 408, 429, and network status 0 as retryable and 4xx client errors as non-retryable', () => {
    expect(new ApiError('Server unavailable', 503, 'HTTP_503').retryable).toBe(true);
    expect(new ApiError('Rate limited', 429, 'RATE_LIMITED').retryable).toBe(true);
    expect(new ApiError('Timed out', 408, 'TIMEOUT').retryable).toBe(true);
    expect(new ApiError('Offline', 0, 'NETWORK').retryable).toBe(true);

    expect(new ApiError('Invalid payload', 400, 'INVALID_PORT').retryable).toBe(false);
    expect(new ApiError('Forbidden', 403, 'PATH_TRAVERSAL').retryable).toBe(false);
    expect(new ApiError('Not found', 404, 'SERVER_NOT_FOUND').retryable).toBe(false);
  });

  it('detects AbortError instances accurately', () => {
    const abortErr = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isAbortError(abortErr)).toBe(true);
    expect(isAbortError(new Error('Normal error'))).toBe(false);
    expect(isAbortError(null)).toBe(false);

    const normalized = normalizeError(abortErr);
    expect(normalized.isAbort).toBe(true);
    expect(normalized.code).toBe('ABORTED');
    expect(normalized.retryable).toBe(false);
  });

  it('normalizes fetch TypeError, ApiError, generic Error, strings, and unknown values safely', () => {
    const net = normalizeError(new TypeError('Failed to fetch'));
    expect(net.code).toBe('NETWORK_ERROR');
    expect(net.retryable).toBe(true);

    const api = normalizeError(new ApiError('Port reserved', 400, 'INVALID_PORT'));
    expect(api.code).toBe('INVALID_PORT');
    expect(api.status).toBe(400);
    expect(api.message).toBe('Port reserved');

    const generic = normalizeError(new Error('Unexpected state'));
    expect(generic.code).toBe('RUNTIME_ERROR');
    expect(generic.message).toBe('Unexpected state');

    const str = normalizeError('Direct string message');
    expect(str.message).toBe('Direct string message');

    const fallback = normalizeError(undefined, 'Fallback message');
    expect(fallback.code).toBe('UNKNOWN_ERROR');
    expect(fallback.message).toBe('Fallback message');
  });
});
