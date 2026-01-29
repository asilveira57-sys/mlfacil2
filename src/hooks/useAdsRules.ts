import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import type { 
  AdsRule, 
  AdsRuleCondition, 
  AdsRuleExtraCondition, 
  AdsRuleEvent 
} from '@/types/ads-rules';

interface UseAdsRulesResult {
  rules: AdsRule[];
  loading: boolean;
  error: string | null;
  createRule: (rule: Partial<AdsRule>) => Promise<AdsRule | null>;
  updateRule: (id: string, updates: Partial<AdsRule>) => Promise<boolean>;
  deleteRule: (id: string) => Promise<boolean>;
  toggleRule: (id: string, isEnabled: boolean) => Promise<boolean>;
  evaluateRules: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useAdsRules(sellerId?: string): UseAdsRulesResult {
  const [rules, setRules] = useState<AdsRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchRules = useCallback(async () => {
    if (!sellerId) {
      setRules([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('ads_automation_rules')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Transform from DB format to our type
      const parsedRules: AdsRule[] = (data || []).map(rule => ({
        id: rule.id,
        user_id: rule.user_id,
        seller_id: rule.seller_id,
        workspace_id: rule.workspace_id ?? undefined,
        name: rule.name,
        description: rule.description ?? undefined,
        conditions: (rule.conditions as unknown as { items?: AdsRuleCondition[] })?.items || [],
        extra_conditions: (rule.conditions as unknown as { extra?: AdsRuleExtraCondition[] })?.extra || [],
        event_type: (rule.rule_type as 'violation' | 'opportunity') || 'violation',
        severity: ((rule.conditions as Record<string, unknown>)?.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium',
        is_enabled: rule.is_enabled ?? true,
        last_evaluated_at: undefined,
        last_triggered_at: rule.last_triggered_at ?? undefined,
        trigger_count: rule.trigger_count ?? 0,
        created_at: rule.created_at,
        updated_at: rule.updated_at,
      }));

      setRules(parsedRules);
    } catch (err) {
      console.error('[useAdsRules] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar regras');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(async (rule: Partial<AdsRule>): Promise<AdsRule | null> => {
    if (!sellerId) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const conditionsPayload = {
        items: rule.conditions || [],
        extra: rule.extra_conditions || [],
        severity: rule.severity || 'medium',
      };

      const { data, error } = await supabase
        .from('ads_automation_rules')
        .insert([{
          user_id: user.id,
          seller_id: sellerId,
          name: rule.name || 'Nova regra',
          description: rule.description || null,
          rule_type: rule.event_type || 'violation',
          conditions: conditionsPayload as unknown as Json,
          actions: {} as Json,
          is_enabled: rule.is_enabled ?? true,
        }])
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Regra criada com sucesso' });
      await fetchRules();
      return rules.find(r => r.id === data.id) || null;
    } catch (err) {
      console.error('[useAdsRules] Create error:', err);
      toast({ title: 'Erro ao criar regra', variant: 'destructive' });
      return null;
    }
  }, [sellerId, fetchRules, rules, toast]);

  const updateRule = useCallback(async (id: string, updates: Partial<AdsRule>): Promise<boolean> => {
    try {
      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.is_enabled !== undefined) dbUpdates.is_enabled = updates.is_enabled;
      if (updates.event_type !== undefined) dbUpdates.rule_type = updates.event_type;

      if (updates.conditions !== undefined || updates.extra_conditions !== undefined || updates.severity !== undefined) {
        const currentRule = rules.find(r => r.id === id);
        const conditionsPayload = {
          items: updates.conditions ?? currentRule?.conditions ?? [],
          extra: updates.extra_conditions ?? currentRule?.extra_conditions ?? [],
          severity: updates.severity ?? currentRule?.severity ?? 'medium',
        };
        dbUpdates.conditions = conditionsPayload as unknown as Json;
      }

      const { error } = await supabase
        .from('ads_automation_rules')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Regra atualizada' });
      await fetchRules();
      return true;
    } catch (err) {
      console.error('[useAdsRules] Update error:', err);
      toast({ title: 'Erro ao atualizar regra', variant: 'destructive' });
      return false;
    }
  }, [rules, fetchRules, toast]);

  const deleteRule = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('ads_automation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRules(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Regra excluída' });
      return true;
    } catch (err) {
      console.error('[useAdsRules] Delete error:', err);
      toast({ title: 'Erro ao excluir regra', variant: 'destructive' });
      return false;
    }
  }, [toast]);

  const toggleRule = useCallback(async (id: string, isEnabled: boolean): Promise<boolean> => {
    return updateRule(id, { is_enabled: isEnabled });
  }, [updateRule]);

  const evaluateRules = useCallback(async () => {
    if (!sellerId) return;

    try {
      toast({ title: 'Avaliando regras...' });
      
      const { error } = await supabase.functions.invoke('ads-rules-engine', {
        body: { seller_id: sellerId, action: 'evaluate' },
      });

      if (error) throw error;
      
      toast({ title: 'Regras avaliadas com sucesso' });
      await fetchRules();
    } catch (err) {
      console.error('[useAdsRules] Evaluate error:', err);
      toast({ title: 'Erro ao avaliar regras', variant: 'destructive' });
    }
  }, [sellerId, fetchRules, toast]);

  return {
    rules,
    loading,
    error,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    evaluateRules,
    refetch: fetchRules,
  };
}

// Hook for rule events/violations
export function useAdsRuleEvents(sellerId?: string) {
  const [events, setEvents] = useState<AdsRuleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const fetchEvents = async () => {
      setLoading(true);
      try {
        // Events are stored in ads_alerts with alert_type = 'rule_violation' or 'rule_opportunity'
        const { data, error } = await supabase
          .from('ads_alerts')
          .select('*')
          .eq('seller_id', sellerId)
          .in('alert_type', ['rule_violation', 'rule_opportunity'])
          .eq('is_dismissed', false)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const parsedEvents: AdsRuleEvent[] = (data || []).map(alert => ({
          id: alert.id,
          rule_id: (alert.data_json as Record<string, unknown>)?.rule_id as string || '',
          rule_name: (alert.data_json as Record<string, unknown>)?.rule_name as string || '',
          item_id: alert.item_id || '',
          item_title: (alert.data_json as Record<string, unknown>)?.item_title as string || undefined,
          event_type: alert.alert_type === 'rule_opportunity' ? 'opportunity' : 'violation',
          severity: alert.severity,
          message_pt: alert.message_pt,
          metrics_snapshot: (alert.data_json as Record<string, unknown>)?.metrics as Record<string, number> || {},
          created_at: alert.created_at,
        }));

        setEvents(parsedEvents);
      } catch (err) {
        console.error('[useAdsRuleEvents] Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();

    // DISABLED: Realtime subscription disabled in static mode
    // Data only updates on manual refresh or page reload
    // const channel = supabase
    //   .channel(`ads-rule-events-${sellerId}`)
    //   .on('postgres_changes', {
    //     event: 'INSERT',
    //     schema: 'public',
    //     table: 'ads_alerts',
    //     filter: `seller_id=eq.${sellerId}`,
    //   }, () => fetchEvents())
    //   .subscribe();
    //
    // return () => { supabase.removeChannel(channel); };
  }, [sellerId]);

  return { events, loading };
}
