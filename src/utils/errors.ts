export interface NormalizedError {
  message: string;
  code: string;
  status?: number;
  retryable: boolean;
  isAbort: boolean;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly retryable: boolean;

  constructor(message: string, status: number, code = 'API_ERROR', retryable?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable ?? (status === 0 || status === 408 || status === 429 || status >= 500);
  }
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String((error as { name?: unknown }).name) : '';
  return name === 'AbortError';
}

export function normalizeError(error: unknown, fallbackMessage = 'An unexpected error occurred'): NormalizedError {
  if (isAbortError(error)) {
    return {
      message: 'Request cancelled',
      code: 'ABORTED',
      retryable: false,
      isAbort: true,
    };
  }

  if (error instanceof ApiError) {
    return {
      message: error.message || fallbackMessage,
      code: error.code,
      status: error.status,
      retryable: error.retryable,
      isAbort: false,
    };
  }

  if (error instanceof TypeError) {
    // Browser fetch network failure throws TypeError ("Failed to fetch")
    return {
      message: 'Unable to reach panel backend. Check connection.',
      code: 'NETWORK_ERROR',
      status: 0,
      retryable: true,
      isAbort: false,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      code: 'RUNTIME_ERROR',
      retryable: false,
      isAbort: false,
    };
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return {
      message: error.trim(),
      code: 'ERROR',
      retryable: false,
      isAbort: false,
    };
  }

  return {
    message: fallbackMessage,
    code: 'UNKNOWN_ERROR',
    retryable: false,
    isAbort: false,
  };
}
