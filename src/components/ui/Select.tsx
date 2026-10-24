import React, { useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { focusRingClasses } from '../../styles/tokens';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  description?: string;
  error?: string;
  options?: SelectOption[];
  children?: React.ReactNode;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, description, error, options, children, id, required, className = '', containerClassName = '', ...rest }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const descId = description ? `${selectId}-desc` : undefined;
    const errorId = error ? `${selectId}-err` : undefined;
    const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`space-y-1.5 ${containerClassName}`.trim()}>
        {label && (
          <label htmlFor={selectId} className="block text-xs font-medium text-[#D0D7E2]">
            {label}
            {required && <span className="text-emerald-400 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={`w-full h-9 appearance-none bg-[#12151B] text-[#F3F5F8] text-xs sm:text-[13px] rounded-lg border pl-3 pr-8 transition-colors duration-150 ${
              error ? 'border-red-500/70' : 'border-[#262C36] hover:border-[#363E4C]'
            } ${focusRingClasses} disabled:opacity-50 disabled:cursor-not-allowed ${className}`.trim()}
            {...rest}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-[#12151B] text-[#F3F5F8]">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown
            className="w-3.5 h-3.5 text-[#8A94A6] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
        </div>

        {description && !error && (
          <p id={descId} className="text-[11px] text-[#697386]">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-[11px] text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  description?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, description, id, checked, disabled, className = '', ...rest }) => {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={`flex items-start gap-2.5 select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`.trim()}
    >
      <span className="relative flex items-center justify-center mt-0.5 shrink-0">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="peer absolute inset-0 w-4 h-4 opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors duration-150 bg-[#12151B] border-[#323A48] peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/80 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#08090B]`}
          aria-hidden="true"
        >
          {checked && <Check className="w-3 h-3 text-[#05120D] stroke-[3]" />}
        </span>
      </span>
      <span className="space-y-0.5">
        <span className="block text-xs font-medium text-[#E2E8F0]">{label}</span>
        {description && <span className="block text-[11px] text-[#697386]">{description}</span>}
      </span>
    </label>
  );
};

export interface RadioCardOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

export interface RadioGroupProps<T extends string = string> {
  label?: string;
  name: string;
  value: T;
  options: RadioCardOption<T>[];
  onChange: (value: T) => void;
  columns?: 1 | 2;
}

export function RadioGroup<T extends string = string>({
  label,
  name,
  value,
  options,
  onChange,
  columns = 2,
}: RadioGroupProps<T>) {
  return (
    <fieldset className="space-y-2">
      {label && <legend className="text-xs font-medium text-[#D0D7E2]">{label}</legend>}
      <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {options.map((opt) => {
          const isChecked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`relative flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors duration-150 ${
                isChecked
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-[#F3F5F8]'
                  : 'bg-[#12151B] border-[#242A35] text-[#A2AAB8] hover:border-[#343C4B]'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={isChecked}
                onChange={() => onChange(opt.value)}
                className="peer absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              />
              <span
                className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                  isChecked ? 'border-emerald-400' : 'border-[#4B5565]'
                } peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/80`}
                aria-hidden="true"
              >
                {isChecked && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-[#F3F5F8]">{opt.label}</span>
                {opt.description && (
                  <span className="block text-[11px] text-[#8A94A6] mt-0.5 leading-snug">{opt.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'sm',
}) => {
  const id = useId();
  const trackClasses = size === 'sm' ? 'w-8 h-4.5' : 'w-9 h-5';
  const thumbClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const translateClass = size === 'sm' ? 'translate-x-3.5' : 'translate-x-4';

  return (
    <div className="inline-flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex items-center shrink-0 rounded-full border transition-colors duration-150 ${trackClasses} ${
          checked ? 'bg-emerald-500 border-emerald-400/50' : 'bg-[#1A1E26] border-[#2E3644]'
        } ${focusRingClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block rounded-full bg-[#F8FAFC] transition-transform duration-150 transform ${thumbClasses} ${
            checked ? translateClass : 'translate-x-0.5'
          }`}
        />
      </button>
      <label
        htmlFor={id}
        className={`text-xs font-medium text-[#D0D7E2] select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      >
        <span>{label}</span>
        {description && <span className="block text-[11px] font-normal text-[#697386]">{description}</span>}
      </label>
    </div>
  );
};
