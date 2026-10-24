import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { DashboardView } from './components/DashboardView';
import { ServerListView } from './components/ServerListView';
import { CreateServerModal } from './components/CreateServerModal';
import { Alert, Button, ErrorBoundary, Skeleton, ToastViewport } from './components/ui';
import { JobProvider, useJobs } from './context/JobContext';
import { RunningJobsModal } from './components/RunningJobsModal';
import { LandingPageView } from './components/LandingPageView';
import { formatRoutePath, navigateTo, parseRoute, RouteState } from './utils/routing';

const ServerDetailView = lazy(() =>
  import('./components/ServerDetailView').then((m) => ({ default: m.ServerDetailView }))
);
const PackagesView = lazy(() =>
  import('./components/PackagesView').then((m) => ({ default: m.PackagesView }))
);
const DiagnosticsView = lazy(() =>
  import('./components/DiagnosticsView').then((m) => ({ default: m.DiagnosticsView }))
);
const ActivityLogsView = lazy(() =>
  import('./components/ActivityLogsView').then((m) => ({ default: m.ActivityLogsView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);

import {
  ActivityLog,
  ConnectionSnapshot,
  CreateServerPayload,
  EnvironmentInfo,
  PendingServerAction,
  ServerModel,
  ServerStatus,
  TabType,
  ToastItem,
} from './types';
import {
  createServer,
  deleteServer,
  fetchActivities,
  fetchRuntime,
  fetchServers,
  restartServer,
  startServer,
  stopServer,
  wsClient,
} from './services/api';
import { isAbortError, normalizeError } from './utils/errors';
import { applyServerStatusUpdate, reconcileServerList } from './utils/serverLifecycle';

export interface AppProps {
  initialPath?: string;
}

export default function App({ initialPath }: AppProps = {}) {
  const [currentRoute, setCurrentRoute] = useState<RouteState>(() => {
    if (initialPath) {
      return parseRoute(initialPath);
    }
    if (typeof window !== 'undefined') {
      return parseRoute(window.location.pathname);
    }
    return { view: 'landing', tab: 'dashboard', serverId: null, path: '/' };
  });

  const [runtime, setRuntime] = useState<EnvironmentInfo | null>(null);
  const [servers, setServers] = useState<ServerModel[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [connectionSnap, setConnectionSnap] = useState<ConnectionSnapshot>(() =>
    wsClient.getSnapshot()
  );
  const [pendingActions, setPendingActions] = useState<Record<string, PendingServerAction>>({});

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const syncSeqRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Sync route on popstate (browser back/forward or programmatic navigation)
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const parsed = parseRoute(window.location.pathname);
        setCurrentRoute(parsed);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const pushToast = useCallback(
    (
      title: string,
      variant: ToastItem['variant'] = 'success',
      description?: string
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, variant, description }]);
      globalThis.setTimeout(() => {
        if (mountedRef.current) {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Non-destructive state synchronization:
   * - Cancels superseded in-flight polls via AbortController
   * - Preserves last valid servers/runtime/activities on transient network or 5xx errors
   * - Surfaces explicit stale/offline warning instead of wiping UI to empty state
   */
  const syncAll = useCallback(async (opts: { silent?: boolean } = {}) => {
    const seq = ++syncSeqRef.current;

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortRef.current = controller;

    if (!opts.silent) {
      setIsRefreshing(true);
    }

    try {
      const [rtRes, srvRes, actRes] = await Promise.allSettled([
        fetchRuntime({ signal: controller.signal }),
        fetchServers({ signal: controller.signal }),
        fetchActivities({ signal: controller.signal }),
      ]);

      if (!mountedRef.current || seq !== syncSeqRef.current || controller.signal.aborted) {
        return;
      }

      if (rtRes.status === 'fulfilled') {
        setRuntime(rtRes.value);
      }

      if (actRes.status === 'fulfilled') {
        setActivities(actRes.value);
      }

      if (srvRes.status === 'fulfilled') {
        setServers((prev) => reconcileServerList(prev, srvRes.value));
        setIsStale(false);
        setSyncError(null);
        setLastSyncedAt(new Date().toISOString());
      } else if (!isAbortError(srvRes.reason)) {
        const normalized = normalizeError(srvRes.reason, 'Unable to reach panel backend');
        setIsStale(true);
        setSyncError(normalized.message);
      }
    } finally {
      if (mountedRef.current && seq === syncSeqRef.current) {
        setIsRefreshing(false);
        setInitialLoading(false);
      }
    }
  }, []);

  const isConsoleActive = currentRoute.view === 'console';

  // Only run active WebSocket connection and polling when user is in the console
  useEffect(() => {
    if (!isConsoleActive) {
      return;
    }

    mountedRef.current = true;
    const bootTimer = globalThis.setTimeout(() => {
      void syncAll({ silent: true });
    }, 0);

    wsClient.connect();

    const unsubConn = wsClient.on<{
      state: ConnectionSnapshot['state'];
      reconnectAttempt: number;
      nextRetryMs: number | null;
      lastConnectedAt: string | null;
    }>('connection', (data) => {
      if (!mountedRef.current) return;
      setConnectionSnap({
        state: data.state,
        reconnectAttempt: data.reconnectAttempt,
        nextRetryMs: data.nextRetryMs,
        lastConnectedAt: data.lastConnectedAt,
      });
    });

    const unsubStatus = wsClient.on<{
      server_id: string;
      new_status: ServerStatus;
      exit_code: number;
    }>('status', (data) => {
      if (!mountedRef.current || !data?.server_id) return;
      setServers((prev) =>
        prev.map((srv) =>
          srv.id === data.server_id
            ? applyServerStatusUpdate(srv, data.new_status, data.exit_code)
            : srv
        )
      );
    });

    const unsubReconnected = wsClient.on('reconnected', () => {
      if (!mountedRef.current) return;
      void syncAll({ silent: true });
    });

    const pollTimer = globalThis.setInterval(() => {
      void syncAll({ silent: true });
    }, 5000);

    return () => {
      mountedRef.current = false;
      globalThis.clearTimeout(bootTimer);
      globalThis.clearInterval(pollTimer);
      activeAbortRef.current?.abort();
      unsubConn();
      unsubStatus();
      unsubReconnected();
      wsClient.disconnect();
    };
  }, [isConsoleActive, syncAll]);

  const handleNavigateTab = useCallback((tab: TabType) => {
    const targetPath = formatRoutePath('console', tab, null);
    navigateTo(targetPath);
  }, []);

  const handleSelectServer = useCallback((serverId: string | null) => {
    const targetPath = formatRoutePath('console', 'servers', serverId);
    navigateTo(targetPath);
  }, []);

  const handleNavigateLanding = useCallback(() => {
    navigateTo('/');
  }, []);

  const setServerPending = useCallback((id: string, action?: PendingServerAction) => {
    setPendingActions((prev) => {
      if (!action) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: action };
    });
  }, []);

  const handleStartServer = useCallback(
    async (id: string) => {
      setServerPending(id, 'starting');
      try {
        await startServer(id);
        pushToast('Server started', 'success', 'Managed Node.js process is online.');
        await syncAll({ silent: true });
      } catch (err: unknown) {
        const normalized = normalizeError(err, 'Failed to start server');
        pushToast('Start failed', 'error', normalized.message);
      } finally {
        setServerPending(id, undefined);
      }
    },
    [pushToast, setServerPending, syncAll]
  );

  const handleStopServer = useCallback(
    async (id: string) => {
      setServerPending(id, 'stopping');
      try {
        await stopServer(id);
        pushToast('Server stopped', 'info', 'Process group terminated cleanly.');
        await syncAll({ silent: true });
      } catch (err: unknown) {
        const normalized = normalizeError(err, 'Failed to stop server');
        pushToast('Stop failed', 'error', normalized.message);
      } finally {
        setServerPending(id, undefined);
      }
    },
    [pushToast, setServerPending, syncAll]
  );

  const handleRestartServer = useCallback(
    async (id: string) => {
      setServerPending(id, 'restarting');
      try {
        await restartServer(id);
        pushToast('Server restarted', 'success', 'Clean process cycle completed.');
        await syncAll({ silent: true });
      } catch (err: unknown) {
        const normalized = normalizeError(err, 'Failed to restart server');
        pushToast('Restart failed', 'error', normalized.message);
      } finally {
        setServerPending(id, undefined);
      }
    },
    [pushToast, setServerPending, syncAll]
  );

  const handleDeleteServer = useCallback(
    async (id: string) => {
      setServerPending(id, 'deleting');
      try {
        await deleteServer(id);
        setServers((prev) => prev.filter((s) => s.id !== id));
        if (currentRoute.serverId === id) {
          handleSelectServer(null);
        }
        pushToast('Server deleted', 'success', 'Instance workspace and records removed.');
        await syncAll({ silent: true });
      } catch (err: unknown) {
        const normalized = normalizeError(err, 'Failed to delete server');
        pushToast('Delete failed', 'error', normalized.message);
      } finally {
        setServerPending(id, undefined);
      }
    },
    [currentRoute.serverId, handleSelectServer, pushToast, setServerPending, syncAll]
  );

  const handleCreateServer = useCallback(
    async (payload: CreateServerPayload) => {
      const created = await createServer(payload);
      setServers((prev) => reconcileServerList(prev, [...prev, created]));
      pushToast(`Created ${created.name}`, 'success', `Assigned port :${created.port}`);
      await syncAll({ silent: true });
      handleSelectServer(created.id);
    },
    [handleSelectServer, pushToast, syncAll]
  );

  const getCurrentFeatureName = (): string => {
    if (currentRoute.serverId) {
      const activeSrv = servers.find((s) => s.id === currentRoute.serverId);
      return activeSrv ? `servers / ${activeSrv.name}` : `servers / ${currentRoute.serverId}`;
    }
    switch (currentRoute.tab) {
      case 'dashboard':
        return 'overview';
      case 'servers':
        return 'servers';
      case 'packages':
        return 'packages';
      case 'diagnostics':
        return 'diagnostics';
      case 'activity':
        return 'activity';
      case 'settings':
        return 'settings';
      default:
        return 'overview';
    }
  };

  const activeServerSummary = currentRoute.serverId
    ? servers.find((s) => s.id === currentRoute.serverId) ?? null
    : null;

  if (currentRoute.view === 'landing') {
    return (
      <>
        <LandingPageView
          onStartNow={() => handleNavigateTab('dashboard')}
        />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <JobProvider activeServerId={currentRoute.serverId} onNotify={pushToast}>
      <AppContent
        currentTab={currentRoute.tab}
        setCurrentTab={handleNavigateTab}
        activeServerId={currentRoute.serverId}
        setActiveServerId={handleSelectServer}
        runtime={runtime}
        servers={servers}
        activities={activities}
        initialLoading={initialLoading}
        isRefreshing={isRefreshing}
        isStale={isStale}
        syncError={syncError}
        lastSyncedAt={lastSyncedAt}
        connectionSnap={connectionSnap}
        pendingActions={pendingActions}
        isCreateModalOpen={isCreateModalOpen}
        setIsCreateModalOpen={setIsCreateModalOpen}
        isMobileSidebarOpen={isMobileSidebarOpen}
        setIsMobileSidebarOpen={setIsMobileSidebarOpen}
        toasts={toasts}
        pushToast={pushToast}
        dismissToast={dismissToast}
        syncAll={syncAll}
        handleStartServer={handleStartServer}
        handleStopServer={handleStopServer}
        handleRestartServer={handleRestartServer}
        handleDeleteServer={handleDeleteServer}
        handleCreateServer={handleCreateServer}
        getCurrentFeatureName={getCurrentFeatureName}
        activeServerSummary={activeServerSummary}
        onNavigateLanding={handleNavigateLanding}
      />
    </JobProvider>
  );
}

interface AppContentProps {
  currentTab: TabType;
  setCurrentTab: (tab: TabType) => void;
  activeServerId: string | null;
  setActiveServerId: (id: string | null) => void;
  runtime: EnvironmentInfo | null;
  servers: ServerModel[];
  activities: ActivityLog[];
  initialLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;
  connectionSnap: ConnectionSnapshot;
  pendingActions: Record<string, PendingServerAction>;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  toasts: ToastItem[];
  pushToast: (title: string, variant?: ToastItem['variant'], description?: string) => void;
  dismissToast: (id: string) => void;
  syncAll: (opts?: { silent?: boolean }) => Promise<void>;
  handleStartServer: (serverId: string) => Promise<void>;
  handleStopServer: (serverId: string) => Promise<void>;
  handleRestartServer: (serverId: string) => Promise<void>;
  handleDeleteServer: (serverId: string) => Promise<void>;
  handleCreateServer: (payload: CreateServerPayload) => Promise<void>;
  getCurrentFeatureName: () => string;
  activeServerSummary: ServerModel | null;
  onNavigateLanding?: () => void;
}

function AppContent({
  currentTab,
  setCurrentTab,
  activeServerId,
  setActiveServerId,
  runtime,
  servers,
  activities,
  initialLoading,
  isRefreshing,
  isStale,
  syncError,
  lastSyncedAt,
  connectionSnap,
  pendingActions,
  isCreateModalOpen,
  setIsCreateModalOpen,
  isMobileSidebarOpen,
  setIsMobileSidebarOpen,
  toasts,
  pushToast,
  dismissToast,
  syncAll,
  handleStartServer,
  handleStopServer,
  handleRestartServer,
  handleDeleteServer,
  handleCreateServer,
  getCurrentFeatureName,
  activeServerSummary,
  onNavigateLanding,
}: AppContentProps) {
  const { isJobsModalOpen, closeJobsModal } = useJobs();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-[100dvh] h-[100dvh] bg-[#08090B] text-[#F3F5F8] flex flex-col overflow-hidden antialiased selection:bg-emerald-500/25 selection:text-emerald-200">
      <Navbar
        runtime={runtime}
        connectionState={connectionSnap.state}
        reconnectAttempt={connectionSnap.reconnectAttempt}
        isStale={isStale}
        lastSyncedAt={lastSyncedAt}
        onOpenCreate={() => setIsCreateModalOpen(true)}
        onRefresh={() => void syncAll()}
        isRefreshing={isRefreshing}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((v) => !v)}
        currentFeatureName={getCurrentFeatureName()}
        onNavigateLanding={onNavigateLanding}
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setActiveServerId(null);
            setCurrentTab(tab);
          }}
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={(id) => setActiveServerId(id)}
          onOpenCreate={() => setIsCreateModalOpen(true)}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
          onNavigateLanding={onNavigateLanding}
        />

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 pb-28 lg:pb-8">
          <div className="max-w-[1360px] mx-auto space-y-6">
            {isStale && syncError && (
              <Alert
                variant="warning"
                title="Showing cached state — backend synchronization delayed"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isRefreshing}
                    onClick={() => void syncAll()}
                  >
                    Retry Sync
                  </Button>
                }
              >
                {syncError}. Previously loaded server data remains preserved while reconnection continues.
              </Alert>
            )}

            <ErrorBoundary
              key={activeServerId ? `srv-${activeServerId}` : `tab-${currentTab}`}
              scopeName={getCurrentFeatureName()}
              onReset={() => void syncAll()}
            >
              <Suspense
                fallback={
                  <div className="space-y-4" aria-busy="true" aria-label="Loading view">
                    <Skeleton className="h-14 w-full rounded-xl" />
                    <Skeleton className="h-72 w-full rounded-xl" />
                  </div>
                }
              >
                {activeServerId ? (
                  <ServerDetailView
                    serverId={activeServerId}
                    initialServer={activeServerSummary}
                    pendingAction={pendingActions[activeServerId]}
                    onBack={() => setActiveServerId(null)}
                    onStart={handleStartServer}
                    onStop={handleStopServer}
                    onRestart={handleRestartServer}
                    onDelete={handleDeleteServer}
                    onNotify={pushToast}
                  />
                ) : currentTab === 'dashboard' ? (
                  <DashboardView
                    servers={servers}
                    runtime={runtime}
                    activities={activities}
                    initialLoading={initialLoading}
                    pendingActions={pendingActions}
                    onOpenCreate={() => setIsCreateModalOpen(true)}
                    onSelectServer={(id) => setActiveServerId(id)}
                    onStartServer={handleStartServer}
                    onStopServer={handleStopServer}
                    onRestartServer={handleRestartServer}
                    onDeleteServer={handleDeleteServer}
                    onNavigateTab={(tab) => setCurrentTab(tab)}
                  />
                ) : currentTab === 'servers' ? (
                  <ServerListView
                    servers={servers}
                    initialLoading={initialLoading}
                    pendingActions={pendingActions}
                    onOpenCreate={() => setIsCreateModalOpen(true)}
                    onSelectServer={(id) => setActiveServerId(id)}
                    onStartServer={handleStartServer}
                    onStopServer={handleStopServer}
                    onRestartServer={handleRestartServer}
                    onDeleteServer={handleDeleteServer}
                  />
                ) : currentTab === 'packages' ? (
                  <PackagesView runtime={runtime} onNotify={pushToast} />
                ) : currentTab === 'diagnostics' ? (
                  <DiagnosticsView
                    runtime={runtime}
                    isRefreshing={isRefreshing}
                    onRefresh={() => void syncAll()}
                  />
                ) : currentTab === 'activity' ? (
                  <ActivityLogsView
                    activities={activities}
                    isRefreshing={isRefreshing}
                    onRefresh={() => void syncAll()}
                    onSelectServer={(id) => setActiveServerId(id)}
                  />
                ) : (
                  <SettingsView runtime={runtime} />
                )}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <MobileBottomNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        servers={servers}
        activeServerId={activeServerId}
        onClearActiveServer={() => setActiveServerId(null)}
      />

      <CreateServerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateServer}
        onServerCreated={(serverId) => {
          void syncAll({ silent: true });
          setActiveServerId(serverId);
        }}
      />

      <RunningJobsModal
        isOpen={isJobsModalOpen}
        onClose={closeJobsModal}
        onSelectServer={(serverId) => setActiveServerId(serverId)}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
