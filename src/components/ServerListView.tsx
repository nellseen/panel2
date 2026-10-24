import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  List,
  Play,
  Plus,
  RotateCw,
  Server,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import { PendingServerAction, ServerModel } from '../types';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  ServerCard,
  Skeleton,
  StatusPill,
  Table,
  TableColumn,
  Tabs,
} from './ui';
import {
  canRestartServer,
  canStartServer,
  canStopServer,
} from '../utils/serverLifecycle';
import { formatMemoryMB, formatUptime } from '../utils/formatters';

export interface ServerListViewProps {
  servers: ServerModel[];
  initialLoading?: boolean;
  pendingActions?: Record<string, PendingServerAction>;
  onOpenCreate: () => void;
  onSelectServer: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
}

type StatusFilter = 'all' | 'running' | 'stopped' | 'crashed';
type ViewLayout = 'grid' | 'table';

const PAGE_SIZE = 12;

export const ServerListView: React.FC<ServerListViewProps> = ({
  servers,
  initialLoading = false,
  pendingActions = {},
  onOpenCreate,
  onSelectServer,
  onStartServer,
  onStopServer,
  onRestartServer,
  onDeleteServer,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [layout, setLayout] = useState<ViewLayout>('grid');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<ServerModel | null>(null);

  const counts = useMemo(
    () => ({
      all: servers.length,
      running: servers.filter((s) => s.status === 'running').length,
      stopped: servers.filter((s) => s.status === 'stopped' || s.status === 'created').length,
      crashed: servers.filter((s) => s.status === 'crashed' || s.status === 'failed').length,
    }),
    [servers]
  );

  const filteredServers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return servers.filter((s) => {
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        String(s.port).includes(q) ||
        s.entry_file.toLowerCase().includes(q);

      if (!matchesQuery) return false;
      if (filter === 'running') return s.status === 'running';
      if (filter === 'stopped') return s.status === 'stopped' || s.status === 'created';
      if (filter === 'crashed') return s.status === 'crashed' || s.status === 'failed';
      return true;
    });
  }, [servers, search, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredServers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedServers = filteredServers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const columns: TableColumn<ServerModel>[] = [
    {
      key: 'name',
      header: 'Instance',
      render: (srv) => (
        <div className="min-w-[160px]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectServer(srv.id);
            }}
            className="font-semibold text-[#F3F5F8] hover:text-emerald-400 text-left block truncate max-w-[240px]"
          >
            {srv.name}
          </button>
          <span className="font-mono text-[11px] text-[#697386]">{srv.id}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (srv) => {
        const pending = pendingActions[srv.id];
        const effectiveStatus =
          pending === 'starting' || pending === 'restarting'
            ? 'starting'
            : pending === 'stopping'
            ? 'stopping'
            : srv.status;
        return <StatusPill status={effectiveStatus} />;
      },
    },
    {
      key: 'port',
      header: 'Port',
      align: 'right',
      render: (srv) => `:${srv.port}`,
    },
    {
      key: 'entry',
      header: 'Entry',
      render: (srv) => <span className="font-mono text-[#A2AAB8]">{srv.entry_file}</span>,
    },
    {
      key: 'memory',
      header: 'Memory',
      align: 'right',
      render: (srv) =>
        srv.status === 'running' ? formatMemoryMB(srv.metrics?.memory_mb) : '—',
    },
    {
      key: 'uptime',
      header: 'Uptime / Exit',
      align: 'right',
      render: (srv) =>
        srv.status === 'running'
          ? formatUptime(srv.metrics?.uptime_sec)
          : `Exit ${srv.last_exit_code ?? 0}`,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (srv) => {
        const pending = pendingActions[srv.id];
        const allowStart = canStartServer(srv.status, pending);
        const allowStop = canStopServer(srv.status, pending);
        const allowRestart = canRestartServer(srv.status, pending);

        return (
          <div
            className="inline-flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {srv.status === 'running' || srv.status === 'starting' || srv.status === 'stopping' ? (
              <>
                <IconButton
                  aria-label={`Stop ${srv.name}`}
                  size="sm"
                  variant="danger"
                  disabled={!allowStop}
                  loading={pending === 'stopping'}
                  onClick={() => onStopServer(srv.id)}
                  icon={<Square className="w-3.5 h-3.5" />}
                />
                <IconButton
                  aria-label={`Restart ${srv.name}`}
                  size="sm"
                  variant="secondary"
                  disabled={!allowRestart}
                  loading={pending === 'restarting'}
                  onClick={() => onRestartServer(srv.id)}
                  icon={<RotateCw className="w-3.5 h-3.5" />}
                />
              </>
            ) : (
              <IconButton
                aria-label={`Start ${srv.name}`}
                size="sm"
                variant="primary"
                disabled={!allowStart}
                loading={pending === 'starting'}
                onClick={() => onStartServer(srv.id)}
                icon={<Play className="w-3.5 h-3.5 fill-current" />}
              />
            )}

            <IconButton
              aria-label={`Open ${srv.name} console`}
              size="sm"
              variant="outline"
              onClick={() => onSelectServer(srv.id)}
              icon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
            />

            <IconButton
              aria-label={`Delete ${srv.name}`}
              size="sm"
              variant="ghost"
              disabled={Boolean(pending)}
              onClick={() => setDeleteTarget(srv)}
              icon={<Trash2 className="w-3.5 h-3.5 text-[#8A94A6] hover:text-red-400" />}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description="Manage isolated Node.js server workspaces, ports, lifecycle supervision, and logs."
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={onOpenCreate}
            leftIcon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
          >
            New Server
          </Button>
        }
      />

      {/* Search, Filter Tabs, and View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="w-full lg:max-w-sm">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Filter by name, ID, port, or entry file..."
            aria-label="Search servers"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
          <Tabs<StatusFilter>
            size="sm"
            ariaLabel="Filter servers by status"
            value={filter}
            onChange={(val) => {
              setFilter(val);
              setPage(1);
            }}
            items={[
              { id: 'all', label: 'All', count: counts.all },
              { id: 'running', label: 'Running', count: counts.running },
              { id: 'stopped', label: 'Stopped', count: counts.stopped },
              { id: 'crashed', label: 'Crashed', count: counts.crashed },
            ]}
          />

          <div className="inline-flex items-center p-0.5 rounded-lg bg-[#0E1014] border border-[#1F242D]">
            <IconButton
              aria-label="Grid view"
              size="sm"
              variant={layout === 'grid' ? 'secondary' : 'ghost'}
              onClick={() => setLayout('grid')}
              className="h-7 w-7"
              icon={<LayoutGrid className="w-3.5 h-3.5" />}
            />
            <IconButton
              aria-label="Table view"
              size="sm"
              variant={layout === 'table' ? 'secondary' : 'ghost'}
              onClick={() => setLayout('table')}
              className="h-7 w-7"
              icon={<List className="w-3.5 h-3.5" />}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {initialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : filteredServers.length === 0 ? (
        <EmptyState
          icon={<Server className="w-7 h-7" />}
          title={servers.length === 0 ? 'No servers created yet' : 'No matching servers'}
          description={
            servers.length === 0
              ? 'Deploy a starter template or import an existing Git repository to begin managing processes.'
              : 'Adjust your search query or status filter to view other instances.'
          }
          action={
            servers.length === 0 ? (
              <Button
                variant="primary"
                size="md"
                onClick={onOpenCreate}
                leftIcon={<Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
              >
                Create New Server
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                Reset Filters
              </Button>
            )
          }
        />
      ) : layout === 'table' ? (
        <div className="space-y-3">
          <Table
            columns={columns}
            data={pagedServers}
            rowKey={(row) => row.id}
            onRowClick={(row) => onSelectServer(row.id)}
          />
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={filteredServers.length}
            onPageChange={setPage}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pagedServers.map((srv) => (
              <ServerCard
                key={srv.id}
                server={srv}
                pendingAction={pendingActions[srv.id]}
                onSelect={onSelectServer}
                onStart={onStartServer}
                onStop={onStopServer}
                onRestart={onRestartServer}
                onDelete={(target) => setDeleteTarget(target)}
              />
            ))}
          </div>
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={filteredServers.length}
            onPageChange={setPage}
          />
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteServer(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Delete Server Instance?"
        confirmLabel="Delete"
        loading={deleteTarget ? pendingActions[deleteTarget.id] === 'deleting' : false}
        description={
          deleteTarget ? (
            <>
              This stops any running process group and permanently deletes{' '}
              <strong className="text-[#F3F5F8] font-mono">{deleteTarget.name}</strong> along with all
              files inside <span className="font-mono text-[#E2E8F0]">data/servers/{deleteTarget.id}</span>.
            </>
          ) : null
        }
      />
    </div>
  );
};
