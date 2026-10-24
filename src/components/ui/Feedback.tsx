import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Radio,
  WifiOff,
  X,
} from 'lucide-react';
import { ConnectionState, ServerStatus, ToastItem } from '../../types';
import { focusRingClasses } from '../../styles/tokens';
import { formatTimestampTime } from '../../utils/formatters';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'text-[#A2AAB8] bg-[#14171D] border-[#262C36]',
  success: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  warning: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  danger: 'text-red-300 bg-red-500/10 border-red-500/25',
  info: 'text-sky-300 bg-sky-500/10 border-sky-500/25',
};

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', mono = false, className = '', children }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap shrink-0 tabular-nums ${
      BADGE_TONES[tone]
    } ${mono ? 'font-mono' : ''} ${className}`.trim()}
  >
    {children}
  </span>
);

export interface StatusPillProps {
  status: ServerStatus;
  className?: string;
}

const STATUS_META: Record<
  ServerStatus,
  { label: string; dotClass: string; textClass: string; spinning?: boolean }
> = {
  running: {
    label: 'Running',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  },
  starting: {
    label: 'Starting',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    spinning: true,
  },
  stopping: {
    label: 'Stopping',
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300',
    spinning: true,
  },
  installing: {
    label: 'Installing',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-300',
    spinning: true,
  },
  stopped: {
    label: 'Stopped',
    dotClass: 'bg-[#697386]',
    textClass: 'text-[#A2AAB8]',
  },
  created: {
    label: 'Created',
    dotClass: 'bg-[#697386]',
    textClass: 'text-[#A2AAB8]',
  },
  crashed: {
    label: 'Crashed',
    dotClass: 'bg-red-400',
    textClass: 'text-red-400',
  },
  failed: {
    label: 'Failed',
    dotClass: 'bg-red-400',
    textClass: 'text-red-400',
  },
};

/**
 * Semantic status indicator pairing distinct icon/marker with explicit text label
 * (never conveys status by hue alone).
 */
export const StatusPill: React.FC<StatusPillProps> = ({ status, className = '' }) => {
  const cfg = STATUS_META[status] ?? STATUS_META.stopped;

  return (
    <span
      data-testid={`status-pill-${status}`}
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${cfg.textClass} ${className}`.trim()}
    >
      {cfg.spinning ? (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
      ) : status === 'crashed' || status === 'failed' ? (
        <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dotClass}`} aria-hidden="true" />
      )}
      <span>{cfg.label}</span>
    </span>
  );
};

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const ALERT_STYLES: Record<NonNullable<AlertProps['variant']>, { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'bg-[#11161F] border-[#243247] text-[#D0D7E2]',
    icon: <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />,
  },
  success: {
    box: 'bg-[#0C1814] border-emerald-500/30 text-[#D0D7E2]',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />,
  },
  warning: {
    box: 'bg-[#19140B] border-amber-500/30 text-[#E5DEC9]',
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />,
  },
  error: {
    box: 'bg-[#1A0E10] border-red-500/30 text-[#F2D6D8]',
    icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />,
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  action,
  onDismiss,
  className = '',
}) => {
  const style = ALERT_STYLES[variant];
  return (
    <div
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
      className={`rounded-lg border p-3.5 flex items-start justify-between gap-3 text-xs ${style.box} ${className}`.trim()}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {style.icon}
        <div className="space-y-0.5 min-w-0">
          {title && <div className="font-semibold text-[#F3F5F8]">{title}</div>}
          <div className="leading-relaxed text-xs">{children}</div>
        </div>
      </div>

      {(action || onDismiss) && (
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss alert"
              className={`p-1 rounded text-[#8A94A6] hover:text-[#F3F5F8] ${focusRingClasses}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface InlineErrorProps {
  message?: string | null;
  className?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({ message, className = '' }) => {
  if (!message) return null;
  return (
    <div role="alert" className={`flex items-center gap-1.5 text-xs text-red-400 ${className}`.trim()}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
};

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label = 'Loading', className = '' }) => {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
  return (
    <span role="status" aria-label={label} className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <Loader2 className={`${dim} animate-spin text-emerald-400`} aria-hidden="true" />
    </span>
  );
};

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full' }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse motion-reduce:animate-none rounded-md bg-[#181C24] ${className}`.trim()}
  />
);

