import React, { useRef } from 'react';
import { focusRingClasses } from '../../styles/tokens';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = 'Section tabs',
  size = 'md',
  fullWidth = false,
  className = '',
}: TabsProps<T>) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledIndices = items
      .map((item, idx) => (item.disabled ? -1 : idx))
      .filter((idx) => idx >= 0);

    if (enabledIndices.length === 0) return;
    const pos = enabledIndices.indexOf(currentIndex);
    if (pos === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = enabledIndices[(pos + 1) % enabledIndices.length];
    } else if (event.key === 'ArrowLeft') {
      nextIndex = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
    } else if (event.key === 'Home') {
      nextIndex = enabledIndices[0];
    } else if (event.key === 'End') {
      nextIndex = enabledIndices[enabledIndices.length - 1];
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const targetItem = items[nextIndex];
      onChange(targetItem.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1 p-1 rounded-lg bg-[#0E1014] border border-[#1F242D] overflow-x-auto max-w-full ${
        fullWidth ? 'w-full' : ''
      } ${className}`.trim()}
    >
      {items.map((item, index) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-md font-medium transition-colors duration-150 ${
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs sm:text-[13px]'
            } ${fullWidth ? 'flex-1' : ''} ${
              isActive
                ? 'bg-[#1B1F27] text-[#F3F5F8] border border-[#2E3644]'
                : 'text-[#8A94A6] hover:text-[#E2E8F0] hover:bg-[#14171D] border border-transparent'
            } ${focusRingClasses} ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {item.icon && (
              <span className={isActive ? 'text-emerald-400 shrink-0' : 'text-[#697386] shrink-0'}>
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`text-[11px] font-mono tabular-nums ${
                  isActive ? 'text-emerald-400' : 'text-[#697386]'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
