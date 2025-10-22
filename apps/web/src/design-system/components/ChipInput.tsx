import { useState, KeyboardEvent } from 'react';
import clsx from 'clsx';

type ChipInputProps = {
  label?: string;
  description?: string;
  error?: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
};

export const ChipInput = ({
  label,
  description,
  error,
  values,
  onChange,
  suggestions = [],
  placeholder = 'Digite um valor e pressione Enter'
}: ChipInputProps) => {
  const [draft, setDraft] = useState('');

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    if (values.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === ',') {
      event.preventDefault();
      handleSubmit();
    }
    if (event.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  const removeValue = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="space-y-2 text-sm text-[rgba(45,41,38,0.78)] dark:text-[rgba(230,224,220,0.85)]">
      {label ? (
        <span className="block font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">{label}</span>
      ) : null}
      <div
        className={clsx(
          'flex min-h-[56px] flex-wrap items-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 transition duration-200 ease-brand focus-within:border-brand focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-white dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.85)] dark:focus-within:ring-offset-[rgba(18,18,18,0.9)]',
          error && 'border-danger-500 focus-within:border-danger-500 focus-within:ring-danger-500'
        )}
      >
        {values.map((value) => (
          <span
            key={value}
            className="flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs text-brand"
          >
            {value}
            <button
              type="button"
              onClick={() => removeValue(value)}
              className="text-brand transition hover:text-brand-foreground"
              aria-label={`Remover ${value}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-[color:var(--color-fg)] outline-none placeholder:text-[rgba(45,41,38,0.45)] dark:text-[rgba(230,224,220,0.92)] dark:placeholder:text-[rgba(230,224,220,0.5)]"
        />
      </div>
      {description && !error ? (
        <p className="text-xs text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">{description}</p>
      ) : null}
      {error ? <p className="text-xs text-danger-500">{error}</p> : null}

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">
          <span className="uppercase tracking-[0.16em] text-[rgba(45,41,38,0.45)] dark:text-[rgba(230,224,220,0.55)]">
            Sugestões:
          </span>
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => {
                if (values.includes(suggestion)) return;
                onChange([...values, suggestion]);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs transition hover:border-brand hover:text-brand"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