export interface ProgressBarProps {
  value?: number; // 0..100; omit for indeterminate
  label?: string;
  tone?: 'emerald' | 'amber' | 'danger';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label = 'Progress',
  tone = 'emerald',
  className = '',
}) => {
  const fillHex =
    tone === 'danger' ? '#EF4444' : tone === 'amber' ? '#F59E0B' : '#10B981';
  const clamped = value !== undefined ? Math.max(0, Math.min(100, value)) : undefined;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped !== undefined ? Math.round(clamped) : undefined}
      className={`w-full h-1.5 rounded-full bg-[#181C24] overflow-hidden ${className}`.trim()}
    >
      {clamped !== undefined ? (
        <svg className="w-full h-full block" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
          <rect x="0" y="0" width={clamped} height="6" fill={fillHex} />
        </svg>
      ) : (
        <div className={`h-full w-1/3 animate-pulse rounded-full ${ tone === 'danger' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-500' }`} />
      )}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div
    className={`rounded-xl border border-dashed border-[#242A35] bg-[#0C0E12] px-6 py-10 text-center flex flex-col items-center justify-center ${className}`.trim()}
  >
    {icon && <div className="mb-3 text-[#697386]">{icon}</div>}
    <h3 className="text-sm font-semibold text-[#F3F5F8]">{title}</h3>
    <p className="text-xs text-[#8A94A6] max-w-md mt-1 leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export interface ConnectionStatusProps {
  state: ConnectionState;
  reconnectAttempt?: number;
  isStale?: boolean;
  lastUpdatedAt?: string | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  state,
  reconnectAttempt = 0,
  isStale = false,
  lastUpdatedAt,
}) => {
  if (isStale) {
    return (
      <span
        data-testid="connection-status"
        data-state="stale"
        title={lastUpdatedAt ? `Last synced at ${formatTimestampTime(lastUpdatedAt)}` : 'Backend unreachable'}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap shrink-0 tabular-nums"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Stale{lastUpdatedAt ? ` · ${formatTimestampTime(lastUpdatedAt)}` : ''}</span>
      </span>
    );
  }

  if (state === 'connected') {
    return (
      <span
        data-testid="connection-status"
        data-state="connected"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A2AAB8] whitespace-nowrap shrink-0"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
        <span>Realtime</span>
      </span>
    );
  }

  if (state === 'reconnecting' || state === 'connecting') {
    return (
      <span
        data-testid="connection-status"
        data-state={state}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 whitespace-nowrap shrink-0 tabular-nums"
      >
        <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
        <span>{state === 'connecting' ? 'Connecting' : `Reconnecting${reconnectAttempt > 0 ? ` (#${reconnectAttempt})` : ''}`}</span>
      </span>
    );
  }

  return (
    <span
      data-testid="connection-status"
      data-state="disconnected"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 whitespace-nowrap shrink-0"
    >
      <Radio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Disconnected</span>
    </span>
  );
};

export interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastViewport: React.FC<ToastViewportProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => {
        const icon =
          toast.variant === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
          ) : toast.variant === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          ) : toast.variant === 'info' ? (
            <Info className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          );

        return (
          <div
            key={toast.id}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto rounded-lg bg-[#12151B] border border-[#2B313D] shadow-2xl px-3.5 py-2.5 flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="mt-0.5">{icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#F3F5F8]">{toast.title}</p>
                {toast.description && (
                  <p className="text-[11px] text-[#A2AAB8] mt-0.5 leading-snug">{toast.description}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Close notification"
              className={`p-0.5 rounded text-[#8A94A6] hover:text-[#F3F5F8] ${focusRingClasses}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
