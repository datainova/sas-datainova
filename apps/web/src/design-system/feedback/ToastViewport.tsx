import { useToastContext } from './ToastProvider';

const variantStyles = {
  info: 'border border-info/30 bg-info/10 text-info',
  success: 'border border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-100',
  warning: 'border border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-100',
  error: 'border border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-100'
} as const;

export const ToastViewport = () => {
  const { toasts, dismissToast } = useToastContext();

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 shadow-elevated transition ${variantStyles[toast.variant ?? 'info']}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description ? <p className="mt-1 text-xs opacity-80">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-xs uppercase tracking-[0.16em] text-[rgba(45,41,38,0.65)] transition hover:text-brand dark:text-[rgba(230,224,220,0.7)] dark:hover:text-brand-foreground"
            >
              Fechar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
