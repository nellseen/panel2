import React from 'react';
import {
  Activity,
  LayoutDashboard,
  Package,
  Server,
  Stethoscope,
} from 'lucide-react';
import { ServerModel, TabType } from '../types';
import { focusRingClasses } from '../styles/tokens';

export interface MobileBottomNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  servers: ServerModel[];
  activeServerId: string | null;
  onClearActiveServer: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onSelectTab,
  servers,
  activeServerId,
  onClearActiveServer,
}) => {
  const runningCount = servers.filter((s) => s.status === 'running').length;

  const items: Array<{
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
      counter: servers.length > 0 ? `${runningCount}/${servers.length}` : undefined,
    },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'diagnostics', label: 'Doctor', icon: Stethoscope },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-[#0B0D10] border-t border-[#1A1E26] px-2 flex items-center justify-around"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = !activeServerId && currentTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              onClearActiveServer();
              onSelectTab(item.id);
            }}
            className={`flex-1 min-h-[44px] flex flex-col items-center justify-center rounded-lg transition-colors duration-150 ${focusRingClasses} ${
              isActive ? 'text-[#F3F5F8] font-semibold' : 'text-[#8A94A6] hover:text-[#D0D7E2]'
            }`}
          >
            <div className="flex items-center gap-1">
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-[#697386]'}`} />
              {item.counter && (
                <span className="text-[10px] font-mono tabular-nums text-[#8A94A6]">
                  {item.counter}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
