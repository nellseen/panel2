import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Server,
  Plus,
  Stethoscope,
  Activity,
  Package,
  Settings,
  ChevronUp,
  X,
  Radio,
  Layers,
} from 'lucide-react';
import { TabType } from './Sidebar';
import { ServerModel } from '../types';

interface FloatingNavBarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onClearActiveServer: () => void;
  onOpenCreate: () => void;
}

export const FloatingNavBar: React.FC<FloatingNavBarProps> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onClearActiveServer,
  onOpenCreate,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const runningCount = servers.filter((s) => s.status === 'running').length;
  const isMoreActive = !activeServerId && (currentTab === 'packages' || currentTab === 'settings');

  // Close "more" popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMoreOpen]);

  const handleTabClick = (tab: TabType) => {
    onClearActiveServer();
    onSelectTab(tab);
    setIsMoreOpen(false);
  };

  return (
    <nav
      aria-label="Floating Navigation Bar"
      className="fixed bottom-3 inset-x-0 z-40 max-w-md mx-auto px-3 pointer-events-none select-none"
    >
      {/* "More" Extended Menu Popover (Packages & Settings) */}
      {isMoreOpen && (
        <div
          ref={moreRef}
          className="pointer-events-auto mb-2 mx-auto max-w-xs bg-slate-900/95 backdrop-blur-2xl border border-white/12 rounded-2xl p-2 shadow-[0_10px_30px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.12)] animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center justify-between px-2.5 py-1 mb-1 border-b border-white/[0.06]">
            <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Additional Tools
            </span>
            <button
              onClick={() => setIsMoreOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06]"
              aria-label="Close extended menu"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleTabClick('packages')}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${
                !activeServerId && currentTab === 'packages'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Package className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold">Packages</span>
                <span className="text-[10px] text-slate-400 truncate">Node / PM2 / Git</span>
              </div>
            </button>

            <button
              onClick={() => handleTabClick('settings')}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all ${
                !activeServerId && currentTab === 'settings'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold">Settings</span>
                <span className="text-[10px] text-slate-400 truncate">Config & Ports</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Main Floating Capsule Dock */}
      <div className="pointer-events-auto bg-slate-950/90 backdrop-blur-2xl border border-white/12 shadow-[0_16px_40px_rgba(0,0,0,0.75),inset_0_1px_0_0_rgba(255,255,255,0.12)] rounded-2xl p-1.5 flex items-center justify-between gap-1 relative">
        {/* Specular Edge Glow */}
        <div className="absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent pointer-events-none" />

        {/* Tab: Dashboard / Home */}
        <button
          onClick={() => handleTabClick('dashboard')}
          aria-label="Dashboard overview"
          className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 ${
            !activeServerId && currentTab === 'dashboard'
              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <LayoutDashboard
            className={`w-4 h-4 transition-transform ${
              !activeServerId && currentTab === 'dashboard'
                ? 'text-emerald-400 stroke-[2.5] scale-110'
                : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Home</span>
          {!activeServerId && currentTab === 'dashboard' && (
            <span className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-1 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          )}
        </button>

        {/* Tab: Servers */}
        <button
          onClick={() => handleTabClick('servers')}
          aria-label="Server instances"
          className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 ${
            !activeServerId && currentTab === 'servers'
              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <div className="relative">
            <Server
              className={`w-4 h-4 transition-transform ${
                !activeServerId && currentTab === 'servers'
                  ? 'text-emerald-400 stroke-[2.5] scale-110'
                : 'text-slate-400'
              }`}
            />
            {servers.length > 0 && (
              <span
                className={`absolute -top-1 -right-3 text-[9px] font-mono px-1 rounded-full border leading-tight font-bold ${
                  runningCount > 0
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}
              >
                {runningCount}/{servers.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Servers</span>
          {!activeServerId && currentTab === 'servers' && (
            <span className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-1 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          )}
        </button>

        {/* Center Floating Quick Action: Add Server */}
        <div className="px-0.5 shrink-0">
          <button
            onClick={onOpenCreate}
            aria-label="Create new Node server"
            title="Create New Server"
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 font-bold flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.45),inset_0_1px_0_0_rgba(255,255,255,0.4)] border border-white/30 transition-all duration-200 active:scale-90 hover:scale-105 group"
          >
            <Plus className="w-5 h-5 stroke-[2.8] transition-transform duration-200 group-hover:rotate-90 text-slate-950" />
          </button>
        </div>

        {/* Tab: Doctor / Diagnostics */}
        <button
          onClick={() => handleTabClick('diagnostics')}
          aria-label="System Diagnostics Doctor"
          className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 ${
            !activeServerId && currentTab === 'diagnostics'
              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Stethoscope
            className={`w-4 h-4 transition-transform ${
              !activeServerId && currentTab === 'diagnostics'
                ? 'text-emerald-400 stroke-[2.5] scale-110'
                : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Doctor</span>
          {!activeServerId && currentTab === 'diagnostics' && (
            <span className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-1 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          )}
        </button>

        {/* Tab: Activity / Logs */}
        <button
          onClick={() => handleTabClick('activity')}
          aria-label="Process activity logs"
          className={`flex-1 min-h-[46px] flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative active:scale-95 ${
            !activeServerId && currentTab === 'activity'
              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Activity
            className={`w-4 h-4 transition-transform ${
              !activeServerId && currentTab === 'activity'
                ? 'text-emerald-400 stroke-[2.5] scale-110'
                : 'text-slate-400'
            }`}
          />
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">Logs</span>
          {!activeServerId && currentTab === 'activity' && (
            <span className="w-1 h-1 rounded-full bg-emerald-400 absolute bottom-1 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          )}
        </button>

        {/* "More" Trigger for Packages & Settings */}
        <button
          onClick={() => setIsMoreOpen(!isMoreOpen)}
          aria-label="More navigation options"
          aria-expanded={isMoreOpen}
          className={`w-10 min-h-[46px] flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 relative active:scale-95 ${
            isMoreActive || isMoreOpen
              ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="text-[10px] mt-0.5 tracking-tight font-medium">More</span>
          {isMoreActive && (
            <span className="w-1 h-1 rounded-full bg-cyan-400 absolute bottom-1 shadow-[0_0_6px_rgba(6,182,212,0.9)]" />
          )}
        </button>
      </div>
    </nav>
  );
};
