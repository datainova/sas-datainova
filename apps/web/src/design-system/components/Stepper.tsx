import clsx from 'clsx';

export type StepDescriptor = {
  id: string;
  label: string;
  description?: string;
  status?: 'completed' | 'current' | 'upcoming' | 'error';
};

type StepperProps = {
  steps: StepDescriptor[];
  current: number;
  onStepSelect?: (index: number) => void;
  allowNavigation?: boolean;
};

export const Stepper = ({ steps, current, onStepSelect, allowNavigation = false }: StepperProps) => (
  <nav className="flex flex-col gap-3" aria-label="Progresso do assistente">
    <ol className="flex flex-wrap items-center gap-3">
      {steps.map((step, index) => {
        const status = step.status ?? (index < current ? 'completed' : index === current ? 'current' : 'upcoming');
        const isInteractive = allowNavigation && index <= current && Boolean(onStepSelect);

        return (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => isInteractive && onStepSelect?.(index)}
              disabled={!isInteractive}
              className={clsx(
                'flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] transition duration-200 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[rgba(18,18,18,0.9)] disabled:cursor-default disabled:opacity-60',
                status === 'completed' && 'border-brand bg-brand/10 text-brand dark:text-brand-foreground',
                status === 'current' && 'border-brand bg-brand text-brand-foreground shadow-soft',
                status === 'upcoming' &&
                  'border-border bg-muted text-[rgba(45,41,38,0.6)] dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.6)] dark:text-[rgba(230,224,220,0.6)]',
                status === 'error' && 'border-danger-500/60 bg-danger-500/10 text-danger-600 dark:text-danger-200',
                isInteractive && 'cursor-pointer hover:border-brand hover:bg-brand/10 hover:text-brand'
              )}
              aria-current={status === 'current'}
            >
              <span className="rounded-full border border-border bg-white px-2 py-1 text-[10px] font-semibold text-[color:var(--color-fg)] dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.92)]">
                {index + 1}
              </span>
              <span>{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);
