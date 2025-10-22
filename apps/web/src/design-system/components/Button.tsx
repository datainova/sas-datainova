import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
};

const baseStyles =
  'inline-flex items-center justify-center rounded-xl font-semibold transition ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[rgba(18,18,18,0.9)] disabled:cursor-not-allowed disabled:opacity-60';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-foreground shadow-soft hover:brightness-95 active:brightness-90 focus-visible:ring-offset-4',
  secondary:
    'border border-brand text-brand bg-transparent hover:bg-brand/10 hover:text-brand focus-visible:ring-offset-4 dark:border-brand-foreground dark:text-brand-foreground dark:hover:text-brand-foreground dark:hover:bg-brand-foreground/10',
  ghost:
    'border border-transparent bg-transparent text-[rgba(45,41,38,0.72)] hover:bg-[rgba(45,41,38,0.08)] dark:text-[rgba(230,224,220,0.84)] dark:hover:bg-[rgba(230,224,220,0.12)]',
  destructive:
    'bg-danger-500 text-white shadow-soft hover:brightness-95 active:brightness-90 focus-visible:ring-offset-4'
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, fullWidth, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        'ease-brand duration-200',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent opacity-60" />
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
);

Button.displayName = 'Button';
