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
  Terminal,
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigateLanding?: () => void;
}

const SidebarBody: React.FC<{
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onOpenCreate: () => void;
  onNavigateDone?: () => void;
  isCollapsed?: boolean;
  onNavigateLanding?: () => void;
}> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onSelectServer,
  onOpenCreate,
  onNavigateDone,
  isCollapsed = false,
  onNavigateLanding,
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
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        <div>
          {!isCollapsed && (
            <div className="px-2.5 pb-2 text-[11px] font-medium text-[#697386]">Console</div>
          )}
          <nav aria-label="Main navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isSelected = !activeServerId && currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  aria-current={isSelected ? 'page' : undefined}
                  title={item.label}
                  onClick={() => {
                    onSelectTab(item.id);
                    onNavigateDone?.();
                  }}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-2'
                  } rounded-lg text-xs transition-colors duration-150 ${focusRingClasses} ${
                    isSelected
                      ? 'bg-[#161A22] text-[#F3F5F8] font-semibold border border-[#262C36]'
                      : 'text-[#A2AAB8] hover:text-[#F3F5F8] hover:bg-[#11141A] border border-transparent font-medium'
                  }`}
                >
                  <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isSelected ? 'text-emerald-400' : 'text-[#697386]'
                      }`}
                    />
                    {!isCollapsed && <span>{item.label}</span>}
                  </span>

                  {!isCollapsed && item.counter !== undefined && (
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
          {!isCollapsed ? (
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
          ) : (
            <div className="flex justify-center pb-2">
              <IconButton
                aria-label="Create new server instance"
                size="sm"
                variant="ghost"
                onClick={() => {
                  onOpenCreate();
                  onNavigateDone?.();
                }}
                className="h-7 w-7"
                icon={<Plus className="w-3.5 h-3.5 text-[#8A94A6]" />}
              />
            </div>
          )}

          {servers.length === 0 ? (
            !isCollapsed ? (
              <div className="px-2.5 py-3 rounded-lg bg-[#0E1014] border border-[#1A1E26] text-xs text-[#697386]">
                No instances configured.
              </div>
            ) : null
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
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
                    aria-label={isCollapsed ? `${srv.name} :${srv.port}` : undefined}
                    title={`${srv.name} (Port ${srv.port})`}
                    onClick={() => {
                      onSelectServer(srv.id);
                      onNavigateDone?.();
                    }}
                    className={`w-full flex items-center ${
                      isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-2'
                    } rounded-lg text-left text-xs transition-colors duration-150 ${focusRingClasses} ${
                      isCurrent
                        ? 'bg-[#161A22] text-[#F3F5F8] font-semibold border border-[#262C36]'
                        : 'text-[#A2AAB8] hover:text-[#F3F5F8] hover:bg-[#11141A] border border-transparent'
                    }`}
                  >
                    <span className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 min-w-0'}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
                      {!isCollapsed && <span className="truncate">{srv.name}</span>}
                    </span>
                    {!isCollapsed && (
                      <span className="flex items-center gap-1 shrink-0 font-mono text-[11px] text-[#697386] tabular-nums">
                        <span>:{srv.port}</span>
                        <ChevronRight className="w-3 h-3" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {onNavigateLanding && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                onNavigateLanding();
                onNavigateDone?.();
              }}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2.5' : 'justify-start gap-2.5 px-2.5 py-2'
              } rounded-lg text-xs text-[#8A94A6] hover:text-[#F3F5F8] hover:bg-[#11141A] transition-colors font-medium border border-transparent`}
              title="Buka Landing Page / About"
            >
              <Terminal className="w-4 h-4 text-[#697386] shrink-0" />
              {!isCollapsed && <span>About & Landing</span>}
            </button>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[#181C24] bg-[#090B0E]">
        {!isCollapsed ? (
          <>
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
          </>
        ) : (
          <div className="flex justify-center" title="Supervisor Active">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          </div>
        )}
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
  isCollapsed = false,
  onToggleCollapse,
  onNavigateLanding,
}) => {
  return (
    <>
      <aside
        aria-label="Primary sidebar"
        className={`hidden lg:flex shrink-0 bg-[#0B0D10] border-r border-[#1A1E26] flex-col transition-all duration-200 ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="px-3 py-2 border-b border-[#181C24] flex items-center justify-between">
          {!isCollapsed && (
            <span className="text-xs font-semibold text-[#8A94A6] uppercase tracking-wider">
              Workspace
            </span>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={onToggleCollapse}
              className={`p-1.5 rounded-lg text-[#8A94A6] hover:text-[#F3F5F8] hover:bg-[#161A22] transition-colors ${
                isCollapsed ? 'mx-auto' : ''
              }`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronRight
                className={`w-4 h-4 transition-transform duration-200 ${
                  isCollapsed ? '' : 'rotate-180'
                }`}
              />
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <SidebarBody
            currentTab={currentTab}
            onSelectTab={onSelectTab}
            servers={servers}
            activeServerId={activeServerId}
            onSelectServer={onSelectServer}
            onOpenCreate={onOpenCreate}
            isCollapsed={isCollapsed}
            onNavigateLanding={onNavigateLanding}
          />
        </div>
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
          isCollapsed={false}
          onNavigateLanding={onNavigateLanding}
        />
      </Drawer>
    </>
  );
};

