import React from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  Terminal,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Layers,
  ArrowRight,
  Plus,
  ShieldCheck,
  HardDrive,
} from 'lucide-react';
import { ServerModel, EnvironmentInfo, ActivityLog } from '../types';

interface DashboardViewProps {
  servers: ServerModel[];
  runtime: EnvironmentInfo | null;
  activities: ActivityLog[];
  onOpenCreate: () => void;
  onSelectServer: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onNavigateTab: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  servers,
  runtime,
  activities,
  onOpenCreate,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onNavigateTab,
}) => {
  const runningServers = servers.filter((s) => s.status === 'running');
  const stoppedServers = servers.filter((s) => s.status === 'stopped' || s.status === 'created');
  const crashedServers = servers.filter((s) => s.status === 'crashed' || s.status === 'failed');

  const totalRamUsed = runningServers.reduce(
    (acc, s) => acc + (s.metrics?.memory_mb || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Bento Grid Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Bento Tile 1 (Span 2 cols on lg): Supervisor Engine Hero */}
        <div className="lg:col-span-2 glass-panel glass-specular rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                <span>Native Supervisor State</span>
              </span>
              <span className="text-xs text-slate-400">
                Loopback: <code className="text-slate-200 font-mono">127.0.0.1:8080</code>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-mono">
                  ACTIVE NODES
                </span>
                <div className="text-3xl font-extrabold font-mono text-white tracking-tight tabular-nums mt-1">
                  {runningServers.length}
                  <span className="text-sm font-normal text-slate-400 ml-1">/ {servers.length}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-mono">
                  AGGREGATE RAM
                </span>
                <div className="text-3xl font-extrabold font-mono text-emerald-400 tracking-tight tabular-nums mt-1">
                  {totalRamUsed > 0 ? `${totalRamUsed.toFixed(1)}` : '0'}
                  <span className="text-sm font-normal text-slate-400 ml-1">MB</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-mono">
                  INCIDENTS
                </span>
                <div
                  className={`text-3xl font-extrabold font-mono tracking-tight tabular-nums mt-1 ${
                    crashedServers.length > 0 ? 'text-rose-400' : 'text-slate-300'
                  }`}
                >
                  {crashedServers.length}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span>Independent process tree with group signal management</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigateTab('servers')}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                Manage All
              </button>
              <button
                onClick={onOpenCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Create Instance</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bento Tile 2 (Span 1 col on lg): Host Environment Glass Card */}
        <div className="glass-panel glass-specular rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <span>Runtime Diagnostics</span>
              </span>
              <button
                onClick={() => onNavigateTab('diagnostics')}
                className="text-[11px] text-cyan-400 hover:underline"
              >
                Doctor
              </button>
            </div>

            <h3 className="text-base font-bold text-white mb-3">
              {runtime?.type_name || 'Generic Linux'}
            </h3>

            <div className="space-y-2 text-xs font-mono bg-black/20 p-3 rounded-xl border border-white/[0.04]">
              <div className="flex justify-between">
                <span className="text-slate-400">Architecture</span>
                <span className="text-slate-200">{runtime?.arch || 'amd64'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Package Manager</span>
                <span className="text-emerald-400 font-semibold">
                  {runtime?.package_manager || 'apt-get'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">PRoot Emulation</span>
                <span className="text-slate-200">{runtime?.is_proot ? 'Active' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">SQLite Engine</span>
                <span className="text-slate-200">WAL Persistent</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06] text-[11px] text-slate-400">
            Storage: <code className="text-slate-300">data/nodepanel.db</code>
          </div>
        </div>

        {/* Bento Tile 3 (Span 2 cols on lg): Live Deployments Grid */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-base">Node.js Applications</h3>
              <p className="text-xs text-slate-400">
                Direct lifecycle control and memory supervision
              </p>
            </div>

            <button
              onClick={() => onNavigateTab('servers')}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
            >
              <span>View all ({servers.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {servers.length === 0 ? (
            <div className="p-8 rounded-xl border border-dashed border-white/10 text-center bg-white/[0.01]">
              <Server className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className="text-xs text-slate-300 font-medium mb-1">No applications running</p>
              <p className="text-[11px] text-slate-400 mb-3">
                Deploy an Express REST API, Worker, or Git repo in seconds.
              </p>
              <button
                onClick={onOpenCreate}
                className="px-3.5 py-1.5 bg-emerald-500 text-slate-950 font-semibold text-xs rounded-xl shadow-md"
              >
                + Create Node Server
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {servers.slice(0, 4).map((srv) => {
                const isRunning = srv.status === 'running';

                return (
                  <div
                    key={srv.id}
                    className="glass-subtle glass-panel-hover rounded-xl p-4 flex flex-col justify-between space-y-3 cursor-pointer"
                    onClick={() => onSelectServer(srv.id)}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-bold text-sm text-white truncate hover:text-emerald-300 transition-colors">
                          {srv.name}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          :{srv.port}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 font-mono">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        <span className="capitalize">{srv.status}</span>
                        {srv.metrics && isRunning && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-400">
                              {srv.metrics.memory_mb.toFixed(1)} MB
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className="pt-2 border-t border-white/[0.06] flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onSelectServer(srv.id)}
                        className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 font-medium"
                      >
                        <Terminal className="w-3 h-3 text-cyan-400" />
                        <span>Console</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {isRunning ? (
                          <>
                            <button
                              onClick={() => onStopServer(srv.id)}
                              className="p-1 text-rose-400 hover:bg-rose-500/20 rounded-md transition-colors"
                              title="Stop"
                            >
                              <Square className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onRestartServer(srv.id)}
                              className="p-1 text-amber-400 hover:bg-amber-500/20 rounded-md transition-colors"
                              title="Restart"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onStartServer(srv.id)}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded-md transition-colors"
                            title="Start"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bento Tile 4 (Span 1 col on lg): System Toolchain Health */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold block mb-3">
              Toolchain Status
            </span>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-300">Node.js Engine</span>
                <span className="font-mono text-emerald-400">
                  {runtime?.executables?.node ? 'Ready' : 'Not Found'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-300">npm CLI</span>
                <span className="font-mono text-emerald-400">
                  {runtime?.executables?.npm ? 'Available' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-slate-300">Git Integration</span>
                <span className="font-mono text-emerald-400">
                  {runtime?.executables?.git ? 'Available' : 'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-300">SQLite Storage</span>
                <span className="font-mono text-emerald-400">Connected</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/[0.06]">
            <button
              onClick={() => onNavigateTab('packages')}
              className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-colors text-center"
            >
              Manage Packages
            </button>
          </div>
        </div>

        {/* Bento Tile 5 (Span 3 cols on lg): Recent Activity Audit Trail */}
        <div className="lg:col-span-3 glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>Audit & Execution Log</span>
            </h3>

            <button
              onClick={() => onNavigateTab('activity')}
              className="text-xs text-cyan-400 hover:underline font-medium"
            >
              Full timeline
            </button>
          </div>

          {activities.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">No operations recorded yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activities.slice(0, 6).map((act) => (
                <div
                  key={act.id}
                  className="bg-black/25 border border-white/[0.04] rounded-xl p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-200 truncate">
                      {act.action}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{act.details}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
