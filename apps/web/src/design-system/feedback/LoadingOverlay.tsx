import type { ReactNode } from 'react';

type LoadingOverlayProps = {
  label?: string;
  children?: ReactNode;
};

export const LoadingOverlay = ({ label = 'Carregando...', children }: LoadingOverlayProps) => (
  <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-muted p-6 text-sm text-[rgba(45,41,38,0.7)] dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.7)] dark:text-[rgba(230,224,220,0.7)]">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    <p>{label}</p>
    {children}
  </div>
);
