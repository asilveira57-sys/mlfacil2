import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SupportedLanguage, SUPPORTED_LANGUAGES, mapBrowserLanguage } from '@/lib/i18n';

const STORAGE_KEY = 'i18nextLng';

export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const { user } = useAuth();

  // Load language preference on mount
  useEffect(() => {
    loadLanguagePreference();
  }, [user?.id]);

  async function loadLanguagePreference() {
    try {
      // Priority 1: If logged in, check user_preferences
      if (user?.id) {
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('language')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (prefs?.language && SUPPORTED_LANGUAGES.includes(prefs.language as SupportedLanguage)) {
          if (i18n.language !== prefs.language) {
            i18n.changeLanguage(prefs.language);
          }
          return;
        }
      }

      // Priority 2: Check localStorage
      const storedLang = localStorage.getItem(STORAGE_KEY);
      if (storedLang && SUPPORTED_LANGUAGES.includes(storedLang as SupportedLanguage)) {
        if (i18n.language !== storedLang) {
          i18n.changeLanguage(storedLang);
        }
        return;
      }

      // Priority 3: Browser language
      const browserLang = mapBrowserLanguage(navigator.language);
      if (i18n.language !== browserLang) {
        i18n.changeLanguage(browserLang);
      }
    } catch (error) {
      console.error('[i18n] Error loading language preference:', error);
    }
  }

  const changeLanguage = useCallback(async (language: SupportedLanguage) => {
    try {
      // Update i18n immediately (no page reload)
      await i18n.changeLanguage(language);
      
      // Persist to localStorage
      localStorage.setItem(STORAGE_KEY, language);

      // If logged in, persist to database
      if (user?.id) {
        await supabase
          .from('user_preferences')
          .upsert(
            { user_id: user.id, language, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
      }
    } catch (error) {
      console.error('[i18n] Error changing language:', error);
    }
  }, [i18n, user?.id]);

  return {
    currentLanguage: i18n.language as SupportedLanguage,
    changeLanguage,
    isReady: i18n.isInitialized,
  };
}
