import React from 'react';
import {
  LayoutDashboard,
  Server,
  Package,
  Activity,
  Stethoscope,
  Settings,
  Plus,
  Play,
  Square,
  Terminal,
  Cpu,
  ChevronRight,
  ShieldCheck,
  FolderTree,
} from 'lucide-react';
import { ServerModel } from '../types';

export type TabType = 'dashboard' | 'servers' | 'packages' | 'diagnostics' | 'activity' | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onOpenCreate: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreate,
  isOpenMobile,
  onCloseMobile,
}) => {
  const runningCount = servers.filter((s) => s.status === 'running').length;

  const navItems = [
    {
      id: 'dashboard' as TabType,
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'servers' as TabType,
      label: 'All Servers',
      icon: Server,
      count: servers.length,
      activeCount: runningCount,
    },
    {
      id: 'packages' as TabType,
      label: 'System Packages',
      icon: Package,
    },
    {
      id: 'diagnostics' as TabType,
      label: 'Doctor & Runtime',
      icon: Stethoscope,
    },
    {
      id: 'activity' as TabType,
      label: 'Activity Logs',
      icon: Activity,
    },
    {
      id: 'settings' as TabType,
      label: 'Panel Settings',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar Glass Pane */}
      <aside
        className={`fixed lg:static top-16 bottom-0 left-0 z-40 w-72 shrink-0 glass-panel border-r border-white/[0.08] flex flex-col justify-between transition-transform duration-300 ease-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Main Navigation Section */}
          <div>
            <div className="px-2 pb-2 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Platform Features
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isSelected = !activeServerId && currentTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                      isSelected
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isSelected ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    {item.count !== undefined && (
                      <span className="text-[10px] font-mono tabular-nums text-slate-400">
                        {item.activeCount}/{item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Persistent Quick Server Switcher (Available across every feature!) */}
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Server className="w-3 h-3 text-cyan-400" />
                <span>Managed Servers</span>
              </span>
              <button
                onClick={() => {
                  onOpenCreate();
                  if (onCloseMobile) onCloseMobile();
                }}
                className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors"
                title="Create Server Instance"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {servers.length === 0 ? (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                <p className="text-[11px] text-slate-400 mb-2">No servers created yet</p>
                <button
                  onClick={onOpenCreate}
                  className="w-full py-1.5 px-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition-all"
                >
                  + Add Node Server
                </button>
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {servers.map((srv) => {
                  const isCurrent = activeServerId === srv.id;
                  const isRunning = srv.status === 'running';

                  return (
                    <button
                      key={srv.id}
                      onClick={() => {
                        onSelectServer(srv.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all group ${
                        isCurrent
                          ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)] font-semibold'
                          : 'text-slate-300 hover:bg-white/[0.03] hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isRunning
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                              : srv.status === 'crashed'
                              ? 'bg-rose-400'
                              : 'bg-slate-500'
                          }`}
                        />
                        <span className="text-xs truncate">{srv.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono text-slate-400">
                        <span>:{srv.port}</span>
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer: Supervisor & SQLite Status */}
        <div className="p-3 m-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Supervisor Daemon</span>
            </span>
            <span className="text-[10px] font-mono text-emerald-400">Active</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Lightweight process supervisor with SQLite storage.
          </p>
        </div>
      </aside>
    </>
  );
};
