import React from 'react';
import {
  Stethoscope,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  ShieldCheck,
  BatteryCharging,
} from 'lucide-react';
import { EnvironmentInfo } from '../types';

interface DiagnosticsViewProps {
  runtime: EnvironmentInfo | null;
  onRefresh: () => void;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ runtime, onRefresh }) => {
  if (!runtime) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center text-slate-500">
        Loading system diagnostics...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-emerald-400" />
            <span>Doctor & Runtime Diagnostics</span>
          </h2>
          <p className="text-xs text-slate-400">
            Real-time verification of host capabilities, kernel parameters, and environment limits
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold rounded-xl border border-white/[0.08]"
        >
          Re-run Doctor
        </button>
      </div>

      {/* Bento Grid for Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Primary Environment Card (Span 2) */}
        <div className="md:col-span-2 glass-panel glass-specular rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                DETECTED RUNTIME HOST
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">{runtime.type_name}</h3>
            </div>
            <span className="text-xs font-mono text-emerald-300">
              {runtime.type}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/30 p-4 rounded-xl border border-white/[0.04] font-mono text-xs">
            <div>
              <span className="text-slate-500 text-[10px] block">OS / ARCH</span>
              <span className="text-slate-200 font-semibold">{runtime.os} ({runtime.arch})</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">DISTRIBUTION</span>
              <span className="text-slate-200">{runtime.distro || 'Generic Linux'}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">PROOT ACTIVE</span>
              <span className={runtime.is_proot ? 'text-amber-400' : 'text-slate-400'}>
                {runtime.is_proot ? 'Yes (Emulated)' : 'False'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] block">PACKAGE MANAGER</span>
              <span className="text-emerald-400 font-semibold">{runtime.package_manager}</span>
            </div>
          </div>

          {runtime.prefix && (
            <div className="bg-black/30 p-3 rounded-xl border border-white/[0.04] text-xs font-mono">
              <span className="text-slate-500 text-[10px] block">SYSTEM PREFIX PATH</span>
              <code className="text-slate-300">{runtime.prefix}</code>
            </div>
          )}
        </div>

        {/* Battery & Stability Card (Span 1) */}
        <div className="glass-panel glass-specular rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-2">
              <BatteryCharging className="w-4 h-4" />
              <span>Background Power Guidelines</span>
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              Mobile systems suspend apps when entering deep sleep. Keep your node apps alive:
            </p>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4 font-mono">
              <li>Acquire wake-lock / keep-alive</li>
              <li>Set Battery: Unrestricted</li>
              <li>Enable background service auto-start</li>
            </ul>
          </div>
        </div>

        {/* Core Executables Bento Card (Span 2) */}
        <div className="md:col-span-2 glass-panel rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Installed Core Executables</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {['node', 'npm', 'git', 'sqlite3', 'python3', 'ffmpeg'].map((tool) => {
              const path = runtime.executables[tool];
              const isInstalled = Boolean(path);

              return (
                <div
                  key={tool}
                  className="flex items-center justify-between p-3 rounded-xl bg-black/25 border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {isInstalled ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="font-mono font-bold text-slate-200">{tool}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 truncate max-w-[200px]">
                    {path || 'Not installed'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Verified Capabilities (Span 1) */}
        <div className="glass-panel rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Host Capabilities</span>
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {runtime.capabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
