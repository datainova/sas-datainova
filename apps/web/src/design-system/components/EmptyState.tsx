import type { ReactNode } from 'react';
import { Button } from './Button';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  illustration?: ReactNode;
};

export const EmptyState = ({ title, description, action, illustration }: EmptyStateProps) => (
  <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-muted p-12 text-center text-sm text-[rgba(45,41,38,0.7)] dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.7)] dark:text-[rgba(230,224,220,0.7)]">
    {illustration}
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
        {title}
      </h3>
      <p>{description}</p>
    </div>
    {action ? (
      <Button onClick={action.onClick} variant="primary">
        {action.label}
      </Button>
    ) : null}
  </div>
);
