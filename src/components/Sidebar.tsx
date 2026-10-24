import React from 'react';
import {
  Activity,
  ChevronRight,
  LayoutDashboard,
  Package,
  Plus,
  Server,
  Settings,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { ServerModel, TabType } from '../types';
import { Drawer, IconButton } from './ui';
import { focusRingClasses } from '../styles/tokens';

export type { TabType } from '../types';

export interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onOpenCreate: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

const SidebarBody: React.FC<{
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onOpenCreate: () => void;
  onNavigateDone?: () => void;
}> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreate,
  onNavigateDone,
}) => {
  const runningCount = servers.filter((s) => s.status === 'running').length;

  const navItems: Array<{
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string;
  }> = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'servers',
      label: 'Servers',
      icon: Server,
      counter: `${runningCount}/${servers.length}`,
    },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'diagnostics', label: 'Diagnostics', icon: Stethoscope },
    { id: 'activity', label: 'Activity Log', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="flex-1 overflow-y-auto p-3.5 space-y-6">
        <div>
          <div className="px-2.5 pb-2 text-[11px] font-medium text-[#697386]">Console</div>
          <nav aria-label="Main navigation" className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isSelected = !activeServerId && currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => {
                    onSelectTab(item.id);
                    onNavigateDone?.();
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors duration-150 ${focusRingClasses} ${
                    isSelected
                      ? 'bg-[#161A22] text-[#F3F5F8] font-semibold border border-[#262C36]'
                      : 'text-[#A2AAB8] hover:text-[#F3F5F8] hover:bg-[#11141A] border border-transparent font-medium'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-emerald-400' : 'text-[#697386]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </span>

                  {item.counter !== undefined && (
                    <span className="text-[11px] font-mono tabular-nums text-[#697386]">
                      {item.counter}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-[#181C24]">
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="text-[11px] font-medium text-[#697386]">Managed Instances</span>
            <IconButton
              aria-label="Create new server instance"
              size="sm"
              variant="ghost"
              onClick={() => {
                onOpenCreate();
                onNavigateDone?.();
              }}
              className="h-6 w-6"
              icon={<Plus className="w-3.5 h-3.5 text-[#8A94A6]" />}
            />
          </div>

          {servers.length === 0 ? (
            <div className="px-2.5 py-3 rounded-lg bg-[#0E1014] border border-[#1A1E26] text-xs text-[#697386]">
              No instances configured.
            </div>
          ) : (
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {servers.map((srv) => {
                const isCurrent = activeServerId === srv.id;
                const dotColor =
                  srv.status === 'running'
                    ? 'bg-emerald-400'
                    : srv.status === 'crashed' || srv.status === 'failed'
                    ? 'bg-red-400'
                    : srv.status === 'starting' || srv.status === 'stopping'
                    ? 'bg-amber-400'
                    : 'bg-[#5B6475]';

                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => {
                      onSelectServer(srv.id);
                      onNavigateDone?.();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors duration-150 ${focusRingClasses} ${
                      isCurrent
                        ? 'bg-[#161A22] text-[#F3F5F8] font-semibold border border-[#262C36]'
                        : 'text-[#A2AAB8] hover:text-[#F3F5F8] hover:bg-[#11141A] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
                      <span className="truncate">{srv.name}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 font-mono text-[11px] text-[#697386] tabular-nums">
                      <span>:{srv.port}</span>
                      <ChevronRight className="w-3 h-3" aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="p-3.5 border-t border-[#181C24] bg-[#090B0E]">
        <div className="flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#D0D7E2]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
            <span>Process Supervisor</span>
          </span>
          <span className="font-mono text-[11px] text-emerald-400">Active</span>
        </div>
        <p className="text-[11px] text-[#697386] mt-1 leading-snug">
          Isolated POSIX process groups · Atomic JSON store
        </p>
      </div>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreate,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  return (
    <>
      <aside
        aria-label="Primary sidebar"
        className="hidden lg:flex w-64 shrink-0 bg-[#0B0D10] border-r border-[#1A1E26] flex-col"
      >
        <SidebarBody
          currentTab={currentTab}
          onSelectTab={onSelectTab}
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={onSelectServer}
          onOpenCreate={onOpenCreate}
        />
      </aside>

      <Drawer
        isOpen={isOpenMobile}
        onClose={() => onCloseMobile?.()}
        title="NodePanel Navigation"
      >
        <SidebarBody
          currentTab={currentTab}
          onSelectTab={onSelectTab}
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={onSelectServer}
          onOpenCreate={onOpenCreate}
          onNavigateDone={onCloseMobile}
        />
      </Drawer>
    </>
  );
};
