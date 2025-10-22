import { useId } from 'react';
import { Input } from './Input';

export type DateRange = {
  start: string;
  end: string;
};

type DateRangePickerProps = {
  label?: string;
  description?: string;
  error?: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
};

export const DateRangePicker = ({ label, description, error, value, onChange, min, max, disabled }: DateRangePickerProps) => {
  const startId = useId();
  const endId = useId();

  return (
    <div className="space-y-2 text-sm text-[rgba(45,41,38,0.78)] dark:text-[rgba(230,224,220,0.85)]">
      {label ? (
        <span className="block font-medium text-[color:var(--color-fg)] dark:text-[rgba(230,224,220,0.95)]">
          {label}
        </span>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          id={startId}
          type="date"
          value={value.start}
          onChange={(event) => onChange({ ...value, start: event.target.value })}
          min={min}
          max={value.end || max}
          disabled={disabled}
          label="Início"
          error={error}
        />
        <Input
          id={endId}
          type="date"
          value={value.end}
          onChange={(event) => onChange({ ...value, end: event.target.value })}
          min={value.start || min}
          max={max}
          disabled={disabled}
          label="Fim"
          error={error}
        />
      </div>
      {description ? (
        <p className="text-xs text-[rgba(45,41,38,0.6)] dark:text-[rgba(230,224,220,0.65)]">{description}</p>
      ) : null}
    </div>
  );
};
