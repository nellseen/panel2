import React from 'react';

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  size?: 'xl' | 'lg' | 'md' | 'sm';
}

const HEADING_STYLES: Record<NonNullable<HeadingProps['size']>, string> = {
  xl: 'text-xl sm:text-2xl font-semibold tracking-tight text-[#F3F5F8] [text-wrap:balance]',
  lg: 'text-lg font-semibold tracking-tight text-[#F3F5F8] [text-wrap:balance]',
  md: 'text-base font-semibold tracking-tight text-[#F3F5F8]',
  sm: 'text-sm font-semibold text-[#F3F5F8]',
};

export const Heading: React.FC<HeadingProps> = ({
  as: Tag = 'h2',
  size = 'lg',
  className = '',
  children,
  ...rest
}) => {
  return (
    <Tag className={`${HEADING_STYLES[size]} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
};

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: 'p' | 'span' | 'div';
  tone?: 'primary' | 'secondary' | 'muted' | 'accent' | 'danger' | 'warning';
  size?: 'xs' | 'sm' | 'md';
  mono?: boolean;
  tabular?: boolean;
}

const TONE_STYLES: Record<NonNullable<TextProps['tone']>, string> = {
  primary: 'text-[#F3F5F8]',
  secondary: 'text-[#A2AAB8]',
  muted: 'text-[#697386]',
  accent: 'text-emerald-400',
  danger: 'text-red-400',
  warning: 'text-amber-400',
};

const TEXT_SIZE_STYLES: Record<NonNullable<TextProps['size']>, string> = {
  xs: 'text-xs leading-relaxed',
  sm: 'text-[13px] leading-relaxed',
  md: 'text-sm leading-relaxed',
};

export const Text: React.FC<TextProps> = ({
  as: Tag = 'p',
  tone = 'secondary',
  size = 'sm',
  mono = false,
  tabular = false,
  className = '',
  children,
  ...rest
}) => {
  return (
    <Tag
      className={`${TONE_STYLES[tone]} ${TEXT_SIZE_STYLES[size]} ${mono ? 'font-mono' : ''} ${
        tabular ? 'tabular-nums' : ''
      } ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export interface CodeTextProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const CodeText: React.FC<CodeTextProps> = ({ className = '', children, ...rest }) => (
  <code
    className={`font-mono text-xs text-[#E2E8F0] bg-[#14171D] border border-[#242A35] px-1.5 py-0.5 rounded ${className}`.trim()}
    {...rest}
  >
    {children}
  </code>
);

export interface MetaRowProps {
  items: Array<React.ReactNode | null | undefined | false>;
  className?: string;
}

/**
 * Renders unboxed static metadata items separated cleanly by subtle middle dots (·)
 * instead of decorative pill enclosures.
 */
export const MetaRow: React.FC<MetaRowProps> = ({ items, className = '' }) => {
  const valid = items.filter((item): item is React.ReactNode => Boolean(item));
  if (valid.length === 0) return null;

  return (
    <div className={`flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-[#8A94A6] tabular-nums ${className}`.trim()}>
      {valid.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <span aria-hidden="true" className="text-[#4B5565] select-none">
              ·
            </span>
          )}
          <span className="inline-flex items-center gap-1 min-w-0">{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
};
