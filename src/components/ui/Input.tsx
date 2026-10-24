import React, { useId, useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';
import { focusRingClasses } from '../../styles/tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  mono?: boolean;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      description,
      error,
      mono = false,
      leftAddon,
      rightAddon,
      id,
      required,
      className = '',
      containerClassName = '',
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descId = description ? `${inputId}-desc` : undefined;
    const errorId = error ? `${inputId}-err` : undefined;
    const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`space-y-1.5 ${containerClassName}`.trim()}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#D0D7E2]">
            {label}
            {required && <span className="text-emerald-400 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leftAddon && (
            <span className="absolute left-3 text-[#697386] pointer-events-none inline-flex items-center">
              {leftAddon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={`w-full h-9 bg-[#12151B] text-[#F3F5F8] placeholder-[#5B6475] text-xs sm:text-[13px] rounded-lg border transition-colors duration-150 ${
              error ? 'border-red-500/70 focus-visible:ring-red-500/70' : 'border-[#262C36] hover:border-[#363E4C]'
            } ${focusRingClasses} ${leftAddon ? 'pl-9' : 'px-3'} ${rightAddon ? 'pr-9' : 'px-3'} ${
              mono ? 'font-mono' : ''
            } disabled:opacity-50 disabled:cursor-not-allowed ${className}`.trim()}
            {...rest}
          />
          {rightAddon && (
            <span className="absolute right-2.5 text-[#8A94A6] inline-flex items-center">
              {rightAddon}
            </span>
          )}
        </div>

        {description && !error && (
          <p id={descId} className="text-[11px] text-[#697386] leading-relaxed">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-[11px] text-red-400 leading-relaxed">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'rightAddon'> {
  defaultRevealed?: boolean;
  revealed?: boolean;
  onRevealChange?: (revealed: boolean) => void;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ defaultRevealed = false, revealed, onRevealChange, ...rest }, ref) => {
    const [internalRevealed, setInternalRevealed] = useState(defaultRevealed);
    const isRevealed = revealed !== undefined ? revealed : internalRevealed;

    const toggle = () => {
      const next = !isRevealed;
      if (revealed === undefined) {
        setInternalRevealed(next);
      }
      onRevealChange?.(next);
    };

    return (
      <Input
        ref={ref}
        type={isRevealed ? 'text' : 'password'}
        rightAddon={
          <button
            type="button"
            onClick={toggle}
            aria-label={isRevealed ? 'Hide secret value' : 'Show secret value'}
            className={`p-1 rounded text-[#8A94A6] hover:text-[#F3F5F8] ${focusRingClasses}`}
          >
            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        }
        {...rest}
      />
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
  mono?: boolean;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, description, error, mono = false, id, required, className = '', containerClassName = '', ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descId = description ? `${inputId}-desc` : undefined;
    const errorId = error ? `${inputId}-err` : undefined;
    const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`space-y-1.5 ${containerClassName}`.trim()}>
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#D0D7E2]">
            {label}
            {required && <span className="text-emerald-400 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={`w-full bg-[#12151B] text-[#F3F5F8] placeholder-[#5B6475] text-xs sm:text-[13px] rounded-lg border px-3 py-2 transition-colors duration-150 ${
            error ? 'border-red-500/70 focus-visible:ring-red-500/70' : 'border-[#262C36] hover:border-[#363E4C]'
          } ${focusRingClasses} ${mono ? 'font-mono' : ''} disabled:opacity-50 disabled:cursor-not-allowed ${className}`.trim()}
          {...rest}
        />

        {description && !error && (
          <p id={descId} className="text-[11px] text-[#697386] leading-relaxed">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-[11px] text-red-400 leading-relaxed">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export interface SearchInputProps extends Omit<InputProps, 'leftAddon' | 'rightAddon' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  'aria-label': ariaLabel = 'Search',
  ...rest
}) => {
  return (
    <Input
      type="search"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      leftAddon={<Search className="w-3.5 h-3.5" aria-hidden="true" />}
      rightAddon={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className={`p-0.5 rounded text-[#8A94A6] hover:text-[#F3F5F8] ${focusRingClasses}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
};
