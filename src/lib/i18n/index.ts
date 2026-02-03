import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import locale files
import ptBRCommon from '@/locales/pt-BR/common.json';
import ptBRNav from '@/locales/pt-BR/nav.json';
import ptBRAuth from '@/locales/pt-BR/auth.json';
import ptBRErrors from '@/locales/pt-BR/errors.json';
import ptBRActions from '@/locales/pt-BR/actions.json';
import ptBRSettings from '@/locales/pt-BR/settings.json';
import ptBRDashboard from '@/locales/pt-BR/dashboard.json';
import ptBRSeed from '@/locales/pt-BR/seed.json';
import ptBRShipping from '@/locales/pt-BR/shipping.json';
import ptBRUtilities from '@/locales/pt-BR/utilities.json';
import ptBRProducts from '@/locales/pt-BR/products.json';
import ptBRLanding from '@/locales/pt-BR/landing.json';

import enCommon from '@/locales/en/common.json';
import enNav from '@/locales/en/nav.json';
import enAuth from '@/locales/en/auth.json';
import enErrors from '@/locales/en/errors.json';
import enActions from '@/locales/en/actions.json';
import enSettings from '@/locales/en/settings.json';
import enDashboard from '@/locales/en/dashboard.json';
import enSeed from '@/locales/en/seed.json';
import enShipping from '@/locales/en/shipping.json';
import enUtilities from '@/locales/en/utilities.json';
import enProducts from '@/locales/en/products.json';
import enLanding from '@/locales/en/landing.json';

import esCommon from '@/locales/es/common.json';
import esNav from '@/locales/es/nav.json';
import esAuth from '@/locales/es/auth.json';
import esErrors from '@/locales/es/errors.json';
import esActions from '@/locales/es/actions.json';
import esSettings from '@/locales/es/settings.json';
import esDashboard from '@/locales/es/dashboard.json';
import esSeed from '@/locales/es/seed.json';
import esShipping from '@/locales/es/shipping.json';
import esUtilities from '@/locales/es/utilities.json';
import esProducts from '@/locales/es/products.json';
import esLanding from '@/locales/es/landing.json';

export const SUPPORTED_LANGUAGES = ['pt-BR', 'en', 'es'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, { label: string; short: string; flag: string }> = {
  'pt-BR': { label: 'Português', short: 'PT', flag: '🇧🇷' },
  'en': { label: 'English', short: 'EN', flag: '🇺🇸' },
  'es': { label: 'Español', short: 'ES', flag: '🇪🇸' },
};

const resources = {
  'pt-BR': {
    common: ptBRCommon,
    nav: ptBRNav,
    auth: ptBRAuth,
    errors: ptBRErrors,
    actions: ptBRActions,
    settings: ptBRSettings,
    dashboard: ptBRDashboard,
    seed: ptBRSeed,
    shipping: ptBRShipping,
    utilities: ptBRUtilities,
    products: ptBRProducts,
    landing: ptBRLanding,
  },
  en: {
    common: enCommon,
    nav: enNav,
    auth: enAuth,
    errors: enErrors,
    actions: enActions,
    settings: enSettings,
    dashboard: enDashboard,
    seed: enSeed,
    shipping: enShipping,
    utilities: enUtilities,
    products: enProducts,
    landing: enLanding,
  },
  es: {
    common: esCommon,
    nav: esNav,
    auth: esAuth,
    errors: esErrors,
    actions: esActions,
    settings: esSettings,
    dashboard: esDashboard,
    seed: esSeed,
    shipping: esShipping,
    utilities: esUtilities,
    products: esProducts,
    landing: esLanding,
  },
};

// Custom language detector order
const detectionOrder = [
  'localStorage',      // First check localStorage
  'navigator',         // Then browser language
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'pt-BR',
    defaultNS: 'common',
    ns: ['common', 'nav', 'auth', 'errors', 'actions', 'settings', 'dashboard', 'seed', 'shipping', 'utilities', 'products', 'landing'],
    
    detection: {
      order: detectionOrder,
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // Avoid issues with SSR and initial load
    },
  });

// Map navigator language to supported language
export function mapBrowserLanguage(browserLang: string): SupportedLanguage {
  const lang = browserLang.toLowerCase();
  
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('es')) return 'es';
  if (lang.startsWith('en')) return 'en';
  
  return 'pt-BR'; // Default fallback
}

// Get current language with type safety
export function getCurrentLanguage(): SupportedLanguage {
  const current = i18n.language;
  if (SUPPORTED_LANGUAGES.includes(current as SupportedLanguage)) {
    return current as SupportedLanguage;
  }
  return 'pt-BR';
}

export default i18n;
