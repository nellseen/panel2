import React from 'react';
import { Cpu, HardDrive, Lock, Shield } from 'lucide-react';
import { EnvironmentInfo } from '../types';
import { Card, CodeText, PageHeader } from './ui';

export interface SettingsViewProps {
  runtime: EnvironmentInfo | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ runtime }) => {
  const activePort = runtime?.panel_port || 3000;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel Settings & Security Architecture"
        description="Active daemon configuration, process group supervision parameters, and filesystem sandboxing rules."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg" className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F3F5F8]">
            <Shield className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Network &amp; Origin Protection</span>
          </div>
          <p className="text-xs text-[#8A94A6] leading-relaxed">
            NodePanel validates HTTP <CodeText>Origin</CodeText> and WebSocket upgrade headers against
            trusted host origins, applies sliding-window API rate limiting, and supports optional
            Bearer/API-key enforcement via <CodeText>API_SECRET_KEY</CodeText>.
          </p>

          <div className="rounded-lg bg-[#090B0E] border border-[#1A1E26] divide-y divide-[#181C24] text-xs font-mono">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">Active Panel Port</span>
              <span className="text-[#F3F5F8]">:{activePort}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">WebSocket Endpoint</span>
              <span className="text-[#F3F5F8]">/ws (25s ping/pong heartbeat)</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">Cross-Origin Policy</span>
              <span className="text-emerald-400">Same-Origin / Allowlist</span>
            </div>
          </div>
        </Card>

        <Card padding="lg" className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F3F5F8]">
            <Cpu className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Process Supervision &amp; Limits</span>
          </div>
          <p className="text-xs text-[#8A94A6] leading-relaxed">
            Managed Node.js instances run in detached POSIX process groups so stopping or restarting
            terminates the entire process tree cleanly with zero orphan child processes.
          </p>

          <div className="rounded-lg bg-[#090B0E] border border-[#1A1E26] divide-y divide-[#181C24] text-xs font-mono">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">Crash Auto-Restart Cap</span>
              <span className="text-[#F3F5F8]">Max 5 retries (linear backoff)</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">Graceful Stop Signal</span>
              <span className="text-[#F3F5F8]">SIGTERM → 3s → SIGKILL</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[#8A94A6] font-sans">In-Memory Log Ring Buffer</span>
              <span className="text-[#F3F5F8]">1,000 lines / instance</span>
            </div>
          </div>
        </Card>

        <Card padding="lg" className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#F3F5F8]">
            <HardDrive className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Atomic Storage &amp; Workspace Sandboxing</span>
          </div>
          <p className="text-xs text-[#8A94A6] leading-relaxed">
            Panel metadata is persisted atomically via write-then-rename to{' '}
            <CodeText>data/nodepanel.json</CodeText> (overrideable via{' '}
            <CodeText>NODEPANEL_DATA_DIR</CodeText>). Each managed server is strictly confined to{' '}
            <CodeText>data/servers/&lt;server-id&gt;/</CodeText> with canonical{' '}
            <CodeText>realpath</CodeText> boundary enforcement against directory traversal and symbolic
            link escapes.
          </p>
          <div className="flex items-center gap-2 text-xs text-[#697386] pt-1">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span>Child commands execute asynchronously with shell: false to prevent command injection.</span>
          </div>
        </Card>
      </div>
    </div>
  );
};
