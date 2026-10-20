import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./cx";

interface FieldShellProps {
  id: string;
  label?: ReactNode;
  error?: string;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FieldShell({ id, label, error, helper, children, className }: FieldShellProps) {
  return (
    <div className={cx("mb-3", className)}>
      {label ? (
        <label htmlFor={id} className="editorial-label block mb-1.5">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <div id={`${id}-error`} role="alert" className="text-xs text-persimmon font-semibold mt-1">
          {error}
        </div>
      ) : helper ? (
        <div id={`${id}-helper`} className="text-xs text-fog font-medium mt-1">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, helper?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (helper) return `${id}-helper`;
  return undefined;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  helper?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, className, wrapperClassName, id, ...rest }, ref) => {
    const auto = useId();
    const inputId = id || auto;
    return (
      <FieldShell id={inputId} label={label} error={error} helper={helper} className={wrapperClassName}>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, helper)}
          className={cx("pl-input", error && "error", className)}
          {...rest}
        />
      </FieldShell>
    );
  },
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  helper?: ReactNode;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helper, className, wrapperClassName, id, rows = 4, ...rest }, ref) => {
    const auto = useId();
    const inputId = id || auto;
    return (
      <FieldShell id={inputId} label={label} error={error} helper={helper} className={wrapperClassName}>
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, helper)}
          className={cx("pl-input resize-y", error && "error", className)}
          {...rest}
        />
      </FieldShell>
    );
  },
);
Textarea.displayName = "Textarea";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  helper?: ReactNode;
  options: SelectOption[];
  placeholder?: string;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helper, className, wrapperClassName, id, options, placeholder, children, ...rest }, ref) => {
    const auto = useId();
    const selectId = id || auto;
    return (
      <FieldShell id={selectId} label={label} error={error} helper={helper} className={wrapperClassName}>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(selectId, error, helper)}
          className={cx("pl-input", error && "error", className)}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
          {children}
        </select>
      </FieldShell>
    );
  },
);
Select.displayName = "Select";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, ...rest }, ref) => (
    <label className={cx("flex items-start gap-3 cursor-pointer select-none", className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 h-4 w-4 accent-persimmon" {...rest} />
      <span>
        <span className="text-sm font-semibold">{label}</span>
        {description ? <span className="block text-xs text-fog mt-0.5">{description}</span> : null}
      </span>
    </label>
  ),
);
Checkbox.displayName = "Checkbox";
