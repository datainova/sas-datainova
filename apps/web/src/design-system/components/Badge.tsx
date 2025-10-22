import type { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeTone = 'default' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

const toneStyles: Record<BadgeTone, string> = {
  default:
    'border border-border bg-muted text-[rgba(45,41,38,0.8)] dark:text-[rgba(230,224,220,0.85)] dark:border-[rgba(230,224,220,0.24)]',
  info: 'border border-info/30 bg-info/10 text-info',
  success: 'border border-success-500/30 bg-success-500/10 text-success-600 dark:text-success-200',
  warning: 'border border-warning-500/30 bg-warning-500/10 text-warning-600 dark:text-warning-200',
  danger: 'border border-danger-500/30 bg-danger-500/10 text-danger-600 dark:text-danger-200',
  muted: 'border border-border bg-transparent text-[rgba(45,41,38,0.56)] dark:text-[rgba(230,224,220,0.7)]'
};

export const Badge = ({ children, tone = 'default', className }: BadgeProps) => (
  <span
    className={clsx(
      'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.12em]',
      toneStyles[tone],
      className
    )}
  >
    {children}
  </span>
);
