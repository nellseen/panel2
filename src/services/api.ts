import {
  ActivityLog,
  ConnectionSnapshot,
  ConnectionState,
  CreateServerPayload,
  EnvInspectResult,
  EnvironmentInfo,
  FileEntry,
  LogLine,
  PackageSpec,
  ServerModel,
} from '../types';
import { calculateBackoffDelay } from '../utils/backoff';
import { ApiError } from '../utils/errors';

const BASE_URL = '/api';
const DEFAULT_TIMEOUT_MS = 15000;
const LONG_OP_TIMEOUT_MS = 300000;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function createCombinedSignal(externalSignal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      globalThis.clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> {
  const { signal, cleanup, didTimeout } = createCombinedSignal(
    options.signal,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal,
    });

    const rawText = await res.text();
    let parsed: unknown = null;
    if (rawText.trim().length > 0) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        if (!res.ok) {
          throw new ApiError(
            `Backend returned HTTP ${res.status} (${res.statusText || 'Error'})`,
            res.status,
            'NON_JSON_ERROR'
          );
        }
        throw new ApiError('Received malformed JSON response from server', res.status, 'INVALID_JSON', false);
      }
    }

    if (!res.ok) {
      const payload = (parsed && typeof parsed === 'object' ? parsed : {}) as {
        message?: string;
        error?: string | boolean;
        code?: string;
      };
      const errMsg =
        payload.message ||
        (typeof payload.error === 'string' ? payload.error : '') ||
        `Request failed with status ${res.status}`;
      const code = payload.code || `HTTP_${res.status}`;
      throw new ApiError(errMsg, res.status, code);
    }

    return parsed as T;
  } catch (err: unknown) {
    if (didTimeout()) {
      throw new ApiError('Request timed out while waiting for panel backend', 408, 'TIMEOUT', true);
    }
    throw err;
  } finally {
    cleanup();
  }
}

export async function fetchHealth(options?: RequestOptions) {
  return requestJson<{
    status: string;
    version: string;
    uptime_seconds: number;
    environment: string;
    timestamp: string;
  }>('/health', { method: 'GET' }, options);
}

export async function fetchRuntime(options?: RequestOptions): Promise<EnvironmentInfo> {
  return requestJson<EnvironmentInfo>('/runtime', { method: 'GET' }, options);
}

export async function fetchServers(options?: RequestOptions): Promise<ServerModel[]> {
  return requestJson<ServerModel[]>('/servers', { method: 'GET' }, options);
}

export async function createServer(
  payload: CreateServerPayload,
  options?: RequestOptions
): Promise<ServerModel> {
  return requestJson<ServerModel>(
    '/servers',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    options
  );
}

export async function fetchServer(
  id: string,
  options?: RequestOptions
): Promise<ServerModel & { recent_logs?: LogLine[] }> {
  return requestJson<ServerModel & { recent_logs?: LogLine[] }>(
    `/servers/${encodeURIComponent(id)}`,
    { method: 'GET' },
    options
  );
}

export async function updateServer(
  id: string,
  payload: Partial<ServerModel>,
  options?: RequestOptions
): Promise<ServerModel> {
  return requestJson<ServerModel>(
    `/servers/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    options
  );
}

export async function deleteServer(id: string, options?: RequestOptions): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    options
  );
}

export async function startServer(
  id: string,
  options?: RequestOptions
): Promise<{ success: boolean; status?: string }> {
  return requestJson<{ success: boolean; status?: string }>(
    `/servers/${encodeURIComponent(id)}/start`,
    { method: 'POST' },
    options
  );
}

export async function stopServer(
  id: string,
  options?: RequestOptions
): Promise<{ success: boolean; status?: string }> {
  return requestJson<{ success: boolean; status?: string }>(
    `/servers/${encodeURIComponent(id)}/stop`,
    { method: 'POST' },
    { timeoutMs: 20000, ...options }
  );
}

export async function restartServer(
  id: string,
  options?: RequestOptions
): Promise<{ success: boolean; status?: string }> {
  return requestJson<{ success: boolean; status?: string }>(
    `/servers/${encodeURIComponent(id)}/restart`,
    { method: 'POST' },
    { timeoutMs: 25000, ...options }
  );
}

export async function installServerDeps(
  id: string,
  options?: RequestOptions
): Promise<{ success: boolean; output: string }> {
  return requestJson<{ success: boolean; output: string }>(
    `/servers/${encodeURIComponent(id)}/install`,
    { method: 'POST' },
    { timeoutMs: LONG_OP_TIMEOUT_MS, ...options }
  );
}

export async function fetchServerLogs(id: string, options?: RequestOptions): Promise<LogLine[]> {
  return requestJson<LogLine[]>(
    `/servers/${encodeURIComponent(id)}/logs`,
    { method: 'GET' },
    options
  );
}

// --- File Operations ---
export async function fetchServerFiles(
  id: string,
  subPath = '',
  options?: RequestOptions
): Promise<FileEntry[]> {
  const q = subPath ? `?path=${encodeURIComponent(subPath)}` : '';
  return requestJson<FileEntry[]>(
    `/servers/${encodeURIComponent(id)}/files${q}`,
    { method: 'GET' },
    options
  );
}

export async function readServerFile(
  id: string,
  filePath: string,
  options?: RequestOptions
): Promise<string> {
  const data = await requestJson<{ path: string; content: string }>(
    `/servers/${encodeURIComponent(id)}/files?path=${encodeURIComponent(filePath)}&content=true`,
    { method: 'GET' },
    options
  );
  return data.content;
}

export async function writeServerFile(
  id: string,
  filePath: string,
  content: string,
  options?: RequestOptions
): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}/files`,
    {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    },
    options
  );
}

