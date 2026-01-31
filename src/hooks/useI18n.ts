import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import { SupportedLanguage } from '@/lib/i18n';
import { 
  formatDate, 
  formatDistanceToNow, 
  formatNumber, 
  formatCurrency, 
  formatPercent 
} from '@/lib/i18n/formatters';

/**
 * Hook for accessing i18n with typed namespace support and formatting utilities
 */
export function useI18n() {
  const { t, i18n } = useTranslation();
  
  const language = i18n.language as SupportedLanguage;

  // Memoized formatters bound to current language
  const formatters = useMemo(() => ({
    date: (date: Date | string | number, variant?: 'short' | 'long' | 'dateTime') => 
      formatDate(date, language, variant),
    
    relativeTime: (date: Date | string | number) => 
      formatDistanceToNow(date, language),
    
    number: (value: number, options?: Intl.NumberFormatOptions) => 
      formatNumber(value, language, options),
    
    currency: (value: number, currency?: string) => 
      formatCurrency(value, language, currency),
    
    percent: (value: number, decimals?: number) => 
      formatPercent(value, language, decimals),
  }), [language]);

  // Helper to translate with namespace
  const tn = useCallback((ns: string, key: string, options?: Record<string, unknown>) => {
    return t(`${ns}:${key}`, options as any);
  }, [t]);

  return {
    t,
    tn,
    i18n,
    language,
    formatters,
    // Quick access to common namespaces
    tCommon: useCallback((key: string, options?: Record<string, unknown>) => t(`common:${key}`, options as any), [t]),
    tNav: useCallback((key: string, options?: Record<string, unknown>) => t(`nav:${key}`, options as any), [t]),
    tAuth: useCallback((key: string, options?: Record<string, unknown>) => t(`auth:${key}`, options as any), [t]),
    tErrors: useCallback((key: string, options?: Record<string, unknown>) => t(`errors:${key}`, options as any), [t]),
    tActions: useCallback((key: string, options?: Record<string, unknown>) => t(`actions:${key}`, options as any), [t]),
  };
}
