import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyServerStatusUpdate,
  canRestartServer,
  canStartServer,
  canStopServer,
  isServerTransitioning,
  isValidStatusTransition,
  reconcileServerList,
} from '../../src/utils/serverLifecycle';
import { fetchServers, WebSocketClient } from '../../src/services/api';
import { ApiError } from '../../src/utils/errors';
import type { ServerModel } from '../../src/types';

const sampleServer: ServerModel = {
  id: 'srv-10001-aabbccdd',
  name: 'Core API',
  description: 'Primary service',
  port: 3100,
  entry_file: 'index.js',
  start_script: 'start',
  status: 'running',
  auto_restart: 'on-failure',
  env_vars: { PORT: '3100' },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_exit_code: 0,
  metrics: {
    pid: 4321,
    status: 'running',
    uptime_sec: 120,
    memory_mb: 38.4,
    cpu_percent: 2.5,
  },
};

describe('Server lifecycle state machine & reconciliation', () => {
  it('validates allowed and disallowed status transitions', () => {
    expect(isValidStatusTransition('stopped', 'starting')).toBe(true);
    expect(isValidStatusTransition('starting', 'running')).toBe(true);
    expect(isValidStatusTransition('running', 'stopping')).toBe(true);
    expect(isValidStatusTransition('stopping', 'stopped')).toBe(true);
    expect(isValidStatusTransition('running', 'crashed')).toBe(true);

    expect(isValidStatusTransition('stopped', 'stopping')).toBe(false);
    expect(isValidStatusTransition('created', 'running')).toBe(false);
  });

  it('guards start/stop/restart actions when server is busy or in incompatible state', () => {
    expect(canStartServer('stopped')).toBe(true);
    expect(canStartServer('crashed')).toBe(true);
    expect(canStartServer('running')).toBe(false);
    expect(canStartServer('stopped', 'starting')).toBe(false);

    expect(canStopServer('running')).toBe(true);
    expect(canStopServer('stopped')).toBe(false);
    expect(canStopServer('running', 'stopping')).toBe(false);

    expect(canRestartServer('running')).toBe(true);
    expect(canRestartServer('stopped')).toBe(false);
    expect(canRestartServer('running', 'restarting')).toBe(false);

    expect(isServerTransitioning('starting')).toBe(true);
    expect(isServerTransitioning('running', 'stopping')).toBe(true);
    expect(isServerTransitioning('running')).toBe(false);
  });

  it('clears stale PID, RAM, CPU, and uptime immediately when transitioning out of running', () => {
    const stopped = applyServerStatusUpdate(sampleServer, 'stopped', 0);
    expect(stopped.status).toBe('stopped');
    expect(stopped.last_exit_code).toBe(0);
    expect(stopped.metrics?.pid).toBe(0);
    expect(stopped.metrics?.memory_mb).toBe(0);
    expect(stopped.metrics?.cpu_percent).toBe(0);
    expect(stopped.metrics?.uptime_sec).toBe(0);
  });

  it('never overwrites existing servers with null or non-array data', () => {
    const existing = [sampleServer];
    expect(reconcileServerList(existing, null)).toBe(existing);
    expect(reconcileServerList(existing, undefined)).toBe(existing);
    expect(reconcileServerList(existing, [])).toEqual([]);
  });
});

describe('API requestJson resilience (non-JSON errors & timeouts)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('converts non-JSON 502 HTML gateway errors into structured ApiError without SyntaxError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      })
    );

    await expect(fetchServers()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'NON_JSON_ERROR',
      retryable: true,
    });
  });

  it('parses structured backend error codes accurately', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: true,
          code: 'RATE_LIMITED',
          message: 'Too many requests',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    );

    try {
      await fetchServers();
      expect.unreachable('Should have thrown ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe('RATE_LIMITED');
      expect(apiErr.retryable).toBe(true);
    }
  });
});

class MockWebSocket {
  public static CONNECTING = 0;
  public static OPEN = 1;
  public static CLOSING = 2;
  public static CLOSED = 3;
  public static instances: MockWebSocket[] = [];

  public url: string;
  public readyState = MockWebSocket.CONNECTING;
  public sentMessages: string[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onerror: (() => void) | null = null;
  public onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public send(payload: string): void {
    this.sentMessages.push(payload);
  }

  public close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }

  public triggerOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  public triggerDrop(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('WebSocketClient controlled backoff, ref-counted subscriptions & zero-zombie cleanup', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    vi.useRealTimers();
  });

  it('reconnects with exponential backoff, re-subscribes active channels, and never replays imperative commands', () => {
    const client = new WebSocketClient({
      urlFactory: () => 'ws://127.0.0.1:3000/ws',
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      jitterRatio: 0,
    });

    const reconnectedEvents: unknown[] = [];
    client.on('reconnected', (ev) => reconnectedEvents.push(ev));

    client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.triggerOpen();
    expect(client.state).toBe('connected');

    // Ref-counted duplicate subscribe sends only 1 wire frame
    client.subscribeServer('srv-10001-aabbccdd');
    client.subscribeServer('srv-10001-aabbccdd');
    expect(firstSocket.sentMessages).toHaveLength(1);

    // Imperative terminal command sent once
    client.sendTerminalExec('srv-10001-aabbccdd', 'pwd');
    expect(firstSocket.sentMessages).toHaveLength(2);

    // Simulate network drop -> schedules reconnect in 1000ms
    firstSocket.triggerDrop();
    expect(client.state).toBe('reconnecting');
    expect(client.nextRetryMs).toBe(1000);

    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances).toHaveLength(2);
    const secondSocket = MockWebSocket.instances[1];

    // Second drop before open -> backoff doubles to 2000ms
    secondSocket.triggerDrop();
    expect(client.nextRetryMs).toBe(2000);

    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances).toHaveLength(3);
    const thirdSocket = MockWebSocket.instances[2];
    thirdSocket.triggerOpen();

    expect(client.state).toBe('connected');
    expect(reconnectedEvents).toHaveLength(1);

    // Only the idempotent subscribe action was sent on reconnect (never `pwd`)
    expect(thirdSocket.sentMessages).toEqual([
      JSON.stringify({ action: 'subscribe', serverId: 'srv-10001-aabbccdd' }),
    ]);

    // Unsubscribe once decrements ref count from 2 -> 1 (still subscribed)
    client.unsubscribeServer('srv-10001-aabbccdd');
    expect(thirdSocket.sentMessages).toHaveLength(1);

    // Second unsubscribe drops ref count to 0 and sends wire unsubscribe
    client.unsubscribeServer('srv-10001-aabbccdd');
    expect(thirdSocket.sentMessages).toHaveLength(2);

    client.disconnect();
  });

  it('cancels reconnect timers on manual disconnect() leaving zero zombie sockets (StrictMode regression)', () => {
    const client = new WebSocketClient({
      urlFactory: () => 'ws://127.0.0.1:3000/ws',
      baseDelayMs: 500,
      jitterRatio: 0,
    });

    client.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].triggerDrop();
    expect(client.state).toBe('reconnecting');

    // Manual disconnect during pending reconnect timer
    client.disconnect();
    expect(client.state).toBe('disconnected');

    // Advance 60 seconds -> zero new WebSocket instances should be created
    vi.advanceTimersByTime(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
