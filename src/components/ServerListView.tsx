import React, { useState } from 'react';
import {
  Server,
  Play,
  Square,
  RotateCw,
  Terminal,
  Trash2,
  Search,
  Plus,
  Cpu,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ServerModel } from '../types';

interface ServerListViewProps {
  servers: ServerModel[];
  onOpenCreate: () => void;
  onSelectServer: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
}

export const ServerListView: React.FC<ServerListViewProps> = ({
  servers,
  onOpenCreate,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'running' | 'stopped' | 'crashed'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredServers = servers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.port.toString().includes(search);

    if (!matchesSearch) return false;

    if (filter === 'running') return s.status === 'running';
    if (filter === 'stopped') return s.status === 'stopped' || s.status === 'created';
    if (filter === 'crashed') return s.status === 'crashed' || s.status === 'failed';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Applications & Instances</h2>
          <p className="text-xs text-slate-400">
            Node.js server management with process group isolation
          </p>
        </div>

        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Server</span>
        </button>
      </div>

      {/* Filter and Search Bar Glass Box */}
      <div className="glass-panel rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, or port..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950/60 border border-white/[0.08] rounded-xl pl-10 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-400/50 transition-colors"
          />
        </div>

        {/* Clean Segmented Filter Controls */}
        <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-white/[0.04]">
          {(['all', 'running', 'stopped', 'crashed'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === mode
                  ? 'bg-white/10 text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Bento Grid of Servers */}
      {filteredServers.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center">
          <Server className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">No applications matched</h3>
          <p className="text-xs text-slate-400 mb-4">
            Try adjusting your search criteria or deploy a new Node.js server.
          </p>
          <button
            onClick={onOpenCreate}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs"
          >
            Create New Server
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServers.map((srv) => {
            const isRunning = srv.status === 'running';

            return (
              <div
                key={srv.id}
                className="glass-panel glass-specular glass-panel-hover rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="space-y-0.5">
                      <h3
                        onClick={() => onSelectServer(srv.id)}
                        className="font-bold text-white hover:text-emerald-300 transition-colors cursor-pointer text-base line-clamp-1"
                      >
                        {srv.name}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-400">{srv.id}</div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-xs font-semibold text-slate-200">
                        :{srv.port}
                      </span>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-500'
                          }`}
                        />
                        <span className="text-[10px] text-slate-400 font-mono capitalize">
                          {srv.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 min-h-[32px]">
                    {srv.description || 'Independent Node.js service.'}
                  </p>

                  {/* Clean Spec Metrics (No Nested Cards) */}
                  <div className="py-2.5 px-3 rounded-xl bg-black/25 border border-white/[0.04] grid grid-cols-2 gap-2 text-xs font-mono mb-2">
                    <div>
                      <span className="text-slate-500 text-[10px] block">MEMORY (RSS)</span>
                      <span className={isRunning ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                        {srv.metrics && srv.metrics.memory_mb > 0
                          ? `${srv.metrics.memory_mb.toFixed(1)} MB`
                          : isRunning
                          ? 'Active'
                          : '-'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[10px] block">PID / EXIT</span>
                      <span className="text-slate-200">
                        {isRunning ? `PID ${srv.metrics?.pid || 'Active'}` : `Exit ${srv.last_exit_code}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isRunning ? (
                      <>
                        <button
                          onClick={() => onStopServer(srv.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                        <button
                          onClick={() => onRestartServer(srv.id)}
                          className="p-1.5 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-xs transition-colors"
                          title="Restart"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onStartServer(srv.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start</span>
                      </button>
                    )}

                    <button
                      onClick={() => onSelectServer(srv.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-slate-200 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] rounded-xl text-xs transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Console</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setDeletingId(srv.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Delete Server"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel border border-white/20 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h4 className="font-bold text-white text-base">Delete Server Instance?</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              This terminates the process and permanently removes the server directory and database records. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-3.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deletingId) {
                    onDeleteServer(deletingId);
                    setDeletingId(null);
                  }
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
