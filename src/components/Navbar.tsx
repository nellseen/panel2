import React from 'react';
import { Menu, Plus, RefreshCw, Terminal } from 'lucide-react';
import { ConnectionState, EnvironmentInfo } from '../types';
import { Button, ConnectionStatus, IconButton, MetaRow } from './ui';

export interface NavbarProps {
  runtime: EnvironmentInfo | null;
  connectionState: ConnectionState;
  reconnectAttempt: number;
  isStale: boolean;
  lastSyncedAt: string | null;
  onOpenCreate: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onToggleMobileSidebar: () => void;
  currentFeatureName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  runtime,
  connectionState,
  reconnectAttempt,
  isStale,
  lastSyncedAt,
  onOpenCreate,
  onRefresh,
  isRefreshing,
  onToggleMobileSidebar,
  currentFeatureName,
}) => {
  return (
    <header className="h-14 bg-[#0B0D10] border-b border-[#1A1E26] px-4 lg:px-6 flex items-center justify-between shrink-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <IconButton
          aria-label="Open navigation menu"
          variant="ghost"
          size="sm"
          onClick={onToggleMobileSidebar}
          className="lg:hidden"
          icon={<Menu className="w-4 h-4 text-[#D0D7E2]" />}
        />

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-[#12151B] border border-[#262C36] flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 leading-none">
              <span className="text-sm font-semibold tracking-tight text-[#F3F5F8]">NodePanel</span>
              <span className="hidden sm:inline text-[#323A48]" aria-hidden="true">
                /
              </span>
              <span className="hidden sm:inline text-xs font-mono text-[#8A94A6] truncate max-w-[240px]">
                {currentFeatureName}
              </span>
            </div>
            <MetaRow
              className="mt-1 hidden md:flex"
              items={[
                runtime?.type_name || 'Linux Host',
                runtime?.arch ? `${runtime.os}/${runtime.arch}` : null,
                runtime?.panel_port ? `Port ${runtime.panel_port}` : null,
              ]}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="hidden xs:flex sm:flex items-center pr-1">
          <ConnectionStatus
            state={connectionState}
            reconnectAttempt={reconnectAttempt}
            isStale={isStale}
            lastUpdatedAt={lastSyncedAt}
          />
        </div>

        <IconButton
          aria-label="Refresh panel state"
          variant="outline"
          size="sm"
          loading={isRefreshing}
          onClick={onRefresh}
          title="Synchronize state"
          icon={<RefreshCw className="w-3.5 h-3.5 text-[#A2AAB8]" />}
        />

        <Button
          variant="primary"
          size="sm"
          onClick={onOpenCreate}
          leftIcon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
        >
          New Server
        </Button>
      </div>
    </header>
  );
};
