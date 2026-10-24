import React from 'react';
import { Settings, Shield, HardDrive, Cpu } from 'lucide-react';
import { EnvironmentInfo } from '../types';

interface SettingsViewProps {
  runtime: EnvironmentInfo | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ runtime }) => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-400" />
          <span>Panel Configuration & Security</span>
        </h2>
        <p className="text-xs text-slate-400">
          Daemon execution parameters, network bindings, and process supervisor policies
        </p>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Network & Binding Security */}
        <div className="glass-panel glass-specular rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Network Binding & Loopback Security</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            By default, Termux NodePanel binds strictly to the loopback interface (<code className="text-emerald-400 font-mono">127.0.0.1</code>) to prevent unauthorized access across local Wi-Fi or cellular networks.
          </p>

          <div className="bg-black/30 p-4 rounded-xl border border-white/[0.04] space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span className="text-slate-400">DEFAULT BIND HOST</span>
              <span className="text-slate-200">127.0.0.1 (Localhost Only)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span className="text-slate-400">DEFAULT DAEMON PORT</span>
              <span className="text-slate-200">8080 (or custom via --port)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">STORAGE PERSISTENCE</span>
              <span className="text-emerald-400">SQLite (WAL Mode)</span>
            </div>
          </div>
        </div>

        {/* Process Supervisor Rules */}
        <div className="glass-panel glass-specular rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span>Process Supervisor & Limits</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Node.js package installation (<code className="text-cyan-400 font-mono">npm install</code>) is memory-intensive. On Android devices, Termux NodePanel enforces a hardware-safe concurrency semaphore (max 1 concurrent install) to prevent Android Low Memory Killer (OOM).
          </p>

          <div className="bg-black/30 p-4 rounded-xl border border-white/[0.04] space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-white/[0.04]">
              <span className="text-slate-400">CONCURRENT INSTALL LIMIT</span>
              <span className="text-slate-200">1 Task (OOM Guard)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">CONSOLE BUFFER</span>
              <span className="text-slate-200">1,000 Lines (Ring Buffer)</span>
            </div>
          </div>
        </div>

        {/* Storage Architecture (Full width) */}
        <div className="md:col-span-2 glass-panel rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span>Storage & Directory Structure</span>
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Each server instance resides in its own isolated directory under <code className="text-slate-200 font-mono">data/servers/&lt;server-id&gt;/</code>. Path traversal defense prevents files from escaping the server boundary.
          </p>
        </div>
      </div>
    </div>
  );
};
