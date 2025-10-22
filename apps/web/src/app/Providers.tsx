import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createQueryClient } from '../core/query/createQueryClient';
import { AuthProvider } from '../core/auth/auth-context';
import { ThemeProvider } from '../core/theme/theme-provider';
import { FeatureFlagProvider } from '../core/feature-flags/feature-flags-context';
import { useFeatureFlags } from '../core/feature-flags/use-feature-flags';
import { useAuth } from '../core/auth/use-auth';
import { useEffect, useState } from 'react';
import { I18nProvider } from '../core/i18n/I18nProvider';
import { ToastProvider } from '../design-system/feedback/ToastProvider';
import { ToastViewport } from '../design-system/feedback/ToastViewport';

type ProvidersProps = {
  children: ReactNode;
};

export const Providers = ({ children }: ProvidersProps) => {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <I18nProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <FeatureFlagProvider>
              <FeatureFlagSync />
              <ToastProvider>
                <ToastViewport />
                <BrowserRouter>{children}</BrowserRouter>
              </ToastProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nProvider>
  );
};

const FeatureFlagSync = () => {
  const { user } = useAuth();
  const { setFlags } = useFeatureFlags();

  useEffect(() => {
    setFlags(user?.featureFlags ?? []);
  }, [setFlags, user?.featureFlags]);

  return null;
};
