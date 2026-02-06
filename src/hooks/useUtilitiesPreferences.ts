import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export interface WidgetsEnabled {
  clock: boolean;
  weather: boolean;
  calculator: boolean;
}

export interface WidgetsLayout {
  order: string[];
  positions: Record<string, { x: number; y: number }>;
  weatherCity?: string;
  weatherCountry?: string;
}

export interface UtilitiesPreferences {
  timezone: string;
  hourFormat: '12h' | '24h';
  widgetsEnabled: WidgetsEnabled;
  widgetsLayout: WidgetsLayout;
  showClockInHeader: boolean;
  showWeatherInHeader: boolean;
  showCalculatorInHeader: boolean;
  weatherCity: string;
  weatherCountry: string;
}

const DEFAULT_PREFERENCES: UtilitiesPreferences = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  hourFormat: '24h',
  widgetsEnabled: {
    clock: true,
    weather: true,
    calculator: true,
  },
  widgetsLayout: {
    order: ['clock', 'weather', 'calculator'],
    positions: {},
    weatherCity: 'São Paulo',
    weatherCountry: 'BR',
  },
  showClockInHeader: true,
  showWeatherInHeader: true,
  showCalculatorInHeader: true,
  weatherCity: 'São Paulo',
  weatherCountry: 'BR',
};

export function useUtilitiesPreferences() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<UtilitiesPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('timezone, hour_format, widgets_enabled, widgets_layout')
          .eq('user_id', userId)
          .maybeSingle();

        if (prefs) {
          const widgetsEnabled = (prefs as any).widgets_enabled || DEFAULT_PREFERENCES.widgetsEnabled;
          const widgetsLayout = (prefs as any).widgets_layout || DEFAULT_PREFERENCES.widgetsLayout;

          setPreferences({
            timezone: (prefs as any).timezone || DEFAULT_PREFERENCES.timezone,
            hourFormat: ((prefs as any).hour_format as '12h' | '24h') || DEFAULT_PREFERENCES.hourFormat,
            widgetsEnabled,
            widgetsLayout,
            showClockInHeader: widgetsEnabled?.clock ?? true,
            showWeatherInHeader: widgetsEnabled?.weather ?? true,
            showCalculatorInHeader: widgetsEnabled?.calculator ?? true,
            weatherCity: widgetsLayout?.weatherCity || DEFAULT_PREFERENCES.weatherCity,
            weatherCountry: widgetsLayout?.weatherCountry || DEFAULT_PREFERENCES.weatherCountry,
          });
        }
      } catch (error) {
        console.error('[Utilities] Error loading preferences:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [userId]);

  const updatePreferences = useCallback(async (updates: Partial<UtilitiesPreferences>) => {
    if (!userId) return;

    const newPreferences = { ...preferences, ...updates };

    // Sync weatherCity/weatherCountry into widgetsLayout
    const newLayout = {
      ...newPreferences.widgetsLayout,
      weatherCity: updates.weatherCity ?? newPreferences.weatherCity,
      weatherCountry: updates.weatherCountry ?? newPreferences.weatherCountry,
    };
    newPreferences.widgetsLayout = newLayout;
    newPreferences.weatherCity = newLayout.weatherCity || DEFAULT_PREFERENCES.weatherCity;
    newPreferences.weatherCountry = newLayout.weatherCountry || DEFAULT_PREFERENCES.weatherCountry;

    setPreferences(newPreferences);

    try {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          timezone: newPreferences.timezone,
          hour_format: newPreferences.hourFormat,
          widgets_enabled: newPreferences.widgetsEnabled,
          widgets_layout: newPreferences.widgetsLayout,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      toast({
        title: t('common:success'),
        description: t('utilities:settings.save_success', { defaultValue: 'Preferências salvas com sucesso.' }),
      });
    } catch (error) {
      console.error('[Utilities] Error saving preferences:', error);
      toast({
        title: t('common:error'),
        description: String(error),
        variant: 'destructive',
      });
    }
  }, [userId, preferences, toast, t]);

  return {
    preferences,
    loading,
    updatePreferences,
  };
}
