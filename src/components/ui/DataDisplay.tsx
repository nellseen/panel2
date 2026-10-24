import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
  RotateCw,
  Square,
  Terminal,
  Trash2,
} from 'lucide-react';
import { ActivityLog as ActivityLogModel, PendingServerAction, ServerModel } from '../../types';
import { Button, IconButton } from './Button';
import { StatusPill } from './Feedback';
import { Card } from './Layout';
import { MetaRow } from './Typography';
import {
  canRestartServer,
  canStartServer,
  canStopServer,
} from '../../utils/serverLifecycle';
import {
  formatCpuPercent,
  formatMemoryMB,
  formatTimestampFull,
  formatUptime,
} from '../../utils/formatters';
import { focusRingClasses } from '../../styles/tokens';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  className?: string;
  render: (row: T) => React.ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyMessage = 'No records available.',
}: TableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#1F242D] bg-[#0E1014]">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#1F242D] bg-[#11141A] text-[#8A94A6]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`h-9 px-4 font-medium whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                } ${col.className ?? ''}`.trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#181C24]">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-[#697386]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`h-10 transition-colors duration-100 hover:bg-[#14171D] ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-[#E2E8F0] tabular-nums ${
                      col.align === 'right' ? 'text-right font-mono' : 'text-left'
                    } ${col.className ?? ''}`.trim()}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-xs text-[#8A94A6] tabular-nums">
      <span>
        Showing {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Previous
        </Button>
        <span className="px-2 font-mono text-[#D0D7E2]">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export interface ServerCardProps {
  server: ServerModel;
  pendingAction?: PendingServerAction;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onDelete?: (server: ServerModel) => void;
  compact?: boolean;
}

export const ServerCard: React.FC<ServerCardProps> = ({
  server,
  pendingAction,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onDelete,
  compact = false,
}) => {
  const effectiveStatus =
    pendingAction === 'starting'
      ? 'starting'
      : pendingAction === 'stopping'
      ? 'stopping'
      : pendingAction === 'restarting'
      ? 'starting'
      : server.status;

  const isRunning = server.status === 'running' && !pendingAction;
  const allowStart = canStartServer(server.status, pendingAction);
  const allowStop = canStopServer(server.status, pendingAction);
  const allowRestart = canRestartServer(server.status, pendingAction);

  return (
    <Card
      data-testid={`server-card-${server.id}`}
      padding={compact ? 'sm' : 'md'}
      className="flex flex-col justify-between gap-4 hover:border-[#2B313D] transition-colors duration-150"
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(server.id)}
              className={`text-left text-sm font-semibold text-[#F3F5F8] hover:text-emerald-400 transition-colors truncate block max-w-full ${focusRingClasses} rounded`}
            >
              {server.name}
            </button>
            <MetaRow
              className="mt-0.5"
              items={[
                <span key="port" className="font-mono text-[#D0D7E2]">:{server.port}</span>,
                <span key="entry" className="font-mono truncate max-w-[140px]">{server.entry_file}</span>,
                <span key="id" className="font-mono text-[#697386]">{server.id}</span>,
              ]}
            />
          </div>

          <StatusPill status={effectiveStatus} />
        </div>

        {!compact && (
          <p className="text-xs text-[#8A94A6] line-clamp-2 min-h-[2rem]">
            {server.description || 'Managed Node.js process isolated in server workspace.'}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#181C24] text-xs font-mono tabular-nums">
          <div>
            <span className="block text-[11px] font-sans text-[#697386]">Memory</span>
            <span className="text-[#E2E8F0]">
              {isRunning ? formatMemoryMB(server.metrics?.memory_mb) : '—'}
            </span>
          </div>
          <div>
            <span className="block text-[11px] font-sans text-[#697386]">CPU / Uptime</span>
            <span className="text-[#E2E8F0]">
              {isRunning
                ? server.metrics?.cpu_percent !== null && server.metrics?.cpu_percent !== undefined
                  ? `${formatCpuPercent(server.metrics.cpu_percent)} · ${formatUptime(server.metrics.uptime_sec)}`
                  : formatUptime(server.metrics?.uptime_sec)
                : '—'}
            </span>
          </div>
          <div>
            <span className="block text-[11px] font-sans text-[#697386]">Process</span>
            <span className="text-[#E2E8F0]">
              {isRunning && server.metrics?.pid
                ? `PID ${server.metrics.pid}`
                : `Exit ${server.last_exit_code ?? 0}`}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-[#181C24] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {server.status === 'running' || server.status === 'starting' || server.status === 'stopping' ? (
            <>
              <Button
                variant="danger"
                size="sm"
                disabled={!allowStop}
                loading={pendingAction === 'stopping'}
                onClick={() => onStop(server.id)}
                leftIcon={<Square className="w-3 h-3" />}
                aria-label={`Stop ${server.name}`}
              >
                Stop
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!allowRestart}
                loading={pendingAction === 'restarting'}
                onClick={() => onRestart(server.id)}
                leftIcon={<RotateCw className="w-3 h-3" />}
                aria-label={`Restart ${server.name}`}
              >
                Restart
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={!allowStart}
              loading={pendingAction === 'starting'}
              onClick={() => onStart(server.id)}
              leftIcon={<Play className="w-3 h-3 fill-current" />}
              aria-label={`Start ${server.name}`}
            >
              Start
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(server.id)}
            leftIcon={<Terminal className="w-3.5 h-3.5 text-emerald-400" />}
            aria-label={`Open ${server.name} console`}
          >
            Console
          </Button>
        </div>

        {onDelete && (
          <IconButton
            aria-label={`Delete ${server.name}`}
            size="sm"
            variant="ghost"
            disabled={Boolean(pendingAction)}
            onClick={() => onDelete(server)}
            icon={<Trash2 className="w-3.5 h-3.5 text-[#8A94A6] hover:text-red-400" />}
          />
        )}
      </div>
    </Card>
  );
};

