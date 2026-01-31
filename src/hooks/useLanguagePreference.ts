import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { SupportedLanguage, SUPPORTED_LANGUAGES, mapBrowserLanguage } from '@/lib/i18n';

const STORAGE_KEY = 'i18nextLng';

export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load language preference when user changes
  useEffect(() => {
    loadLanguagePreference();
  }, [userId]);

  async function loadLanguagePreference() {
    try {
      // Priority 1: If logged in, check user_preferences
      if (userId) {
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('language')
          .eq('user_id', userId)
          .maybeSingle();
        
        const lang = (prefs as any)?.language;
        if (lang && SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
          if (i18n.language !== lang) {
            await i18n.changeLanguage(lang);
          }
          return;
        }
      }

      // Priority 2: Check localStorage
      const storedLang = localStorage.getItem(STORAGE_KEY);
      if (storedLang && SUPPORTED_LANGUAGES.includes(storedLang as SupportedLanguage)) {
        if (i18n.language !== storedLang) {
          await i18n.changeLanguage(storedLang);
        }
        return;
      }

      // Priority 3: Browser language
      const browserLang = mapBrowserLanguage(navigator.language);
      if (i18n.language !== browserLang) {
        await i18n.changeLanguage(browserLang);
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
      if (userId) {
        await supabase
          .from('user_preferences')
          .upsert(
            { user_id: userId, language, updated_at: new Date().toISOString() } as any,
            { onConflict: 'user_id' }
          );
      }
    } catch (error) {
      console.error('[i18n] Error changing language:', error);
    }
  }, [i18n, userId]);

  return {
    currentLanguage: i18n.language as SupportedLanguage,
    changeLanguage,
    isReady: i18n.isInitialized,
  };
}
