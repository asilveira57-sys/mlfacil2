import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { HSLColor, parseHSL, hslToString } from './useThemeCustomization';

export type ColorModePreference = 'light' | 'dark' | 'auto';

interface ColorModeResult {
  // Current mode
  mode: ColorModePreference;
  effectiveMode: 'light' | 'dark'; // Resolved mode (auto → system preference)
  
  // Actions
  setMode: (mode: ColorModePreference) => Promise<void>;
  
  // Preview (temporary, not saved)
  previewMode: 'light' | 'dark' | null;
  setPreviewMode: (mode: 'light' | 'dark' | null) => void;
  
  // State
  loading: boolean;
}

// Generate dark mode variant from a light color
export function toLightModeColor(color: HSLColor): HSLColor {
  // Light mode: keep hue, moderate saturation, higher lightness
  return {
    h: color.h,
    s: Math.min(color.s, 70),
    l: Math.max(color.l, 40),
  };
}

// Generate dark mode variant from a base color
export function toDarkModeColor(color: HSLColor): HSLColor {
  // Dark mode: keep hue, slightly lower saturation, adjusted lightness for visibility
  return {
    h: color.h,
    s: Math.max(color.s - 10, 30),
    l: color.l > 50 ? Math.min(color.l + 10, 80) : Math.min(color.l + 20, 70),
  };
}

// Generate background color for each mode
export function getModeBackgrounds(baseColor: HSLColor): { light: HSLColor; dark: HSLColor } {
  return {
    light: { h: baseColor.h, s: Math.min(baseColor.s, 15), l: 98 },
    dark: { h: baseColor.h, s: Math.min(baseColor.s, 30), l: 8 },
  };
}

// Generate card colors for each mode
export function getModeCardColors(baseColor: HSLColor): { light: HSLColor; dark: HSLColor } {
  return {
    light: { h: 0, s: 0, l: 100 },
    dark: { h: baseColor.h, s: Math.min(baseColor.s, 25), l: 14 },
  };
}

// Generate text colors for each mode
export function getModeTextColors(baseColor: HSLColor): { 
  light: { primary: HSLColor; secondary: HSLColor }; 
  dark: { primary: HSLColor; secondary: HSLColor }; 
} {
  return {
    light: {
      primary: { h: baseColor.h, s: Math.min(baseColor.s, 30), l: 12 },
      secondary: { h: baseColor.h, s: Math.min(baseColor.s, 15), l: 45 },
    },
    dark: {
      primary: { h: baseColor.h, s: Math.min(baseColor.s, 10), l: 96 },
      secondary: { h: baseColor.h, s: Math.min(baseColor.s, 15), l: 65 },
    },
  };
}

// Generate border colors for each mode
export function getModeBorderColors(baseColor: HSLColor): { light: HSLColor; dark: HSLColor } {
  return {
    light: { h: baseColor.h, s: Math.min(baseColor.s, 20), l: 90 },
    dark: { h: baseColor.h, s: Math.min(baseColor.s, 25), l: 20 },
  };
}

