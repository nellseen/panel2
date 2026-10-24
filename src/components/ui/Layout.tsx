import React from 'react';
import { Heading, Text } from './Typography';
import { focusRingClasses } from '../../styles/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

const PADDING_MAP: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  padding = 'md',
  interactive = false,
  className = '',
  children,
  ...rest
}) => (
  <div
    className={`rounded-xl bg-[#0E1014] border border-[#1F242D] ${PADDING_MAP[padding]} ${
      interactive
        ? `transition-colors duration-150 hover:border-[#2E3644] hover:bg-[#11141A] cursor-pointer ${focusRingClasses}`
        : ''
    } ${className}`.trim()}
    {...rest}
  >
    {children}
  </div>
);

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backAction?: React.ReactNode;
  meta?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  backAction,
  meta,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#1A1E26]">
    <div className="flex items-start gap-3 min-w-0">
      {backAction && <div className="mt-0.5 shrink-0">{backAction}</div>}
      <div className="min-w-0 space-y-1">
        <Heading as="h1" size="xl" className="truncate">
          {title}
        </Heading>
        {description && (
          <Text tone="secondary" size="sm" className="max-w-2xl">
            {description}
          </Text>
        )}
        {meta && <div className="pt-0.5">{meta}</div>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
  </div>
);

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-4 ${className}`.trim()}>
    <div className="min-w-0">
      <Heading as="h2" size="md">
        {title}
      </Heading>
      {description && (
        <Text tone="muted" size="xs" className="mt-0.5">
          {description}
        </Text>
      )}
    </div>
    {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
  </div>
);

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  tone?: 'default' | 'accent' | 'danger' | 'warning';
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sublabel,
  tone = 'default',
}) => {
  const valueTone =
    tone === 'accent'
      ? 'text-emerald-400'
      : tone === 'danger'
      ? 'text-red-400'
      : tone === 'warning'
      ? 'text-amber-400'
      : 'text-[#F3F5F8]';

  return (
    <Card padding="md" className="flex flex-col justify-between gap-2">
      <span className="text-xs font-medium text-[#8A94A6]">{label}</span>
      <div className={`text-2xl font-semibold tracking-tight font-mono tabular-nums ${valueTone}`}>
        {value}
      </div>
      {sublabel && <div className="text-xs text-[#697386] tabular-nums">{sublabel}</div>}
    </Card>
  );
};
