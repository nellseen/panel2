import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPageView } from '../../src/components/LandingPageView';
import { getAboutConfig } from '../../src/config/about';
import { formatRoutePath, parseRoute } from '../../src/utils/routing';
import App from '../../src/App';

describe('Landing Page & Routing Unit Verification', () => {
  describe('Route Parser & Formatter', () => {
    it('correctly maps root URL to landing view', () => {
      expect(parseRoute('/')).toEqual({
        view: 'landing',
        tab: 'dashboard',
        serverId: null,
        path: '/',
      });
      expect(parseRoute('')).toEqual({
        view: 'landing',
        tab: 'dashboard',
        serverId: null,
        path: '/',
      });
    });

    it('correctly maps console tabs to console view', () => {
      expect(parseRoute('/overview')).toEqual({
        view: 'console',
        tab: 'dashboard',
        serverId: null,
        path: '/overview',
      });
      expect(parseRoute('/servers')).toEqual({
        view: 'console',
        tab: 'servers',
        serverId: null,
        path: '/servers',
      });
      expect(parseRoute('/packages')).toEqual({
        view: 'console',
        tab: 'packages',
        serverId: null,
        path: '/packages',
      });
      expect(parseRoute('/diagnostics')).toEqual({
        view: 'console',
        tab: 'diagnostics',
        serverId: null,
        path: '/diagnostics',
      });
      expect(parseRoute('/activity')).toEqual({
        view: 'console',
        tab: 'activity',
        serverId: null,
        path: '/activity',
      });
      expect(parseRoute('/settings')).toEqual({
        view: 'console',
        tab: 'settings',
        serverId: null,
        path: '/settings',
      });
    });

    it('correctly identifies server detail route with serverId', () => {
      expect(parseRoute('/servers/srv-12345-abcde')).toEqual({
        view: 'console',
        tab: 'servers',
        serverId: 'srv-12345-abcde',
        path: '/servers/srv-12345-abcde',
      });
    });

    it('formats canonical route paths correctly', () => {
      expect(formatRoutePath('landing')).toBe('/');
      expect(formatRoutePath('console', 'dashboard')).toBe('/overview');
      expect(formatRoutePath('console', 'servers')).toBe('/servers');
      expect(formatRoutePath('console', 'servers', 'srv-test')).toBe('/servers/srv-test');
      expect(formatRoutePath('console', 'packages')).toBe('/packages');
    });
  });

  describe('Author & Credits Configuration', () => {
    it('returns default author and repository config when env is empty', () => {
      const config = getAboutConfig({});
      expect(config.authorName).toBe('nellseen');
      expect(config.repositoryUrl).toBe('https://github.com/nellseen/panel2');
      expect(config.license).toBe('MIT License');
      expect(config.fallbackNote).toBe('Built with care for developers.');
    });

    it('respects VITE_APP_AUTHOR and custom repository URL overrides', () => {
      const config = getAboutConfig({
        VITE_APP_AUTHOR: 'Alice Engineer',
        VITE_APP_AUTHOR_URL: 'https://alice.dev',
        VITE_APP_REPOSITORY_URL: 'https://github.com/alice/custom-nodepanel',
      });
      expect(config.authorName).toBe('Alice Engineer');
      expect(config.authorUrl).toBe('https://alice.dev');
      expect(config.repositoryUrl).toBe('https://github.com/alice/custom-nodepanel');
    });

    it('handles blank/whitespace env gracefully with neutral fallbacks', () => {
      const config = getAboutConfig({
        VITE_APP_AUTHOR: '   ',
        VITE_APP_AUTHOR_URL: '',
        VITE_APP_REPOSITORY_URL: '',
      });
      expect(config.authorName).toBe('nellseen');
      expect(config.repositoryUrl).toBe('https://github.com/nellseen/panel2');
    });
  });

  describe('LandingPageView Component', () => {
    it('renders hero headline, product description, and CTA buttons', () => {
      const onStartNow = vi.fn();
      render(<LandingPageView onStartNow={onStartNow} />);

      // Hero identity
      expect(
        screen.getByRole('heading', {
          name: /Your Servers\. One Powerful Control Panel\./i,
          level: 1,
        })
      ).toBeVisible();

      // Indonesian description
      expect(
        screen.getByText(
          /Kelola server Node\.js, pantau proses realtime, jalankan command terminal/i
        )
      ).toBeVisible();

      // CTA Buttons
      const startButtons = screen.getAllByRole('button', { name: /Mulai Sekarang/i });
      expect(startButtons.length).toBeGreaterThanOrEqual(1);

      // Section titles
      expect(screen.getByText(/01\. Tentang Project/i)).toBeInTheDocument();
      expect(screen.getByText(/02\. Fitur Utama/i)).toBeInTheDocument();
      expect(screen.getByText(/03\. Arsitektur Teknis/i)).toBeInTheDocument();
      expect(screen.getByText(/04\. Dibuat Oleh & Kredit/i)).toBeInTheDocument();
    });

    it('calls onStartNow callback when Mulai Sekarang is clicked', async () => {
      const user = userEvent.setup();
      const onStartNow = vi.fn();
      render(<LandingPageView onStartNow={onStartNow} />);

      const heroStartBtn = screen.getAllByRole('button', { name: /Mulai Sekarang/i })[0];
      await user.click(heroStartBtn);

      expect(onStartNow).toHaveBeenCalledTimes(1);
    });

    it('switches preview tabs interactively (Logs, Metrics, Supervisor)', async () => {
      const user = userEvent.setup();
      render(<LandingPageView onStartNow={vi.fn()} />);

      // Initial tab is Logs
      expect(screen.getByText(/Express Server listening on http:\/\/0\.0\.0\.0:3400/i)).toBeInTheDocument();

      // Switch to Metrics
      await user.click(screen.getByRole('button', { name: /Metrics/i }));
      expect(screen.getByText(/Resident Memory \(RSS\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Differential clock ticks/i)).toBeInTheDocument();

      // Switch to Supervisor
      await user.click(screen.getByRole('button', { name: /Supervisor/i }));
      expect(screen.getByText(/NodePanel Supervisor Daemon/i)).toBeInTheDocument();
      expect(screen.getByText(/killProcessTree\(child, SIGTERM\)/i)).toBeInTheDocument();
    });

    it('renders the top announcement banner and platform showcase banner, and top banner can be dismissed', async () => {
      const user = userEvent.setup();
      render(<LandingPageView onStartNow={vi.fn()} />);

      // Announcement banner is visible initially
      expect(screen.getByText(/NodePanel v1\.0 Siap Digunakan/i)).toBeInTheDocument();
      expect(screen.getByText(/Termux & Proot Native/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Zero Zombie Processes/i).length).toBeGreaterThanOrEqual(1);

      // Dismiss top announcement banner
      const dismissBtn = screen.getByRole('button', { name: /Tutup pengumuman/i });
      await user.click(dismissBtn);

      expect(screen.queryByText(/NodePanel v1\.0 Siap Digunakan/i)).not.toBeInTheDocument();
    });
  });

  describe('Full Application Flow with Root Landing Page & Routing', () => {
    const originalFetch = globalThis.fetch;
    const OriginalWebSocket = globalThis.WebSocket;

    beforeEach(() => {
      class StubSocket {
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
      window.history.replaceState({}, '', '/');
    });

    it('renders Landing Page at root URL "/" with zero API dependencies, even when API is completely down (503)', async () => {
      // Inject failure on all API endpoints
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: true, message: 'Total server outage' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      render(<App initialPath="/" />);

      // Landing page renders cleanly with zero crash
      expect(
        screen.getByRole('heading', {
          name: /Your Servers\. One Powerful Control Panel\./i,
          level: 1,
        })
      ).toBeVisible();

      // No stale error banner on landing page
      expect(screen.queryByText(/Showing cached state/i)).not.toBeInTheDocument();
    });

    it('navigates from Landing Page to Dashboard Overview when "Mulai Sekarang" is clicked', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/servers')) {
          return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.endsWith('/api/runtime')) {
          return new Response(JSON.stringify({
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
            executables: { node: '/usr/bin/node', npm: '/usr/bin/npm' },
            capabilities: [],
            limitations: [],
            disk_free_mb: 1024,
            memory_total_mb: 4096,
            memory_free_mb: 2048,
            panel_port: 3000,
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      render(<App initialPath="/" />);

      // 1. Initial state is Landing Page
      expect(screen.getByRole('heading', { name: /Your Servers\. One Powerful Control Panel\./i })).toBeVisible();

      // 2. Click Mulai Sekarang
      const startBtn = screen.getAllByRole('button', { name: /Mulai Sekarang/i })[0];
      await user.click(startBtn);

      // 3. Overview console appears
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
      });
    });

    it('supports direct URL access to /overview', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      render(<App initialPath="/overview" />);

      // Directly renders Overview console
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
      });
    });
  });
});
