import React from 'react';
import {
  LayoutDashboard,
  Server,
  Package,
  Activity,
  Stethoscope,
} from 'lucide-react';
import { TabType } from './Sidebar';
import { ServerModel } from '../types';

interface MobileBottomNavProps {
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

  const items = [
    {
      id: 'dashboard' as TabType,
      label: 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'servers' as TabType,
      label: 'Servers',
      icon: Server,
      badge: `${runningCount}/${servers.length}`,
    },
    {
      id: 'packages' as TabType,
      label: 'Packages',
      icon: Package,
    },
    {
      id: 'diagnostics' as TabType,
      label: 'Doctor',
      icon: Stethoscope,
    },
    {
      id: 'activity' as TabType,
      label: 'Logs',
      icon: Activity,
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 max-w-md mx-auto bg-slate-950/95 backdrop-blur-2xl border-t border-white/[0.08] px-2 py-1.5 flex items-center justify-around shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = !activeServerId && currentTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => {
              onClearActiveServer();
              onSelectTab(item.id);
            }}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative min-w-[56px] ${
              isActive
                ? 'text-emerald-300 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon
                className={`w-4 h-4 transition-transform ${
                  isActive ? 'text-emerald-400 stroke-[2.5]' : 'text-slate-400'
                }`}
              />
              {item.badge && servers.length > 0 && (
                <span className="absolute -top-1.5 -right-3 text-[9px] font-mono px-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 leading-tight font-semibold">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            {isActive && (
              <span className="w-1 h-1 rounded-full bg-emerald-400 mt-0.5 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
            )}
          </button>
        );
      })}
    </nav>
  );
};
