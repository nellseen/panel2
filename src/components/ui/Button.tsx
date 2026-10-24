import React from 'react';
import { Loader2 } from 'lucide-react';
import { focusRingClasses } from '../../styles/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500 text-[#05120D] font-semibold hover:bg-emerald-400 active:bg-emerald-500 border border-emerald-400/40',
  secondary:
    'bg-[#161A22] text-[#F3F5F8] font-medium hover:bg-[#1E232D] active:bg-[#161A22] border border-[#2B313D]',
  outline:
    'bg-transparent text-[#D0D7E2] font-medium hover:bg-[#14171D] hover:text-[#F3F5F8] border border-[#2B313D]',
  ghost:
    'bg-transparent text-[#A2AAB8] font-medium hover:bg-[#14171D] hover:text-[#F3F5F8] border border-transparent',
  danger:
    'bg-red-500/12 text-red-300 font-medium hover:bg-red-500/20 hover:text-red-200 border border-red-500/30',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-xs sm:text-[13px] gap-2 rounded-lg',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      type = 'button',
      className = '',
      onClick,
      children,
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onClick={handleClick}
        className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 select-none transition-colors duration-150 ${focusRingClasses} ${
          VARIANT_CLASSES[variant]
        } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${
          isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        } ${className}`.trim()}
        {...rest}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon && <span className="shrink-0 inline-flex items-center">{leftIcon}</span>
        )}
        {children && <span className="truncate">{children}</span>}
        {!loading && rightIcon && <span className="shrink-0 inline-flex items-center">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  'aria-label': string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon: React.ReactNode;
}

const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-9 w-9 rounded-lg',
  lg: 'h-10 w-10 rounded-lg',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      type = 'button',
      className = '',
      onClick,
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        onClick={(e) => {
          if (isDisabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        className={`inline-flex items-center justify-center shrink-0 select-none transition-colors duration-150 ${focusRingClasses} ${
          VARIANT_CLASSES[variant]
        } ${ICON_SIZE_CLASSES[size]} ${
          isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'
        } ${className}`.trim()}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
