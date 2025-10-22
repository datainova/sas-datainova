import { useEffect, useRef } from 'react';

type AutosaveOptions = {
  delay?: number;
  enabled?: boolean;
};

export const useAutosave = <TValue>(
  value: TValue,
  onSave: (value: TValue) => void | Promise<void>,
  options: AutosaveOptions = {}
) => {
  const { delay = 600, enabled = true } = options;
  const firstRun = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;
  const serialized = JSON.stringify(value);

  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void Promise.resolve(onSave(valueRef.current)).catch((error) => {
        console.error('Autosave failed', error);
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [serialized, delay, enabled, onSave]);
};
