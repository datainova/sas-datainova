import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react';

type FeatureFlagContextValue = {
  flags: string[];
  isEnabled: (flag: string) => boolean;
  enableFlag: (flag: string) => void;
  disableFlag: (flag: string) => void;
  setFlags: (flags: string[]) => void;
};

const FeatureFlagContext = createContext<FeatureFlagContextValue | undefined>(undefined);

type FeatureFlagProviderProps = {
  children: ReactNode;
  initialFlags?: string[];
};

export const FeatureFlagProvider = ({ children, initialFlags = [] }: FeatureFlagProviderProps) => {
  const [flags, setFlags] = useState<string[]>(initialFlags);

  const isEnabled = useCallback(
    (flag: string) => flags.includes(flag),
    [flags]
  );

  const enableFlag = useCallback((flag: string) => {
    setFlags((current) => (current.includes(flag) ? current : [...current, flag]));
  }, []);

  const disableFlag = useCallback((flag: string) => {
    setFlags((current) => current.filter((item) => item !== flag));
  }, []);

  const replaceFlags = useCallback((nextFlags: string[]) => {
    setFlags(nextFlags);
  }, []);

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags,
      isEnabled,
      enableFlag,
      disableFlag,
      setFlags: replaceFlags
    }),
    [flags, isEnabled, enableFlag, disableFlag, replaceFlags]
  );

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
};

export const useFeatureFlagsContext = () => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlagsContext must be used within FeatureFlagProvider');
  }
  return context;
};
