import { format, formatDistance, formatRelative, type Locale } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { SupportedLanguage } from '@/lib/i18n';

const locales: Record<SupportedLanguage, Locale> = {
  'pt-BR': ptBR,
  'en': enUS,
  'es': es,
};

const dateFormats: Record<SupportedLanguage, { short: string; long: string; dateTime: string }> = {
  'pt-BR': {
    short: 'dd/MM/yyyy',
    long: 'dd \'de\' MMMM \'de\' yyyy',
    dateTime: 'dd/MM/yyyy HH:mm',
  },
  'en': {
    short: 'MM/dd/yyyy',
    long: 'MMMM d, yyyy',
    dateTime: 'MM/dd/yyyy h:mm a',
  },
  'es': {
    short: 'dd/MM/yyyy',
    long: 'dd \'de\' MMMM \'de\' yyyy',
    dateTime: 'dd/MM/yyyy HH:mm',
  },
};

/**
 * Format a date according to the current locale
 */
export function formatDate(
  date: Date | string | number,
  language: SupportedLanguage,
  variant: 'short' | 'long' | 'dateTime' = 'short'
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const locale = locales[language] || locales['pt-BR'];
  const formatStr = dateFormats[language]?.[variant] || dateFormats['pt-BR'][variant];
  
  return format(dateObj, formatStr, { locale });
}

/**
 * Format a relative time distance (e.g., "2 days ago")
 */
export function formatDistanceToNow(
  date: Date | string | number,
  language: SupportedLanguage
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const locale = locales[language] || locales['pt-BR'];
  
  return formatDistance(dateObj, new Date(), { 
    addSuffix: true, 
    locale 
  });
}

/**
 * Format a relative date (e.g., "last Monday")
 */
export function formatRelativeDate(
  date: Date | string | number,
  language: SupportedLanguage
): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  const locale = locales[language] || locales['pt-BR'];
  
  return formatRelative(dateObj, new Date(), { locale });
}

/**
 * Format a number according to locale
 */
export function formatNumber(
  value: number,
  language: SupportedLanguage,
  options?: Intl.NumberFormatOptions
): string {
  const localeMap: Record<SupportedLanguage, string> = {
    'pt-BR': 'pt-BR',
    'en': 'en-US',
    'es': 'es-ES',
  };
  
  return new Intl.NumberFormat(localeMap[language], options).format(value);
}

/**
 * Format currency according to locale
 */
export function formatCurrency(
  value: number,
  language: SupportedLanguage,
  currency: string = 'BRL'
): string {
  const localeMap: Record<SupportedLanguage, string> = {
    'pt-BR': 'pt-BR',
    'en': 'en-US',
    'es': 'es-ES',
  };
  
  return new Intl.NumberFormat(localeMap[language], {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format percentage according to locale
 */
export function formatPercent(
  value: number,
  language: SupportedLanguage,
  decimals: number = 1
): string {
  const localeMap: Record<SupportedLanguage, string> = {
    'pt-BR': 'pt-BR',
    'en': 'en-US',
    'es': 'es-ES',
  };
  
  return new Intl.NumberFormat(localeMap[language], {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}
