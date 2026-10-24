import React from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { EnvironmentInfo } from '../types';
import {
  Alert,
  Button,
  Card,
  CodeText,
  PageHeader,
  SectionHeader,
  Skeleton,
  StatCard,
} from './ui';
import { formatStorageMB } from '../utils/formatters';

export interface DiagnosticsViewProps {
  runtime: EnvironmentInfo | null;
  isRefreshing?: boolean;
  onRefresh: () => void;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  runtime,
  isRefreshing = false,
  onRefresh,
}) => {
  if (!runtime) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Runtime Diagnostics"
          description="Inspecting host kernel, toolchain binaries, and container boundaries..."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const probeTools = ['node', 'npm', 'git', 'python3', 'ffmpeg', 'curl', 'tar'];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctor & Runtime Diagnostics"
        description="Live verification of host OS parameters, executable paths, storage volume health, and mobile sandbox constraints."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={isRefreshing}
            onClick={onRefresh}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Re-run Doctor
          </Button>
        }
      />

      {runtime.limitations.length > 0 && (
        <Alert variant="warning" title="Environment Notices">
          <ul className="list-disc pl-4 space-y-1">
            {runtime.limitations.map((lim, i) => (
              <li key={i}>{lim}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Detected Environment"
          value={<span className="text-base font-sans">{runtime.type_name}</span>}
          sublabel={`Profile: ${runtime.type}`}
        />
        <StatCard
          label="Platform / Kernel"
          value={`${runtime.os}/${runtime.arch}`}
          sublabel={runtime.kernel}
        />
        <StatCard
          label="Host Memory"
          value={formatStorageMB(runtime.memory_total_mb)}
          sublabel={
            runtime.memory_free_mb !== undefined
              ? `Free: ${formatStorageMB(runtime.memory_free_mb)}`
              : 'Total physical RAM'
          }
        />
        <StatCard
          label="Workspace Disk Free"
          value={formatStorageMB(runtime.disk_free_mb)}
          sublabel={`Pkg manager: ${runtime.package_manager}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <Card padding="lg" className="lg:col-span-2 space-y-4">
          <SectionHeader
            title="Executable Path Probe"
            description="Non-blocking PATH verification of runtime and build binaries."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            {probeTools.map((tool) => {
              const binPath = runtime.executables[tool];
              const installed = Boolean(binPath);

              return (
                <div
                  key={tool}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-[#12151B] border border-[#222733]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {installed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                    )}
                    <span className="font-mono font-semibold text-[#F3F5F8]">{tool}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#8A94A6] truncate max-w-[200px]">
                    {binPath || 'Not in PATH'}
                  </span>
                </div>
              );
            })}
          </div>

          {runtime.prefix && (
            <div className="pt-3 border-t border-[#181C24] flex items-center justify-between text-xs">
              <span className="text-[#8A94A6]">System $PREFIX</span>
              <CodeText>{runtime.prefix}</CodeText>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card padding="lg" className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F3F5F8]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>Verified Capabilities</span>
            </div>
            <ul className="space-y-2 text-xs text-[#A2AAB8]">
              {runtime.capabilities.map((cap, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 font-mono shrink-0">+</span>
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card padding="lg" className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F3F5F8]">
              <BatteryCharging className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>Termux Background Execution</span>
            </div>
            <p className="text-xs text-[#8A94A6] leading-relaxed">
              On Android devices, acquire <CodeText>termux-wake-lock</CodeText> and set Termux battery
              usage to Unrestricted so Android Doze does not suspend active Node.js child servers.
            </p>
            <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-[#697386]">
              <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Hostname: {runtime.hostname}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
