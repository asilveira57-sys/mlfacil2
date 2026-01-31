import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';

// HSL color utilities
export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function hslToString(color: HSLColor): string {
  return `${color.h} ${color.s}% ${color.l}%`;
}

export function parseHSL(str: string | null | undefined): HSLColor | null {
  if (!str) return null;
  const parts = str.match(/(\d+(?:\.\d+)?)/g);
  if (!parts || parts.length < 3) return null;
  return {
    h: parseFloat(parts[0]),
    s: parseFloat(parts[1]),
    l: parseFloat(parts[2]),
  };
}

export function hslToHex(color: HSLColor): string {
  const l = color.l / 100;
  const s = color.s / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + color.h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHSL(hex: string): HSLColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 50 };
  
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Calculate contrasting text color
export function getContrastColor(bg: HSLColor): HSLColor {
  return bg.l > 50 ? { h: 0, s: 0, l: 10 } : { h: 0, s: 0, l: 95 };
}

// Generate color harmonies
export function generateHarmonies(base: HSLColor): { name: string; color: HSLColor }[] {
  return [
    { name: 'Complementar', color: { ...base, h: (base.h + 180) % 360 } },
    { name: 'Análoga 1', color: { ...base, h: (base.h + 30) % 360 } },
    { name: 'Análoga 2', color: { ...base, h: (base.h + 330) % 360 } },
    { name: 'Triádica 1', color: { ...base, h: (base.h + 120) % 360 } },
    { name: 'Triádica 2', color: { ...base, h: (base.h + 240) % 360 } },
    { name: 'Mais Clara', color: { ...base, l: Math.min(base.l + 15, 95) } },
    { name: 'Mais Escura', color: { ...base, l: Math.max(base.l - 15, 10) } },
  ];
}

// Generate hover variant
export function generateHoverColor(color: HSLColor): HSLColor {
  if (color.l > 50) {
    return { ...color, l: color.l - 10 };
  }
  return { ...color, l: color.l + 10 };
}

// Theme settings interfaces
export interface MenuThemeSettings {
  menu_bg_color: string;
  menu_item_color: string;
  menu_item_active_color: string;
  menu_item_hover_color: string;
  menu_icon_color: string;
  menu_text_color: string;
}

export interface CardThemeSettings {
  card_bg_color: string;
  card_title_color: string;
  card_value_color: string;
  card_text_secondary_color: string;
  card_border_color: string;
  card_indicator_positive: string;
  card_indicator_warning: string;
  card_indicator_critical: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  theme_data: Record<string, string>;
  is_default: boolean;
  is_system: boolean;
}

export interface UseThemeCustomizationResult {
  // Menu theme
  menuTheme: MenuThemeSettings;
  setMenuColor: (key: keyof MenuThemeSettings, value: string) => void;
  
  // Cards theme
  cardsTheme: CardThemeSettings;
  setCardsColor: (key: keyof CardThemeSettings, value: string) => void;
  
  // Sync
  isSynced: boolean;
  setIsSynced: (synced: boolean) => void;
  breakSync: () => void; // Explicitly break sync and copy current colors
  
  // Presets
  menuPresets: ThemePreset[];
  cardsPresets: ThemePreset[];
  globalPresets: ThemePreset[];
  applyPreset: (preset: ThemePreset) => void;
  
  // Actions
  saveSettings: () => Promise<void>;
  resetToDefault: () => void;
  applySyncedTheme: (companyColorHsl: string) => void; // Apply company color to all areas
  
  // State
  loading: boolean;
  saving: boolean;
  hasChanges: boolean;
}

const DEFAULT_MENU_THEME: MenuThemeSettings = {
  menu_bg_color: '0 0% 100%',
  menu_item_color: '222 47% 11%',
  menu_item_active_color: '223 47% 23%',
  menu_item_hover_color: '210 40% 96%',
  menu_icon_color: '215 16% 47%',
  menu_text_color: '222 47% 11%',
};

const DEFAULT_CARDS_THEME: CardThemeSettings = {
  card_bg_color: '0 0% 100%',
  card_title_color: '222 47% 11%',
  card_value_color: '222 47% 11%',
  card_text_secondary_color: '215 16% 47%',
  card_border_color: '214 32% 91%',
  card_indicator_positive: '142 71% 45%',
  card_indicator_warning: '25 95% 53%',
  card_indicator_critical: '0 84% 60%',
};

