import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Plus,
  Server,
  AlertTriangle,
} from 'lucide-react';
import {
  ActivityLog as ActivityLogModel,
  EnvironmentInfo,
  PendingServerAction,
  ServerModel,
  TabType,
} from '../types';
import {
  ActivityLog,
  Button,
  Card,
  CodeText,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SectionHeader,
  ServerCard,
  Skeleton,
  StatCard,
} from './ui';
import { formatMemoryMB, formatStorageMB } from '../utils/formatters';

export interface DashboardViewProps {
  servers: ServerModel[];
  runtime: EnvironmentInfo | null;
  activities: ActivityLogModel[];
  initialLoading?: boolean;
  pendingActions?: Record<string, PendingServerAction>;
  onOpenCreate: () => void;
  onSelectServer: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onDeleteServer?: (serverId: string) => void;
  onNavigateTab: (tab: TabType) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  servers,
  runtime,
  activities,
  initialLoading = false,
  pendingActions = {},
  onOpenCreate,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
  onNavigateTab,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<ServerModel | null>(null);

  const runningServers = servers.filter((s) => s.status === 'running');
  const crashedServers = servers.filter(
    (s) => s.status === 'crashed' || s.status === 'failed'
  );

  const hasMeasuredRam = runningServers.some(
    (s) => s.metrics?.memory_mb !== null && s.metrics?.memory_mb !== undefined
  );
  const totalRamUsedMb = runningServers.reduce(
    (acc, s) => acc + (s.metrics?.memory_mb ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Real-time Node.js process supervision, resource telemetry, and host toolchain health."
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => onNavigateTab('servers')}>
              All Servers ({servers.length})
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onOpenCreate}
              leftIcon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
            >
              Create Instance
            </Button>
          </>
        }
      />

      {/* Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Active Processes"
          tone={runningServers.length > 0 ? 'accent' : 'default'}
          value={
            initialLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <span>
                {runningServers.length}
                <span className="text-sm font-normal text-[#697386] ml-1">/ {servers.length}</span>
              </span>
            )
          }
          sublabel="Isolated POSIX process groups"
        />

        <StatCard
          label="Managed RSS Memory"
          value={
            initialLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : runningServers.length === 0 ? (
              '0.0 MB'
            ) : hasMeasuredRam ? (
              formatMemoryMB(totalRamUsedMb)
            ) : (
              '—'
            )
          }
          sublabel={
            runtime?.memory_total_mb
              ? `Host total: ${formatStorageMB(runtime.memory_total_mb)}`
              : 'Measured via /proc/<pid>/status'
          }
        />

        <StatCard
          label="Available Storage"
          value={
            initialLoading && !runtime ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              formatStorageMB(runtime?.disk_free_mb)
            )
          }
          sublabel="Workspace volume free space"
        />

        <StatCard
          label="Crash / Failed"
          tone={crashedServers.length > 0 ? 'danger' : 'default'}
          value={initialLoading ? <Skeleton className="h-7 w-12" /> : crashedServers.length}
          sublabel={
            crashedServers.length > 0
              ? 'Requires operator inspection'
              : 'All supervised instances nominal'
          }
        />
      </div>

      {/* Main Two-Column Console Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Managed Applications */}
        <div className="xl:col-span-2 space-y-4">
          <SectionHeader
            title="Managed Applications"
            description="Direct process lifecycle controls and real-time runtime telemetry."
            action={
              servers.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigateTab('servers')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  View all ({servers.length})
                </Button>
              ) : undefined
            }
          />

          {initialLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : servers.length === 0 ? (
            <EmptyState
              icon={<Server className="w-7 h-7" />}
              title="No Node.js instances configured"
              description="Provision an Express API, HTTP service, background worker, or clone a Git repository into an isolated workspace."
              action={
                <Button
                  variant="primary"
                  size="md"
                  onClick={onOpenCreate}
                  leftIcon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                >
                  Create Node Server
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {servers.slice(0, 6).map((srv) => (
                <ServerCard
                  key={srv.id}
                  server={srv}
                  pendingAction={pendingActions[srv.id]}
                  onSelect={onSelectServer}
                  onStart={onStartServer}
                  onStop={onStopServer}
                  onRestart={onRestartServer}
                  onDelete={onDeleteServer ? (target) => setDeleteTarget(target) : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {/* Host Runtime & Toolchain */}
        <div className="space-y-4">
          <SectionHeader
            title="Host Environment"
            description="Verified runtime binaries and storage architecture."
            action={
              <Button variant="ghost" size="sm" onClick={() => onNavigateTab('diagnostics')}>
                Doctor
              </Button>
            }
          />

          <Card padding="md" className="space-y-4">
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#181C24]">
                <span className="text-[#8A94A6]">Environment</span>
                <span className="font-medium text-[#F3F5F8]">
                  {runtime?.type_name || 'Linux Host'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#181C24]">
                <span className="text-[#8A94A6]">Architecture</span>
                <span className="font-mono text-[#E2E8F0]">
                  {runtime ? `${runtime.os}/${runtime.arch}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#181C24]">
                <span className="text-[#8A94A6]">Package Manager</span>
                <span className="font-mono text-[#E2E8F8]">
                  {runtime?.package_manager || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-[#181C24]">
                <span className="text-[#8A94A6]">PRoot Container</span>
                <span className="font-mono text-[#E2E8F0]">
                  {runtime ? (runtime.is_proot ? 'Active' : 'Native') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#8A94A6]">Persistence</span>
                <CodeText>data/nodepanel.json</CodeText>
              </div>
            </div>

            <div className="pt-3 border-t border-[#181C24] space-y-2">
              <div className="text-[11px] font-medium text-[#697386]">Core Binaries</div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {(['node', 'npm', 'git'] as const).map((bin) => {
                  const ok = Boolean(runtime?.executables?.[bin]);
                  return (
                    <div
                      key={bin}
                      className="px-2.5 py-2 rounded-lg bg-[#12151B] border border-[#222733] flex items-center justify-between gap-1.5"
                    >
                      <span className="text-[#E2E8F0]">{bin}</span>
                      {ok ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-label="Installed" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Missing" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => onNavigateTab('packages')}
            >
              Manage System Packages
            </Button>
          </Card>
        </div>
      </div>

      {/* Audit Timeline */}
      <div className="space-y-3">
        <SectionHeader
          title="Recent Activity"
          description="Chronological audit trail of lifecycle transitions and configuration updates."
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateTab('activity')}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Full Audit Log
            </Button>
          }
        />

        <ActivityLog items={activities} limit={6} onSelectServer={onSelectServer} />
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget && onDeleteServer) {
            onDeleteServer(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete Server Instance"
        confirmLabel="Delete Server"
        description={
          deleteTarget ? (
            <>
              Terminate <strong className="text-[#F3F5F8] font-mono">{deleteTarget.name}</strong> and
              permanently remove its workspace directory (<CodeText>data/servers/{deleteTarget.id}</CodeText>)?
              This action cannot be undone.
            </>
          ) : null
        }
      />
    </div>
  );
};
