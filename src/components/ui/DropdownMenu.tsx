import React, { useEffect, useId, useRef, useState } from 'react';
import { focusRingClasses } from '../../styles/tokens';

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
  onSelect?: () => void;
}

export interface DropdownMenuProps {
  trigger: React.ReactElement<{
    onClick?: (e: React.MouseEvent) => void;
    'aria-haspopup'?: 'menu';
    'aria-expanded'?: boolean;
  }>;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  header?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  items,
  align = 'right',
  header,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledIndices = items.map((i, idx) => (i.disabled ? -1 : idx)).filter((idx) => idx >= 0);
    if (enabledIndices.length === 0) return;

    const activeIdx = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabledIndices.indexOf(activeIdx);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = enabledIndices[(pos + 1) % enabledIndices.length];
      itemRefs.current[next]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
      itemRefs.current[prev]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      {React.cloneElement(trigger, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          trigger.props.onClick?.(e);
          setOpen((prev) => !prev);
        },
      })}

      {open && (
        <div
          role="menu"
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-50 mt-1 top-full min-w-[176px] rounded-lg bg-[#12151B] border border-[#2B313D] shadow-2xl p-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {header && (
            <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#8A94A6] border-b border-[#1F242D] truncate mb-1">
              {header}
            </div>
          )}
          {items.map((item, idx) => {
            const commonClasses = `w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors duration-100 ${focusRingClasses} ${
              item.danger
                ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200'
                : 'text-[#E2E8F0] hover:bg-[#1B1F27] hover:text-[#F3F5F8]'
            } ${item.disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`;

            if (item.href && !item.disabled) {
              return (
                <a
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  role="menuitem"
                  href={item.href}
                  download={item.download}
                  onClick={() => {
                    item.onSelect?.();
                    setOpen(false);
                  }}
                  className={commonClasses}
                >
                  {item.icon && <span className="shrink-0">{item.icon}</span>}
                  <span className="truncate">{item.label}</span>
                </a>
              );
            }

            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={commonClasses}
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface TooltipProps {
  content: string;
  children: React.ReactElement<{
    'aria-describedby'?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }>;
  side?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {React.cloneElement(children, {
        'aria-describedby': visible ? tooltipId : undefined,
      })}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-md bg-[#1B1F27] border border-[#2E3644] px-2 py-1 text-[11px] font-medium text-[#F3F5F8] shadow-lg ${
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {content}
        </span>
      )}
    </span>
  );
};