export async function deleteServerFile(
  id: string,
  filePath: string,
  options?: RequestOptions
): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}/files?path=${encodeURIComponent(filePath)}`,
    { method: 'DELETE' },
    options
  );
}

export async function renameServerFile(
  id: string,
  oldPath: string,
  newPath: string,
  options?: RequestOptions
): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}/files/rename`,
    {
      method: 'POST',
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    },
    options
  );
}

export async function createServerDirectory(
  id: string,
  dirPath: string,
  options?: RequestOptions
): Promise<void> {
  await requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}/files/mkdir`,
    {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    },
    options
  );
}

export function getServerFileDownloadUrl(id: string, filePath: string): string {
  return `${BASE_URL}/servers/${encodeURIComponent(id)}/files/download?path=${encodeURIComponent(filePath)}`;
}

// --- Environment Variable Operations (.env.example & .env) ---
export async function fetchServerEnv(
  id: string,
  options?: RequestOptions
): Promise<EnvInspectResult> {
  return requestJson<EnvInspectResult>(
    `/servers/${encodeURIComponent(id)}/env`,
    { method: 'GET' },
    options
  );
}

export async function saveServerEnv(
  id: string,
  variables: Record<string, string>,
  options?: RequestOptions
): Promise<{ success: boolean; count: number }> {
  return requestJson<{ success: boolean; count: number }>(
    `/servers/${encodeURIComponent(id)}/env`,
    {
      method: 'POST',
      body: JSON.stringify({ variables }),
    },
    options
  );
}

export async function initServerEnvExample(
  id: string,
  options?: RequestOptions
): Promise<{ success: boolean }> {
  return requestJson<{ success: boolean }>(
    `/servers/${encodeURIComponent(id)}/env/init-example`,
    { method: 'POST' },
    options
  );
}

// --- Terminal Operations ---
export async function fetchTerminalInfo(
  id: string,
  options?: RequestOptions
): Promise<{ isRunning: boolean; cwd: string; currentCommand: string }> {
  return requestJson<{ isRunning: boolean; cwd: string; currentCommand: string }>(
    `/servers/${encodeURIComponent(id)}/terminal/info`,
    { method: 'GET' },
    options
  );
}

export async function cloneGitRepo(
  payload: {
    repo_url: string;
    branch?: string;
    name?: string;
    auto_install?: boolean;
  },
  options?: RequestOptions
): Promise<{ success: boolean; server: ServerModel; output: string }> {
  return requestJson<{ success: boolean; server: ServerModel; output: string }>(
    '/git/clone',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { timeoutMs: LONG_OP_TIMEOUT_MS, ...options }
  );
}

export async function fetchPackages(options?: RequestOptions): Promise<{
  packages: PackageSpec[];
  is_busy: boolean;
  active_op: string;
}> {
  return requestJson<{
    packages: PackageSpec[];
    is_busy: boolean;
    active_op: string;
  }>('/packages', { method: 'GET' }, options);
}

export async function installPackage(
  package_id: string,
  options?: RequestOptions
): Promise<{ success: boolean; output: string }> {
  return requestJson<{ success: boolean; output: string }>(
    '/packages/install',
    {
      method: 'POST',
      body: JSON.stringify({ package_id }),
    },
    { timeoutMs: LONG_OP_TIMEOUT_MS, ...options }
  );
}

export async function uninstallPackage(
  package_id: string,
  options?: RequestOptions
): Promise<{ success: boolean; output: string }> {
  return requestJson<{ success: boolean; output: string }>(
    '/packages/uninstall',
    {
      method: 'POST',
      body: JSON.stringify({ package_id }),
    },
    { timeoutMs: LONG_OP_TIMEOUT_MS, ...options }
  );
}

export async function fetchActivities(options?: RequestOptions): Promise<ActivityLog[]> {
  return requestJson<ActivityLog[]>('/activity', { method: 'GET' }, options);
}

type EventCallback<T = unknown> = (data: T) => void;

export interface WebSocketClientOptions {
  urlFactory?: () => string;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  randomFn?: () => number;
}

/**
 * Controlled WebSocket manager with:
 * - Exponential backoff + symmetric jitter
 * - Zero zombie reconnects on manual disconnect / React StrictMode cleanup
 * - Ref-counted multi-server subscriptions
 * - Automatic state reconciliation trigger ('reconnected') without command replay
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private subscriptions: Map<string, number> = new Map();
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private manualDisconnect = false;
  private hasConnectedOnce = false;
  private seq = 0;

  public state: ConnectionState = 'disconnected';
  public reconnectAttempt = 0;
  public nextRetryMs: number | null = null;
  public lastConnectedAt: string | null = null;

  private readonly options: WebSocketClientOptions;

  constructor(options: WebSocketClientOptions = {}) {
    this.options = options;
  }

  public get isConnected(): boolean {
    return this.state === 'connected';
  }

  public getSnapshot(): ConnectionSnapshot {
    return {
      state: this.state,
      reconnectAttempt: this.reconnectAttempt,
      nextRetryMs: this.nextRetryMs,
      lastConnectedAt: this.lastConnectedAt,
    };
  }

  private setState(next: ConnectionState): void {
    this.state = next;
    const statusCompat = next === 'connected' ? 'open' : 'closed';
    this.emit('connection', {
      status: statusCompat,
      state: next,
      reconnectAttempt: this.reconnectAttempt,
      nextRetryMs: this.nextRetryMs,
      lastConnectedAt: this.lastConnectedAt,
    });
  }

  private resolveUrl(): string {
    if (this.options.urlFactory) {
      return this.options.urlFactory();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  public connect(): void {
    this.manualDisconnect = false;

    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.nextRetryMs = null;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.resolveUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket || this.manualDisconnect) {
        socket.close();
        return;
      }

      const wasReconnect = this.hasConnectedOnce && this.reconnectAttempt > 0;
      this.hasConnectedOnce = true;
      this.reconnectAttempt = 0;
      this.nextRetryMs = null;
      this.lastConnectedAt = new Date().toISOString();
      this.setState('connected');

      // Re-subscribe active channels idempotently (never replays imperative commands)
      for (const [serverId, count] of this.subscriptions.entries()) {
        if (count > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ action: 'subscribe', serverId }));
        }
      }

      if (wasReconnect) {
        this.emit('reconnected', { timestamp: this.lastConnectedAt });
      }
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      try {
        const packet = JSON.parse(String(event.data)) as { event?: string; data?: unknown };
        if (packet && typeof packet.event === 'string') {
          this.emit(packet.event, packet.data);
        }
      } catch {
        // Ignore malformed non-JSON frames safely
      }
    };

    socket.onerror = () => {
      // Browser always follows onerror with onclose; avoid double scheduling here
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;

      if (this.manualDisconnect) {
        this.setState('disconnected');
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualDisconnect || this.reconnectTimer !== null) {
      return;
    }

    const delayMs = calculateBackoffDelay(this.reconnectAttempt, {
      baseDelayMs: this.options.baseDelayMs ?? 1000,
      maxDelayMs: this.options.maxDelayMs ?? 30000,
      jitterRatio: this.options.jitterRatio ?? 0.2,
      randomFn: this.options.randomFn,
    });

    this.reconnectAttempt += 1;
    this.nextRetryMs = delayMs;
    this.setState('reconnecting');

    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      this.nextRetryMs = null;
      if (!this.manualDisconnect) {
        this.connect();
      }
    }, delayMs);
  }

  private nextRequestId(): string {
    this.seq += 1;
    return `req-${Date.now()}-${this.seq}`;
  }

  public subscribeServer(serverId: string): void {
    const current = this.subscriptions.get(serverId) ?? 0;
    this.subscriptions.set(serverId, current + 1);
    if (current === 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'subscribe', serverId }));
    }
  }

  public unsubscribeServer(serverId: string): void {
    const current = this.subscriptions.get(serverId) ?? 0;
    if (current <= 1) {
      this.subscriptions.delete(serverId);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: 'unsubscribe', serverId }));
      }
    } else {
      this.subscriptions.set(serverId, current - 1);
    }
  }

  public sendStdin(serverId: string, data: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'stdin',
          serverId,
          data,
          requestId: this.nextRequestId(),
        })
      );
      return true;
    }
    return false;
  }

  public sendTerminalExec(serverId: string, command: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'terminal_exec',
          serverId,
          command,
          requestId: this.nextRequestId(),
        })
      );
      return true;
    }
    return false;
  }

  public sendTerminalKill(serverId: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'terminal_kill',
          serverId,
          requestId: this.nextRequestId(),
        })
      );
      return true;
    }
    return false;
  }

  public sendTerminalStdin(serverId: string, data: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          action: 'terminal_stdin',
          serverId,
          data,
          requestId: this.nextRequestId(),
        })
      );
      return true;
    }
    return false;
  }

  public on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const typedCallback = callback as EventCallback;
    this.listeners.get(event)!.add(typedCallback);
    return () => this.off(event, typedCallback);
  }

  public off(event: string, callback: EventCallback): void {
    const list = this.listeners.get(event);
    if (list) {
      list.delete(callback);
    }
  }

  private emit(event: string, data: unknown): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const cb of list) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[WebSocketClient] Listener error for '${event}':`, err);
      }
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    if (this.reconnectTimer !== null) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.nextRetryMs = null;
    this.reconnectAttempt = 0;

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
    }

    this.setState('disconnected');
  }
}

export const wsClient = new WebSocketClient();
