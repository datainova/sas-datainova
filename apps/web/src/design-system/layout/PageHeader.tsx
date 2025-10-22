import type { ReactNode } from 'react';
import clsx from 'clsx';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export const PageHeader = ({ eyebrow, title, description, actions, className }: PageHeaderProps) => (
  <header
    className={clsx(
      'rounded-3xl border border-border bg-white p-8 shadow-soft backdrop-blur dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)]',
      className
    )}
  >
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="space-y-3">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand">{eyebrow}</p>
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  </header>
);
