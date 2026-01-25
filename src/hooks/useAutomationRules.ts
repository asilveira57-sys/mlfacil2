import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { AutomationRule, AutomationAction } from '@/types/tasks';
interface UseAutomationRulesResult {
  rules: AutomationRule[];
  loading: boolean;
  error: string | null;
  createRule: (rule: Partial<AutomationRule>) => Promise<AutomationRule | null>;
  updateRule: (id: string, updates: Partial<AutomationRule>) => Promise<boolean>;
  deleteRule: (id: string) => Promise<boolean>;
  toggleRule: (id: string, isEnabled: boolean) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useAutomationRules(workspaceId: string | null): UseAutomationRulesResult {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!workspaceId) {
      setRules([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Parse actions from JSON
      const parsedRules = (data || []).map(rule => ({
        ...rule,
        conditions: rule.conditions as Record<string, unknown>,
        actions: rule.actions as unknown as AutomationAction[],
      })) as AutomationRule[];

      setRules(parsedRules);
    } catch (err) {
      console.error('[useAutomationRules] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar regras');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(async (rule: Partial<AutomationRule>): Promise<AutomationRule | null> => {
    if (!workspaceId) return null;

    try {
      const { data, error } = await supabase
        .from('automation_rules')
        .insert([{
          workspace_id: workspaceId,
          name: rule.name || 'Nova regra',
          trigger_event_type: rule.trigger_event_type || '',
          conditions: (rule.conditions || {}) as Json,
          actions: (rule.actions || []) as unknown as Json,
          account_id: rule.account_id || null,
          is_enabled: rule.is_enabled ?? true,
        }])
        .select()
        .single();

      if (error) throw error;

      const newRule = {
        ...data,
        conditions: data.conditions as Record<string, unknown>,
        actions: data.actions as unknown as AutomationAction[],
      } as AutomationRule;

      setRules(prev => [newRule, ...prev]);
      return newRule;
    } catch (err) {
      console.error('[useAutomationRules] Create error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao criar regra');
      return null;
    }
  }, [workspaceId]);

  const updateRule = useCallback(async (id: string, updates: Partial<AutomationRule>): Promise<boolean> => {
    try {
      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.trigger_event_type !== undefined) dbUpdates.trigger_event_type = updates.trigger_event_type;
      if (updates.conditions !== undefined) dbUpdates.conditions = updates.conditions as Json;
      if (updates.actions !== undefined) dbUpdates.actions = updates.actions as unknown as Json;
      if (updates.account_id !== undefined) dbUpdates.account_id = updates.account_id;
      if (updates.is_enabled !== undefined) dbUpdates.is_enabled = updates.is_enabled;

      const { error } = await supabase
        .from('automation_rules')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      return true;
    } catch (err) {
      console.error('[useAutomationRules] Update error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar regra');
      return false;
    }
  }, []);

  const deleteRule = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRules(prev => prev.filter(r => r.id !== id));
      return true;
    } catch (err) {
      console.error('[useAutomationRules] Delete error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir regra');
      return false;
    }
  }, []);

  const toggleRule = useCallback(async (id: string, isEnabled: boolean): Promise<boolean> => {
    return updateRule(id, { is_enabled: isEnabled });
  }, [updateRule]);

  return {
    rules,
    loading,
    error,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    refetch: fetchRules,
  };
}