// Generate complete theme for a mode from base company color
export function generateModeTheme(companyColorHsl: string, mode: 'light' | 'dark') {
  const baseColor = parseHSL(companyColorHsl);
  if (!baseColor) return null;

  const backgrounds = getModeBackgrounds(baseColor);
  const cards = getModeCardColors(baseColor);
  const text = getModeTextColors(baseColor);
  const borders = getModeBorderColors(baseColor);
  
  const modeColor = mode === 'light' ? toLightModeColor(baseColor) : toDarkModeColor(baseColor);
  
  return {
    // Base
    background: hslToString(backgrounds[mode]),
    foreground: hslToString(text[mode].primary),
    
    // Cards
    card: hslToString(cards[mode]),
    cardForeground: hslToString(text[mode].primary),
    
    // Primary (company color adapted)
    primary: hslToString(modeColor),
    primaryForeground: mode === 'dark' 
      ? hslToString({ h: baseColor.h, s: 20, l: 10 })
      : hslToString({ h: 0, s: 0, l: 98 }),
    
    // Secondary
    secondary: mode === 'light'
      ? hslToString({ h: baseColor.h, s: 15, l: 92 })
      : hslToString({ h: baseColor.h, s: 20, l: 18 }),
    secondaryForeground: hslToString(text[mode].primary),
    
    // Muted
    muted: mode === 'light'
      ? hslToString({ h: baseColor.h, s: 10, l: 95 })
      : hslToString({ h: baseColor.h, s: 25, l: 16 }),
    mutedForeground: hslToString(text[mode].secondary),
    
    // Border
    border: hslToString(borders[mode]),
    
    // Accent (same as primary for consistency)
    accent: hslToString(modeColor),
    accentForeground: mode === 'dark'
      ? hslToString({ h: baseColor.h, s: 20, l: 10 })
      : hslToString({ h: 0, s: 0, l: 98 }),
      
    // Sidebar
    sidebarBackground: mode === 'light' 
      ? '0 0% 100%' 
      : hslToString({ h: baseColor.h, s: 25, l: 12 }),
    sidebarForeground: hslToString(text[mode].primary),
    sidebarPrimary: hslToString(modeColor),
    sidebarBorder: hslToString(borders[mode]),
  };
}

// Apply theme to CSS variables
export function applyModeTheme(theme: ReturnType<typeof generateModeTheme>) {
  if (!theme) return;
  
  const root = document.documentElement;
  
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--foreground', theme.foreground);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--card-foreground', theme.cardForeground);
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-foreground', theme.primaryForeground);
  root.style.setProperty('--secondary', theme.secondary);
  root.style.setProperty('--secondary-foreground', theme.secondaryForeground);
  root.style.setProperty('--muted', theme.muted);
  root.style.setProperty('--muted-foreground', theme.mutedForeground);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--input', theme.border);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-foreground', theme.accentForeground);
  root.style.setProperty('--sidebar-background', theme.sidebarBackground);
  root.style.setProperty('--sidebar-foreground', theme.sidebarForeground);
  root.style.setProperty('--sidebar-primary', theme.sidebarPrimary);
  root.style.setProperty('--sidebar-border', theme.sidebarBorder);
}

// Get system preference
function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useColorMode(): ColorModeResult {
  const { activeAccountId } = useActiveAccount();
  const companyId = activeAccountId || 'default';
  
  const [mode, setModeState] = useState<ColorModePreference>('auto');
  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(getSystemPreference);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark' | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Fetch user preference
  useEffect(() => {
    const fetchPreference = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('ui_theme_settings')
          .select('color_mode_preference')
          .eq('user_id', user.id)
          .eq('company_id', companyId)
          .eq('scope', 'global')
          .single();

        if (data?.color_mode_preference) {
          setModeState(data.color_mode_preference as ColorModePreference);
        }
      } catch (err) {
        console.error('[useColorMode] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPreference();
  }, [companyId]);

  // Calculate effective mode
  const effectiveMode: 'light' | 'dark' = previewMode || (mode === 'auto' ? systemPreference : mode);

  // Apply dark class to document
  useEffect(() => {
    if (effectiveMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveMode]);

  // Set mode
  const setMode = useCallback(async (newMode: ColorModePreference) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      await supabase
        .from('ui_theme_settings')
        .upsert({
          user_id: user.id,
          company_id: companyId,
          scope: 'global',
          color_mode_preference: newMode,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,company_id,scope',
        });

      setModeState(newMode);
      setPreviewMode(null); // Clear preview when saving
    } catch (err) {
      console.error('[useColorMode] setMode error:', err);
    }
  }, [companyId]);

  return {
    mode,
    effectiveMode,
    setMode,
    previewMode,
    setPreviewMode,
    loading,
  };
}
