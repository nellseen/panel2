import { PendingServerAction, ServerModel, ServerStatus } from '../types';

const VALID_TRANSITIONS: Record<ServerStatus, ReadonlySet<ServerStatus>> = {
  created: new Set(['starting', 'installing', 'stopped', 'failed']),
  stopped: new Set(['starting', 'installing', 'stopped', 'failed']),
  crashed: new Set(['starting', 'installing', 'stopped', 'failed']),
  failed: new Set(['starting', 'installing', 'stopped']),
  installing: new Set(['stopped', 'failed', 'starting']),
  starting: new Set(['running', 'stopped', 'crashed', 'failed', 'stopping']),
  running: new Set(['stopping', 'stopped', 'crashed', 'failed']),
  stopping: new Set(['stopped', 'crashed', 'failed']),
};

export function isValidStatusTransition(from: ServerStatus, to: ServerStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from]?.has(to) ?? false;
}

export function canStartServer(status: ServerStatus, pendingAction?: PendingServerAction): boolean {
  if (pendingAction) return false;
  return status === 'created' || status === 'stopped' || status === 'crashed' || status === 'failed';
}

export function canStopServer(status: ServerStatus, pendingAction?: PendingServerAction): boolean {
  if (pendingAction) return false;
  return status === 'running' || status === 'starting';
}

export function canRestartServer(status: ServerStatus, pendingAction?: PendingServerAction): boolean {
  if (pendingAction) return false;
  return status === 'running';
}

export function isServerTransitioning(status: ServerStatus, pendingAction?: PendingServerAction): boolean {
  if (pendingAction) return true;
  return status === 'starting' || status === 'stopping' || status === 'installing';
}

/**
 * Applies a WebSocket status delta to an existing server record without losing metrics,
 * clearing stale PID/RAM/CPU immediately when a server leaves the 'running' state.
 */
export function applyServerStatusUpdate(
  server: ServerModel,
  newStatus: ServerStatus,
  exitCode: number
): ServerModel {
  const isNowRunning = newStatus === 'running';
  const nextMetrics = server.metrics
    ? {
        ...server.metrics,
        status: newStatus,
        pid: isNowRunning ? server.metrics.pid : 0,
        uptime_sec: isNowRunning ? server.metrics.uptime_sec : 0,
        memory_mb: isNowRunning ? server.metrics.memory_mb : 0,
        cpu_percent: isNowRunning ? server.metrics.cpu_percent : 0,
      }
    : undefined;

  return {
    ...server,
    status: newStatus,
    last_exit_code: exitCode,
    metrics: nextMetrics,
  };
}

/**
 * Safely reconciles incoming server list with previous state.
 * Never wipes existing servers on null/invalid responses.
 */
export function reconcileServerList(
  previous: ServerModel[],
  incoming: ServerModel[] | null | undefined
): ServerModel[] {
  if (!Array.isArray(incoming)) {
    return previous;
  }
  return incoming;
}
