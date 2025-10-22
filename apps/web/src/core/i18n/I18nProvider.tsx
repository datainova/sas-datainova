import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { initI18n } from './i18n';

const i18nInstance = initI18n();

type I18nProviderProps = {
  children: ReactNode;
};

export const I18nProvider = ({ children }: I18nProviderProps) => (
  <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
);
