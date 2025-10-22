import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  description?: string;
  error?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, description, error, className, leadingIcon, trailingIcon, id, ...props }, ref) => {
    const fieldId = id ?? props.name;
    const describedBy = error ? `${fieldId}-error` : description ? `${fieldId}-description` : undefined;

    return (
      <label className="block space-y-2 text-left text-sm text-[rgba(45,41,38,0.78)] dark:text-[rgba(230,224,220,0.85)]" htmlFor={fieldId}>
        {label ? <span className="font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">{label}</span> : null}
        <div
          className={clsx(
            'flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-[color:var(--color-fg)] transition duration-200 ease-brand focus-within:border-brand focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-white dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.92)] dark:focus-within:ring-offset-[rgba(18,18,18,0.9)]',
            error && 'border-danger-500 focus-within:border-danger-500 focus-within:ring-danger-500',
            className
          )}
        >
          {leadingIcon ? <span className="text-[rgba(45,41,38,0.45)] dark:text-[rgba(230,224,220,0.55)]">{leadingIcon}</span> : null}
          <input
            ref={ref}
            id={fieldId}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className="flex-1 bg-transparent text-sm text-[color:var(--color-fg)] outline-none placeholder:text-[rgba(45,41,38,0.45)] dark:text-[rgba(230,224,220,0.92)] dark:placeholder:text-[rgba(230,224,220,0.5)]"
            {...props}
          />
          {trailingIcon ? <span className="text-[rgba(45,41,38,0.45)] dark:text-[rgba(230,224,220,0.55)]">{trailingIcon}</span> : null}
        </div>
        {description && !error ? (
          <p id={describedBy} className="text-xs text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">
            {description}
          </p>
        ) : null}
        {error ? (
          <p id={`${fieldId}-error`} className="text-xs text-danger-500">
            {error}
          </p>
        ) : null}
      </label>
    );
  }
);

Input.displayName = 'Input';
