import React from 'react';
import { Terminal, RefreshCw, Plus } from 'lucide-react';
import { EnvironmentInfo } from '../types';

interface NavbarProps {
  runtime: EnvironmentInfo | null;
  wsConnected: boolean;
  onOpenCreate: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenDiagnostics: () => void;
  onToggleMobileSidebar?: () => void;
  currentFeatureName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  runtime,
  wsConnected,
  onOpenCreate,
  onRefresh,
  isRefreshing,
  onOpenDiagnostics,
}) => {
  return (
    <header className="h-14 glass-panel glass-specular border-b border-white/[0.08] px-3.5 flex items-center justify-between sticky top-0 z-30 w-full shrink-0">
      {/* Brand & Runtime Chip */}
      <div className="flex items-center gap-2 truncate">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.3)] border border-white/20 shrink-0">
          <Terminal className="w-4 h-4 text-slate-950 stroke-[2.5]" />
        </div>
        <div className="flex flex-col truncate">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-sm font-bold tracking-tight text-white">Node</span>
            <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              Panel
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono mt-0.5 truncate">
            <span className="text-emerald-400 font-semibold">{runtime?.type_name || 'System'}</span>
            <span>·</span>
            <span>Node {runtime?.executables?.node ? 'Active' : 'v22'}</span>
          </div>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* WebSocket Status Indicator */}
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border border-white/[0.08] bg-white/[0.03]"
          title={wsConnected ? 'WebSocket live' : 'Offline / Reconnecting'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                : 'bg-rose-400 animate-pulse'
            }`}
          />
          <span className="text-slate-300">{wsConnected ? 'Live' : 'Off'}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          title="Refresh state"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* New Server Primary Button */}
        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-2.5 py-1 rounded-lg text-xs shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Server</span>
        </button>
      </div>
    </header>
  );
};
