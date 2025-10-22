import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  description?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, description, error, id, className, ...props }, ref) => {
    const fieldId = id ?? props.name;
    const describedBy = error ? `${fieldId}-error` : description ? `${fieldId}-description` : undefined;

    return (
      <label
        className="block space-y-2 text-left text-sm text-[rgba(45,41,38,0.78)] dark:text-[rgba(230,224,220,0.85)]"
        htmlFor={fieldId}
      >
        {label ? (
          <span className="font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">{label}</span>
        ) : null}
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={clsx(
            'min-h-[120px] w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-[color:var(--color-fg)] shadow-soft transition duration-200 ease-brand placeholder:text-[rgba(45,41,38,0.45)] focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 focus:ring-offset-white dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.92)] dark:focus:ring-offset-[rgba(18,18,18,0.9)]',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500',
            className
          )}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
