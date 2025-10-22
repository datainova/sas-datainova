import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  'pt-BR': {
    common: {
      brand: 'DataInova Execução Estratégica',
      loading: 'Carregando...',
      error: 'Algo inesperado aconteceu',
      retry: 'Tentar novamente',
      continue: 'Continuar',
      back: 'Voltar',
      finish: 'Concluir',
      next: 'Avançar',
      cancel: 'Cancelar'
    },
    navigation: {
      home: 'Home',
      onboarding: 'Onboarding',
      objectives: 'Objetivos',
      objectiveWizard: 'Novo Objetivo',
      kresultWizard: 'Novo KResult',
      kpis: 'KPIs',
      alerts: 'Alertas',
      checkins: 'Check-ins',
      billing: 'Planos & Billing',
      agents: 'Agents',
      settings: 'Configurações'
    },
    onboarding: {
      title: 'Configuração inicial da sua empresa',
      subtitle: 'Leva menos de 2 minutos.',
      missionLabel: 'Missão',
      visionLabel: 'Visão'
    }
  },
  en: {
    common: {
      brand: 'DataInova Strategy Execution',
      loading: 'Loading...',
      error: 'Something went wrong',
      retry: 'Try again',
      continue: 'Continue',
      back: 'Back',
      finish: 'Finish',
      next: 'Next',
      cancel: 'Cancel'
    },
    navigation: {
      home: 'Home',
      onboarding: 'Onboarding',
      objectives: 'Objectives',
      objectiveWizard: 'New Objective',
      kresultWizard: 'New KResult',
      kpis: 'KPIs',
      alerts: 'Alerts',
      checkins: 'Check-ins',
      billing: 'Plans & Billing',
      agents: 'Agents',
      settings: 'Settings'
    },
    onboarding: {
      title: 'Initial organization setup',
      subtitle: 'It takes less than 2 minutes.',
      missionLabel: 'Mission',
      visionLabel: 'Vision'
    }
  }
} as const;

export const initI18n = () => {
  if (i18n.isInitialized) {
    return i18n;
  }

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: 'pt-BR',
      supportedLngs: ['pt-BR', 'en'],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false
      },
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage']
      }
    });

  return i18n;
};
