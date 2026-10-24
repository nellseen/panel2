import React from 'react';
import { Terminal, Cpu, RefreshCw, Plus, Menu } from 'lucide-react';
import { EnvironmentInfo } from '../types';

interface NavbarProps {
  runtime: EnvironmentInfo | null;
  wsConnected: boolean;
  onOpenCreate: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenDiagnostics: () => void;
  onToggleMobileSidebar: () => void;
  currentFeatureName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  runtime,
  wsConnected,
  onOpenCreate,
  onRefresh,
  isRefreshing,
  onOpenDiagnostics,
  onToggleMobileSidebar,
  currentFeatureName,
}) => {
  return (
    <header className="h-16 glass-panel glass-specular border-b border-white/[0.08] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Zone 1: Mobile Toggle + Brand Wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] lg:hidden transition-colors"
          title="Toggle Navigation Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <a href="/" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)] border border-white/20 transition-transform group-hover:scale-105">
            <Terminal className="w-4 h-4 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <span>Termux</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              NodePanel
            </span>
          </span>
        </a>
      </div>

      {/* Zone 2: Breadcrumb / Active Context Zone */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono">
        <span>system</span>
        <span aria-hidden="true">/</span>
        <span className="text-slate-200">{currentFeatureName || 'dashboard'}</span>
        {runtime && (
          <>
            <span aria-hidden="true">·</span>
            <button
              onClick={onOpenDiagnostics}
              className="text-slate-400 hover:text-emerald-400 transition-colors"
              title="Click to view doctor diagnostics"
            >
              {runtime.type_name}
            </button>
          </>
        )}
      </div>

      {/* Zone 3: Actions & Live Indicator */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* WebSocket Live Telemetry Indicator */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border border-white/[0.08] bg-white/[0.02]"
          title={wsConnected ? 'WebSocket live daemon connection active' : 'Connecting to daemon...'}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                : 'bg-rose-400'
            }`}
          />
          <span className="hidden sm:inline text-slate-300">{wsConnected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-50"
          title="Refresh servers & system state"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
        </button>

        {/* Primary Action Button */}
        <button
          onClick={onOpenCreate}
          className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold px-3.5 py-1.5 rounded-xl text-xs sm:text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Server</span>
        </button>
      </div>
    </header>
  );
};