// Generate theme from company color
export function generateThemeFromCompanyColor(companyColorHsl: string): { menu: MenuThemeSettings; cards: CardThemeSettings } {
  const baseColor = parseHSL(companyColorHsl);
  if (!baseColor) {
    return { menu: DEFAULT_MENU_THEME, cards: DEFAULT_CARDS_THEME };
  }

  // Menu theme derived from company color
  const menuTheme: MenuThemeSettings = {
    menu_bg_color: '0 0% 100%', // White background
    menu_item_color: `${baseColor.h} ${Math.min(baseColor.s, 30)}% 20%`,
    menu_item_active_color: hslToString(baseColor), // Company color as active
    menu_item_hover_color: `${baseColor.h} ${Math.max(baseColor.s - 40, 10)}% 95%`,
    menu_icon_color: `${baseColor.h} ${Math.min(baseColor.s, 20)}% 45%`,
    menu_text_color: `${baseColor.h} ${Math.min(baseColor.s, 30)}% 20%`,
  };

  // Cards theme derived from company color
  const cardsTheme: CardThemeSettings = {
    card_bg_color: '0 0% 100%',
    card_title_color: `${baseColor.h} ${Math.min(baseColor.s, 30)}% 15%`,
    card_value_color: `${baseColor.h} ${Math.min(baseColor.s, 40)}% 20%`,
    card_text_secondary_color: `${baseColor.h} ${Math.min(baseColor.s, 15)}% 50%`,
    card_border_color: `${baseColor.h} ${Math.min(baseColor.s, 20)}% 90%`,
    card_indicator_positive: '142 71% 45%',
    card_indicator_warning: '25 95% 53%',
    card_indicator_critical: '0 84% 60%',
  };

  return { menu: menuTheme, cards: cardsTheme };
}