export interface ActivityLogProps {
  items: ActivityLogModel[];
  limit?: number;
  onSelectServer?: (serverId: string) => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ items, limit, onSelectServer }) => {
  const slice = limit ? items.slice(0, limit) : items;

  if (slice.length === 0) {
    return (
      <div className="rounded-xl border border-[#1F242D] bg-[#0E1014] px-4 py-8 text-center text-xs text-[#697386]">
        No audit activity recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1F242D] bg-[#0E1014] divide-y divide-[#181C24] overflow-hidden">
      {slice.map((entry) => {
        const icon =
          entry.status === 'failed' ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          ) : entry.status === 'warning' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          );

        return (
          <div
            key={entry.id}
            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#12151B] transition-colors duration-100"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {icon}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium text-[#F3F5F8]">{entry.action}</span>
                  {entry.server_id && (
                    onSelectServer ? (
                      <button
                        type="button"
                        onClick={() => onSelectServer(entry.server_id)}
                        className={`font-mono text-[11px] text-emerald-400 hover:underline ${focusRingClasses} rounded`}
                      >
                        {entry.server_id}
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] text-[#8A94A6]">{entry.server_id}</span>
                    )
                  )}
                </div>
                <p className="text-xs text-[#A2AAB8] mt-0.5 break-words">{entry.details}</p>
              </div>
            </div>

            <span className="text-[11px] font-mono text-[#697386] tabular-nums whitespace-nowrap shrink-0">
              {formatTimestampFull(entry.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  scopeName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Unexpected UI rendering failure';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  public componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(`[NodePanel ErrorBoundary:${this.props.scopeName ?? 'root'}]`, error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onReset?.();
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          className="rounded-xl border border-red-500/30 bg-[#140D0F] p-6 space-y-3 text-xs text-[#F3F5F8] my-4"
        >
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Component error isolated ({this.props.scopeName ?? 'View'})</span>
          </div>
          <p className="text-[#A2AAB8] leading-relaxed">
            An unexpected error occurred in this section. Your running servers and supervisor processes were not affected.
          </p>
          {this.state.errorMessage && (
            <pre className="font-mono text-[11px] text-red-300 bg-[#0B0D10] border border-[#242A35] rounded-lg p-3 overflow-x-auto">
              {this.state.errorMessage}
            </pre>
          )}
          <div>
            <Button variant="secondary" size="sm" onClick={this.handleReset}>
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
