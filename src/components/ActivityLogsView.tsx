import React, { useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { ActivityLog as ActivityLogModel } from '../types';
import {
  ActivityLog,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
} from './ui';

export interface ActivityLogsViewProps {
  activities: ActivityLogModel[];
  isRefreshing?: boolean;
  onRefresh: () => void;
  onSelectServer?: (serverId: string) => void;
}

type AuditFilter = 'all' | 'success' | 'failed';
const PAGE_SIZE = 20;

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({
  activities,
  isRefreshing = false,
  onRefresh,
  onSelectServer,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AuditFilter>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      const matchesQuery =
        !q ||
        a.action.toLowerCase().includes(q) ||
        a.server_id.toLowerCase().includes(q) ||
        a.details.toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (statusFilter === 'success') return a.status === 'success';
      if (statusFilter === 'failed') return a.status === 'failed' || a.status === 'warning';
      return true;
    });
  }, [activities, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Audit Log"
        description="Chronological record of server lifecycle transitions, file edits, package operations, and configuration changes persisted to data/nodepanel.json."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={isRefreshing}
            onClick={onRefresh}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Filter by action, server ID, or details..."
            aria-label="Filter activity logs"
          />
        </div>

        <Tabs<AuditFilter>
          size="sm"
          ariaLabel="Filter audit status"
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            setPage(1);
          }}
          items={[
            { id: 'all', label: 'All', count: activities.length },
            {
              id: 'success',
              label: 'Succeeded',
              count: activities.filter((a) => a.status === 'success').length,
            },
            {
              id: 'failed',
              label: 'Errors',
              count: activities.filter((a) => a.status !== 'success').length,
            },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Activity className="w-7 h-7" />}
          title="No matching audit events"
          description={
            activities.length === 0
              ? 'Lifecycle events and configuration updates will appear here automatically.'
              : 'Clear your search filter to see all recorded audit entries.'
          }
        />
      ) : (
        <div className="space-y-3">
          <ActivityLog items={paged} onSelectServer={onSelectServer} />
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={filtered.length}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
};