export function useThemeCustomization(): UseThemeCustomizationResult {
  const { activeAccountId } = useActiveAccount();
  const companyId = activeAccountId || 'default';
  
  const [menuTheme, setMenuTheme] = useState<MenuThemeSettings>(DEFAULT_MENU_THEME);
  const [cardsTheme, setCardsTheme] = useState<CardThemeSettings>(DEFAULT_CARDS_THEME);
  const [originalMenuTheme, setOriginalMenuTheme] = useState<MenuThemeSettings>(DEFAULT_MENU_THEME);
  const [originalCardsTheme, setOriginalCardsTheme] = useState<CardThemeSettings>(DEFAULT_CARDS_THEME);
  const [isSynced, setIsSynced] = useState(true);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch presets and settings
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch presets
      const { data: presetsData } = await supabase
        .from('ui_theme_presets')
        .select('*')
        .order('is_default', { ascending: false });

      if (presetsData) {
        setPresets(presetsData as ThemePreset[]);
      }

      // Fetch menu settings
      const { data: menuData } = await supabase
        .from('ui_theme_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .eq('scope', 'menu')
        .single();

      if (menuData) {
        const menuSettings: MenuThemeSettings = {
          menu_bg_color: menuData.menu_bg_color || DEFAULT_MENU_THEME.menu_bg_color,
          menu_item_color: menuData.menu_item_color || DEFAULT_MENU_THEME.menu_item_color,
          menu_item_active_color: menuData.menu_item_active_color || DEFAULT_MENU_THEME.menu_item_active_color,
          menu_item_hover_color: menuData.menu_item_hover_color || DEFAULT_MENU_THEME.menu_item_hover_color,
          menu_icon_color: menuData.menu_icon_color || DEFAULT_MENU_THEME.menu_icon_color,
          menu_text_color: menuData.menu_text_color || DEFAULT_MENU_THEME.menu_text_color,
        };
        setMenuTheme(menuSettings);
        setOriginalMenuTheme(menuSettings);
        setIsSynced(menuData.is_synced ?? true);
      }

      // Fetch cards settings
      const { data: cardsData } = await supabase
        .from('ui_theme_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', companyId)
        .eq('scope', 'cards')
        .single();

      if (cardsData) {
        const cardsSettings: CardThemeSettings = {
          card_bg_color: cardsData.card_bg_color || DEFAULT_CARDS_THEME.card_bg_color,
          card_title_color: cardsData.card_title_color || DEFAULT_CARDS_THEME.card_title_color,
          card_value_color: cardsData.card_value_color || DEFAULT_CARDS_THEME.card_value_color,
          card_text_secondary_color: cardsData.card_text_secondary_color || DEFAULT_CARDS_THEME.card_text_secondary_color,
          card_border_color: cardsData.card_border_color || DEFAULT_CARDS_THEME.card_border_color,
          card_indicator_positive: cardsData.card_indicator_positive || DEFAULT_CARDS_THEME.card_indicator_positive,
          card_indicator_warning: cardsData.card_indicator_warning || DEFAULT_CARDS_THEME.card_indicator_warning,
          card_indicator_critical: cardsData.card_indicator_critical || DEFAULT_CARDS_THEME.card_indicator_critical,
        };
        setCardsTheme(cardsSettings);
        setOriginalCardsTheme(cardsSettings);
      }
    } catch (err) {
      console.error('[useThemeCustomization] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set individual menu color
  const setMenuColor = useCallback((key: keyof MenuThemeSettings, value: string) => {
    setMenuTheme(prev => ({ ...prev, [key]: value }));
  }, []);

  // Set individual cards color
  const setCardsColor = useCallback((key: keyof CardThemeSettings, value: string) => {
    setCardsTheme(prev => ({ ...prev, [key]: value }));
  }, []);

  // Apply preset
  const applyPreset = useCallback((preset: ThemePreset) => {
    const data = preset.theme_data;
    
    if (preset.scope === 'menu') {
      setMenuTheme({
        menu_bg_color: data.menu_bg_color || DEFAULT_MENU_THEME.menu_bg_color,
        menu_item_color: data.menu_item_color || DEFAULT_MENU_THEME.menu_item_color,
        menu_item_active_color: data.menu_item_active_color || DEFAULT_MENU_THEME.menu_item_active_color,
        menu_item_hover_color: data.menu_item_hover_color || DEFAULT_MENU_THEME.menu_item_hover_color,
        menu_icon_color: data.menu_icon_color || DEFAULT_MENU_THEME.menu_icon_color,
        menu_text_color: data.menu_text_color || DEFAULT_MENU_THEME.menu_text_color,
      });
    } else if (preset.scope === 'cards') {
      setCardsTheme({
        card_bg_color: data.card_bg_color || DEFAULT_CARDS_THEME.card_bg_color,
        card_title_color: data.card_title_color || DEFAULT_CARDS_THEME.card_title_color,
        card_value_color: data.card_value_color || DEFAULT_CARDS_THEME.card_value_color,
        card_text_secondary_color: data.card_text_secondary_color || DEFAULT_CARDS_THEME.card_text_secondary_color,
        card_border_color: data.card_border_color || DEFAULT_CARDS_THEME.card_border_color,
        card_indicator_positive: data.card_indicator_positive || DEFAULT_CARDS_THEME.card_indicator_positive,
        card_indicator_warning: data.card_indicator_warning || DEFAULT_CARDS_THEME.card_indicator_warning,
        card_indicator_critical: data.card_indicator_critical || DEFAULT_CARDS_THEME.card_indicator_critical,
      });
    }
  }, []);

  // Save settings
  const saveSettings = useCallback(async () => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save menu settings
      await supabase
        .from('ui_theme_settings')
        .upsert({
          user_id: user.id,
          company_id: companyId,
          scope: 'menu',
          ...menuTheme,
          is_synced: isSynced,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,company_id,scope',
        });

      // Save cards settings
      await supabase
        .from('ui_theme_settings')
        .upsert({
          user_id: user.id,
          company_id: companyId,
          scope: 'cards',
          ...cardsTheme,
          is_synced: isSynced,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,company_id,scope',
        });

      setOriginalMenuTheme(menuTheme);
      setOriginalCardsTheme(cardsTheme);
    } catch (err) {
      console.error('[useThemeCustomization] Save error:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [companyId, menuTheme, cardsTheme, isSynced]);

  // Reset to default
  const resetToDefault = useCallback(() => {
    setMenuTheme(DEFAULT_MENU_THEME);
    setCardsTheme(DEFAULT_CARDS_THEME);
    setIsSynced(true);
  }, []);

  // Apply synced theme from company color
  const applySyncedTheme = useCallback((companyColorHsl: string) => {
    const { menu, cards } = generateThemeFromCompanyColor(companyColorHsl);
    setMenuTheme(menu);
    setCardsTheme(cards);
  }, []);

  // Break sync - copy current colors to allow independent editing
  const breakSync = useCallback(() => {
    // Current colors are already set, just disable sync
    setIsSynced(false);
  }, []);

  // Check for changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(menuTheme) !== JSON.stringify(originalMenuTheme) ||
           JSON.stringify(cardsTheme) !== JSON.stringify(originalCardsTheme);
  }, [menuTheme, cardsTheme, originalMenuTheme, originalCardsTheme]);

  // Filter presets by scope
  const menuPresets = useMemo(() => presets.filter(p => p.scope === 'menu'), [presets]);
  const cardsPresets = useMemo(() => presets.filter(p => p.scope === 'cards'), [presets]);
  const globalPresets = useMemo(() => presets.filter(p => p.scope === 'global'), [presets]);

  return {
    menuTheme,
    setMenuColor,
    cardsTheme,
    setCardsColor,
    isSynced,
    setIsSynced,
    breakSync,
    menuPresets,
    cardsPresets,
    globalPresets,
    applyPreset,
    saveSettings,
    resetToDefault,
    applySyncedTheme,
    loading,
    saving,
    hasChanges,
  };
}
