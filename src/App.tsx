import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, TabType } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { ServerListView } from './components/ServerListView';
import { ServerDetailView } from './components/ServerDetailView';
import { PackagesView } from './components/PackagesView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { ActivityLogsView } from './components/ActivityLogsView';
import { SettingsView } from './components/SettingsView';
import { CreateServerModal } from './components/CreateServerModal';
import { FloatingNavBar } from './components/FloatingNavBar';

import {
  ServerModel,
  EnvironmentInfo,
  ActivityLog,
  CreateServerPayload,
} from './types';
import {
  fetchRuntime,
  fetchServers,
  createServer,
  startServer,
  stopServer,
  restartServer,
  deleteServer,
  fetchActivities,
  wsClient,
} from './services/api';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const [runtime, setRuntime] = useState<EnvironmentInfo | null>(null);
  const [servers, setServers] = useState<ServerModel[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  const [wsConnected, setWsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const [rtData, srvData, actData] = await Promise.all([
        fetchRuntime().catch(() => null),
        fetchServers().catch(() => []),
        fetchActivities().catch(() => []),
      ]);

      if (rtData) setRuntime(rtData);
      setServers(srvData);
      setActivities(actData);
    } catch (err: any) {
      console.error('Failed to refresh data:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();

    wsClient.connect();

    const unsubConn = wsClient.on('connection', (data: any) => {
      setWsConnected(data.status === 'open');
    });

    const unsubStatus = wsClient.on('status', (data: any) => {
      setServers((prev) =>
        prev.map((s) =>
          s.id === data.server_id
            ? { ...s, status: data.new_status, last_exit_code: data.exit_code }
            : s
        )
      );
    });

    const interval = setInterval(() => {
      fetchServers().then(setServers).catch(() => {});
      fetchActivities().then(setActivities).catch(() => {});
    }, 5000);

    return () => {
      unsubConn();
      unsubStatus();
      clearInterval(interval);
      wsClient.disconnect();
    };
  }, [loadAll]);

  const handleStartServer = async (id: string) => {
    try {
      await startServer(id);
      showToast('Process start initiated', 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleStopServer = async (id: string) => {
    try {
      await stopServer(id);
      showToast('Stop signal sent', 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRestartServer = async (id: string) => {
    try {
      await restartServer(id);
      showToast('Restart sequence triggered', 'success');
      loadAll();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteServer = async (id: string) => {
    try {
      await deleteServer(id);
      showToast('Server deleted successfully', 'success');
      if (activeServerId === id) {
        setActiveServerId(null);
        setCurrentTab('servers');
      }
      loadAll();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateServer = async (payload: CreateServerPayload) => {
    const created = await createServer(payload);
    showToast(`Created server ${created.name}`, 'success');
    await loadAll();
    setActiveServerId(created.id);
  };

  const getCurrentFeatureName = () => {
    if (activeServerId) {
      const activeSrv = servers.find((s) => s.id === activeServerId);
      return activeSrv ? `servers / ${activeSrv.name}` : 'server details';
    }
    switch (currentTab) {
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
        return 'dashboard';
    }
  };

  return (
    <div className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-slate-950 text-slate-100 flex justify-center font-sans antialiased relative selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Ambient Mobile Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-emerald-500/[0.07] blur-[100px]" />
        <div className="absolute top-[40%] left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-cyan-500/[0.06] blur-[110px]" />
      </div>

      {/* Strict Mobile Canvas Container (Tailored for Mobile Phone Viewport) */}
      <div className="w-full max-w-md mx-auto h-[100dvh] max-h-[100dvh] flex flex-col bg-slate-950/90 backdrop-blur-xl border-x border-white/[0.08] shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* Toast Notification */}
        {toast && (
          <div className="fixed top-16 inset-x-0 max-w-sm mx-auto px-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`px-3.5 py-2 rounded-xl shadow-2xl text-xs font-semibold border backdrop-blur-xl flex items-center justify-center gap-2 ${
                toast.type === 'error'
                  ? 'bg-rose-950/95 text-rose-200 border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                  : 'bg-emerald-950/95 text-emerald-200 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
              }`}
            >
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        {/* Top Navbar - Fixed Anchor */}
        <Navbar
          runtime={runtime}
          wsConnected={wsConnected}
          onOpenCreate={() => setIsCreateModalOpen(true)}
          onRefresh={loadAll}
          isRefreshing={isRefreshing}
          onOpenDiagnostics={() => {
            setActiveServerId(null);
            setCurrentTab('diagnostics');
          }}
          currentFeatureName={getCurrentFeatureName()}
        />

        {/* Mobile Viewport Main Body (with safe bottom padding for FloatingNavBar) */}
        <main className="flex-1 px-3 py-3.5 pb-28 overflow-y-auto overscroll-y-contain">
          {activeServerId ? (
            <ServerDetailView
              serverId={activeServerId}
              onBack={() => {
                setActiveServerId(null);
                setCurrentTab('servers');
              }}
              onStart={handleStartServer}
              onStop={handleStopServer}
              onRestart={handleRestartServer}
              onDelete={handleDeleteServer}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <DashboardView
                  servers={servers}
                  runtime={runtime}
                  activities={activities}
                  onOpenCreate={() => setIsCreateModalOpen(true)}
                  onSelectServer={(id) => setActiveServerId(id)}
                  onStartServer={handleStartServer}
                  onStopServer={handleStopServer}
                  onRestartServer={handleRestartServer}
                  onNavigateTab={(tab) => {
                    setActiveServerId(null);
                    setCurrentTab(tab);
                  }}
                />
              )}

              {currentTab === 'servers' && (
                <ServerListView
                  servers={servers}
                  onOpenCreate={() => setIsCreateModalOpen(true)}
                  onSelectServer={(id) => setActiveServerId(id)}
                  onStartServer={handleStartServer}
                  onStopServer={handleStopServer}
                  onRestartServer={handleRestartServer}
                  onDeleteServer={handleDeleteServer}
                />
              )}

              {currentTab === 'packages' && <PackagesView runtime={runtime} />}

              {currentTab === 'diagnostics' && (
                <DiagnosticsView runtime={runtime} onRefresh={loadAll} />
              )}

              {currentTab === 'activity' && (
                <ActivityLogsView activities={activities} onRefresh={loadAll} />
              )}

              {currentTab === 'settings' && <SettingsView runtime={runtime} />}
            </>
          )}
        </main>

        {/* Custom Floating Navigation Bar */}
        <FloatingNavBar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setActiveServerId(null);
            setCurrentTab(tab);
          }}
          servers={servers}
          activeServerId={activeServerId}
          onClearActiveServer={() => setActiveServerId(null)}
          onOpenCreate={() => setIsCreateModalOpen(true)}
        />
      </div>

      {/* Create Server Modal (Responsive centered) */}
      <CreateServerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateServer}
        onServerCreated={(newId) => {
          loadAll();
          setActiveServerId(newId);
        }}
      />
    </div>
  );
}
