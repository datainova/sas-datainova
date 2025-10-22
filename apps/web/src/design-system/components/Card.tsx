import type { ReactNode } from 'react';
import clsx from 'clsx';

type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'success' | 'info' | 'warning' | 'danger';
};

const toneClasses: Record<Required<CardProps>['tone'], string> = {
  default:
    'border border-border bg-white text-[color:var(--color-fg)] dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.92)]',
  success:
    'border border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-200 dark:border-success-500/40',
  info: 'border border-info/30 bg-info/10 text-info dark:text-info',
  warning:
    'border border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-200 dark:border-warning-500/40',
  danger:
    'border border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-200 dark:border-danger-500/40'
};

export const Card = ({ title, subtitle, actions, children, className, tone = 'default' }: CardProps) => (
  <section
    className={clsx(
      'rounded-3xl p-8 shadow-soft transition duration-200 ease-brand',
      toneClasses[tone],
      className
    )}
  >
    {(title || actions) && (
      <header className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          {title ? (
            <h2 className="text-xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p className="text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
    )}
    {children}
  </section>
);
