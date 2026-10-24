import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Button,
  ConfirmDialog,
  ConnectionStatus,
  ErrorBoundary,
  Modal,
  StatusPill,
  Tabs,
} from '../../src/components/ui';
import App from '../../src/App';

describe('Design System interactive & resilience primitives', () => {
  it('prevents duplicate submissions when Button is in loading state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <Button onClick={onClick} loading={false}>
        Deploy Instance
      </Button>
    );

    await user.click(screen.getByRole('button', { name: /deploy instance/i }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} loading={true}>
        Deploy Instance
      </Button>
    );

    const busyBtn = screen.getByRole('button', { name: /deploy instance/i });
    expect(busyBtn).toBeDisabled();
    expect(busyBtn).toHaveAttribute('aria-busy', 'true');

    await user.click(busyBtn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('handles Modal Escape key safely and blocks dismissal when preventClose is true', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    const { rerender } = render(
      <Modal isOpen={true} onClose={onClose} title="Create Instance">
        <p>Modal content</p>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: /create instance/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Modal isOpen={true} onClose={onClose} title="Create Instance" preventClose={true}>
        <p>Busy content</p>
      </Modal>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog does not trigger destructive callback until explicitly confirmed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        title="Delete Managed Server"
        description="This permanently removes workspace files."
        confirmLabel="Delete Permanently"
      />
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('supports WAI-ARIA Tabs keyboard navigation with ArrowRight and ArrowLeft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledTabs() {
      const [active, setActive] = React.useState('console');
      return (
        <Tabs
          value={active}
          onChange={(id) => {
            setActive(id);
            onChange(id);
          }}
          items={[
            { id: 'console', label: 'Console' },
            { id: 'terminal', label: 'Terminal' },
            { id: 'files', label: 'Files' },
          ]}
        />
      );
    }

    render(<ControlledTabs />);

    const consoleTab = screen.getByRole('tab', { name: 'Console' });
    consoleTab.focus();
    expect(consoleTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('terminal');
    expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('console');
  });

  it('renders semantic StatusPill and ConnectionStatus labels accurately', () => {
    render(
      <div>
        <StatusPill status="running" />
        <StatusPill status="stopped" />
        <StatusPill status="crashed" />
        <ConnectionStatus state="reconnecting" reconnectAttempt={2} isStale={false} />
        <ConnectionStatus state="connected" isStale={true} />
      </div>
    );

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('Crashed')).toBeInTheDocument();
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
    expect(screen.getByText(/Stale/i)).toBeInTheDocument();
  });

  it('isolates widget render crashes inside ErrorBoundary without unmounting sibling UI', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    function UnstableWidget() {
      if (shouldThrow) {
        throw new Error('Synthetic telemetry widget failure');
      }
      return <div>Recovered Telemetry Widget</div>;
    }

    render(
      <div>
        <div>Healthy Sibling Header</div>
        <ErrorBoundary scopeName="Telemetry Panel">
          <UnstableWidget />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByText('Healthy Sibling Header')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Component error isolated \(Telemetry Panel\)/i);

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Recovered Telemetry Widget')).toBeInTheDocument();

    spy.mockRestore();
  });
});

describe('Bug A Regression: App preserves last valid server data during transient backend 503 failure', () => {
  const originalFetch = globalThis.fetch;
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    class StubSocket {
      public static CONNECTING = 0;
      public static OPEN = 1;
      public static CLOSING = 2;
      public static CLOSED = 3;
      public readyState = 1;
      public onopen: (() => void) | null = null;
      public onmessage: ((ev: { data: string }) => void) | null = null;
      public onerror: (() => void) | null = null;
      public onclose: (() => void) | null = null;
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      public send(): void {}
      public close(): void {
        this.readyState = 3;
      }
    }
    globalThis.WebSocket = StubSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('retains rendered server cards and displays stale-data warning instead of wiping state on API failure', async () => {
    const user = userEvent.setup();
    let failServersEndpoint = false;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/runtime')) {
        return new Response(
          JSON.stringify({
            type: 'linux_generic',
            type_name: 'Linux (Debian)',
            os: 'linux',
            arch: 'x64',
            kernel: '6.6.0',
            hostname: 'test-host',
            distro: 'Debian',
            distro_version: '12',
            prefix: '',
            termux_version: '',
            is_proot: false,
            package_manager: 'apt-get',
            executables: { node: '/usr/bin/node', npm: '/usr/bin/npm', git: '/usr/bin/git' },
            capabilities: ['Node.js Process Supervision'],
            limitations: [],
            disk_free_mb: 12048,
            memory_total_mb: 8192,
            memory_free_mb: 4096,
            panel_port: 3000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/servers')) {
        if (failServersEndpoint) {
          return new Response(
            JSON.stringify({ error: true, code: 'UPSTREAM_UNAVAILABLE', message: 'Temporary 503 outage' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify([
            {
              id: 'srv-90001-11223344',
              name: 'Alpha Payment Service',
              description: 'Production gateway',
              port: 4100,
              entry_file: 'index.js',
              start_script: 'start',
              status: 'running',
              auto_restart: 'on-failure',
              env_vars: { PORT: '4100' },
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              last_exit_code: 0,
              metrics: {
                pid: 9912,
                status: 'running',
                uptime_sec: 320,
                memory_mb: 44.2,
                cpu_percent: 1.4,
              },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/activity')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<App initialPath="/overview" />);

    // 1. Verify initial render displays Alpha Payment Service card
    expect(await screen.findByTestId('server-card-srv-90001-11223344')).toBeInTheDocument();
    expect(screen.getAllByText('Alpha Payment Service').length).toBeGreaterThanOrEqual(1);

    // 2. Inject 503 outage on /api/servers and trigger manual sync
    failServersEndpoint = true;
    await user.click(screen.getByRole('button', { name: /refresh panel state/i }));

    // 3. Assert stale-data banner appears AND Alpha Payment Service card is STILL rendered (never wiped!)
    await waitFor(() => {
      expect(screen.getByText(/Showing cached state/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId('server-card-srv-90001-11223344')).toBeInTheDocument();
    expect(screen.queryByText(/No Node\.js instances configured/i)).not.toBeInTheDocument();
  });
});
