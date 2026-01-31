import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import type { FreightRuleset, FreightRuleLine } from '@/lib/freightEngine';

interface FreightSettings {
  id: string;
  active_ruleset_id: string | null;
  tolerance_value: number;
  tolerance_percent: number;
  comparison_mode: 'paid_vs_expected' | 'charged_vs_expected' | 'both';
  profile_a_weight_max: number;
  profile_a_dimensions_sum: number;
  profile_b_weight_max: number;
  profile_b_dimensions_sum: number;
}

const DEFAULT_SETTINGS: Omit<FreightSettings, 'id'> = {
  active_ruleset_id: null,
  tolerance_value: 5.00,
  tolerance_percent: 10.0,
  comparison_mode: 'paid_vs_expected',
  profile_a_weight_max: 0.5,
  profile_a_dimensions_sum: 60,
  profile_b_weight_max: 5,
  profile_b_dimensions_sum: 150,
};

export function useFreightRulesets() {
  const { activeAccountId } = useActiveAccount();
  const sellerId = activeAccountId || '';
  
  const [rulesets, setRulesets] = useState<FreightRuleset[]>([]);
  const [activeRuleset, setActiveRuleset] = useState<FreightRuleset | null>(null);
  const [activeRuleLines, setActiveRuleLines] = useState<FreightRuleLine[]>([]);
  const [settings, setSettings] = useState<FreightSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all rulesets
  const fetchRulesets = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('freight_rulesets')
        .select('*')
        .eq('marketplace', 'mercadolivre')
        .eq('country', 'BR')
        .order('valid_from', { ascending: false });

      if (fetchError) throw fetchError;
      setRulesets(data || []);
    } catch (err) {
      console.error('[useFreightRulesets] Error fetching rulesets:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar tabelas de frete');
    }
  }, []);

  // Fetch settings for current seller
  const fetchSettings = useCallback(async () => {
    if (!sellerId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('freight_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('seller_id', sellerId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        setSettings(data as FreightSettings);
      } else {
        // Create default settings
        const { data: newSettings, error: insertError } = await supabase
          .from('freight_settings')
          .insert({
            user_id: user.id,
            seller_id: sellerId,
            ...DEFAULT_SETTINGS,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings as FreightSettings);
      }
    } catch (err) {
      console.error('[useFreightRulesets] Error fetching settings:', err);
    }
  }, [sellerId]);

  // Fetch rule lines for active ruleset
  const fetchRuleLines = useCallback(async (rulesetId: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('freight_rule_lines')
        .select('*')
        .eq('ruleset_id', rulesetId)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      setActiveRuleLines((data || []) as FreightRuleLine[]);
    } catch (err) {
      console.error('[useFreightRulesets] Error fetching rule lines:', err);
    }
  }, []);

  // Set active ruleset
  const setActiveRulesetId = useCallback(async (rulesetId: string) => {
    if (!sellerId || !settings) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('freight_settings')
        .update({ active_ruleset_id: rulesetId, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('seller_id', sellerId);

      const ruleset = rulesets.find(r => r.id === rulesetId);
      if (ruleset) {
        setActiveRuleset(ruleset);
        await fetchRuleLines(rulesetId);
      }

      setSettings(prev => prev ? { ...prev, active_ruleset_id: rulesetId } : prev);
    } catch (err) {
      console.error('[useFreightRulesets] Error setting active ruleset:', err);
    }
  }, [sellerId, settings, rulesets, fetchRuleLines]);

  // Update settings
  const updateSettings = useCallback(async (updates: Partial<FreightSettings>) => {
    if (!sellerId || !settings) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: updateError } = await supabase
        .from('freight_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('seller_id', sellerId);

      if (updateError) throw updateError;
      setSettings(prev => prev ? { ...prev, ...updates } : prev);
    } catch (err) {
      console.error('[useFreightRulesets] Error updating settings:', err);
      throw err;
    }
  }, [sellerId, settings]);

  // Create new ruleset
  const createRuleset = useCallback(async (
    ruleset: Omit<FreightRuleset, 'id'>,
    lines: Omit<FreightRuleLine, 'id' | 'ruleset_id'>[]
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Create ruleset
      const { data: newRuleset, error: rulesetError } = await supabase
        .from('freight_rulesets')
        .insert({ ...ruleset, created_by: user.id })
        .select()
        .single();

      if (rulesetError) throw rulesetError;

      // Create lines
      if (lines.length > 0) {
        const linesWithRuleset = lines.map(line => ({
          ...line,
          ruleset_id: newRuleset.id,
        }));

        const { error: linesError } = await supabase
          .from('freight_rule_lines')
          .insert(linesWithRuleset);

        if (linesError) throw linesError;
      }

      await fetchRulesets();
      return newRuleset;
    } catch (err) {
      console.error('[useFreightRulesets] Error creating ruleset:', err);
      throw err;
    }
  }, [fetchRulesets]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchRulesets(), fetchSettings()]);
      setLoading(false);
    };
    load();
  }, [fetchRulesets, fetchSettings]);

  // Load active ruleset when settings change
  useEffect(() => {
    if (settings?.active_ruleset_id && rulesets.length > 0) {
      const ruleset = rulesets.find(r => r.id === settings.active_ruleset_id);
      if (ruleset) {
        setActiveRuleset(ruleset);
        fetchRuleLines(settings.active_ruleset_id);
      }
    }
  }, [settings?.active_ruleset_id, rulesets, fetchRuleLines]);

  return {
    rulesets,
    activeRuleset,
    activeRuleLines,
    settings,
    loading,
    error,
    setActiveRulesetId,
    updateSettings,
    createRuleset,
    refetch: fetchRulesets,
  };
}
