import { TabType } from '../types';

export type AppView = 'landing' | 'console';

export interface RouteState {
  view: AppView;
  tab: TabType;
  serverId: string | null;
  path: string;
}

const TAB_PATH_MAP: Record<TabType, string> = {
  dashboard: '/overview',
  servers: '/servers',
  packages: '/packages',
  diagnostics: '/diagnostics',
  activity: '/activity',
  settings: '/settings',
};

const PATH_TAB_MAP: Record<string, TabType> = {
  '/overview': 'dashboard',
  '/dashboard': 'dashboard',
  '/servers': 'servers',
  '/packages': 'packages',
  '/diagnostics': 'diagnostics',
  '/activity': 'activity',
  '/settings': 'settings',
};

/**
 * Pure route parser for client-side pathname matching
 */
export function parseRoute(rawPath: string): RouteState {
  const cleanPath = (rawPath || '/').split('?')[0].split('#')[0] || '/';
  const normalized = cleanPath === '' ? '/' : cleanPath.replace(/\/+$/, '') || '/';

  if (normalized === '/') {
    return {
      view: 'landing',
      tab: 'dashboard',
      serverId: null,
      path: '/',
    };
  }

  // Check server detail route: /servers/:id
  const serverDetailMatch = normalized.match(/^\/servers\/([a-zA-Z0-9_-]+)$/);
  if (serverDetailMatch && serverDetailMatch[1]) {
    return {
      view: 'console',
      tab: 'servers',
      serverId: serverDetailMatch[1],
      path: normalized,
    };
  }

  // Check known console tabs
  const tab = PATH_TAB_MAP[normalized];
  if (tab) {
    return {
      view: 'console',
      tab,
      serverId: null,
      path: normalized,
    };
  }

  // Fallback for unknown routes inside console
  return {
    view: 'console',
    tab: 'dashboard',
    serverId: null,
    path: '/overview',
  };
}

/**
 * Formats canonical route path for target tab/server/view
 */
export function formatRoutePath(view: AppView, tab: TabType = 'dashboard', serverId: string | null = null): string {
  if (view === 'landing') {
    return '/';
  }
  if (serverId) {
    return `/servers/${encodeURIComponent(serverId)}`;
  }
  return TAB_PATH_MAP[tab] || '/overview';
}

/**
 * Perform client-side history navigation without full-page reload
 */
export function navigateTo(targetPath: string, replace = false): void {
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  if (currentPath === targetPath) return;

  if (replace) {
    window.history.replaceState({}, '', targetPath);
  } else {
    window.history.pushState({}, '', targetPath);
  }

  // Dispatch a popstate-like custom event so listeners update immediately
  window.dispatchEvent(new PopStateEvent('popstate'));
}
