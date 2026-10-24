import React from 'react';
import {
  Activity,
  LayoutDashboard,
  Server,
  Settings,
  Terminal,
} from 'lucide-react';
import { ServerModel, TabType } from '../types';
import { focusRingClasses } from '../styles/tokens';
import { useJobs } from '../context/JobContext';

export interface MobileBottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onClearActiveServer: () => void;
  onOpenJobs?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onClearActiveServer,
  onOpenJobs,
}) => {
  const { runningJobs, openJobsModal } = useJobs();
  const runningCount = servers.filter((s) => s.status === 'running').length;

  const items: Array<{
    id: TabType | 'jobs';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string | number;
    highlightCounter?: boolean;
    onClick: () => void;
    isActive: boolean;
  }> = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
      isActive: !activeServerId && currentTab === 'dashboard',
      onClick: () => {
        onClearActiveServer();
        onSelectTab('dashboard');
      },
    },
    {
      id: 'servers',
      label: 'Servers',
      icon: Server,
      counter: servers.length > 0 ? `${runningCount}/${servers.length}` : undefined,
      isActive: !activeServerId && currentTab === 'servers',
      onClick: () => {
        onClearActiveServer();
        onSelectTab('servers');
      },
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: Terminal,
      counter: runningJobs.length > 0 ? runningJobs.length : undefined,
      highlightCounter: runningJobs.length > 0,
      isActive: false,
      onClick: () => {
        if (onOpenJobs) {
          onOpenJobs();
        } else {
          openJobsModal();
        }
      },
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: Activity,
      isActive: !activeServerId && currentTab === 'activity',
      onClick: () => {
        onClearActiveServer();
        onSelectTab('activity');
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      isActive: !activeServerId && currentTab === 'settings',
      onClick: () => {
        onClearActiveServer();
        onSelectTab('settings');
      },
    },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="lg:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md bg-[#0E1015]/95 backdrop-blur-md border border-[#242A36]/90 rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.7)] px-2 py-1.5 flex items-center justify-between"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.isActive;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={item.onClick}
            className={`flex-1 min-h-[44px] min-w-[44px] flex flex-col items-center justify-center rounded-full transition-all duration-150 ${focusRingClasses} ${
              isActive
                ? 'bg-[#1C222E] text-[#F3F5F8] font-semibold shadow-inner'
                : 'text-[#8A94A6] hover:text-[#D0D7E2] hover:bg-[#13161D]'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-[#8A94A6]'}`} />
              {item.counter !== undefined && (
                <span
                  className={`ml-1 text-[10px] font-mono tabular-nums px-1 rounded-full ${
                    item.highlightCounter
                      ? 'bg-amber-400/20 text-amber-300 font-bold animate-pulse'
                      : 'text-[#8A94A6]'
                  }`}
                >
                  {item.counter}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 leading-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
