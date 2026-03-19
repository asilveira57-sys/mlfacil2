import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useToast } from '@/hooks/use-toast';

export interface CatalogWidget {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  tamanho_padrao: string;
  ativo: boolean;
  ordem: number;
  modulo_dependente: string | null;
  plano_minimo: string | null;
}

export interface UserWidget {
  id: string;
  tenant_id: string;
  user_id: string;
  widget_slug: string;
  posicao_x: number;
  posicao_y: number;
  largura: number;
  altura: number;
  fixado: boolean;
  visivel: boolean;
  config_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

const SIZE_MAP: Record<string, { w: number; h: number }> = {
  small: { w: 1, h: 1 },
  medium: { w: 2, h: 1 },
  large: { w: 2, h: 2 },
};

async function getCurrentUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export function useWidgetCatalog() {
  return useQuery({
    queryKey: ['widget-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('widget_catalog')
        .select('*')
        .eq('ativo', true)
        .order('ordem');
      if (error) throw error;
      return (data ?? []) as CatalogWidget[];
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useUserWidgets() {
  const { activeAccount } = useActiveAccount();
  const tenantId = activeAccount?.companyId;

  return useQuery({
    queryKey: ['user-dashboard-widgets', tenantId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const effectiveTenant = tenantId || userId;
      const { data, error } = await supabase
        .from('user_dashboard_widgets')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', effectiveTenant)
        .eq('visivel', true)
        .order('posicao_y')
        .order('posicao_x');
      if (error) throw error;
      return (data ?? []) as UserWidget[];
    },
    enabled: true,
  });
}

async function logWidgetAction(tenantId: string, userId: string, slug: string, acao: string, metadata?: Record<string, any>) {
  await supabase.from('widget_usage_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    widget_slug: slug,
    acao,
    metadata: metadata ?? {},
  } as any);
}

async function emitWidgetEvent(tenantId: string, userId: string, slug: string, evento: string, valor?: string, contexto?: Record<string, any>) {
  await supabase.from('widget_event_stream').insert({
    tenant_id: tenantId,
    user_id: userId,
    widget_slug: slug,
    evento,
    valor: valor ?? null,
    contexto: contexto ?? {},
  } as any);
}

export function useWidgetActions() {
  const qc = useQueryClient();
  const { activeAccount } = useActiveAccount();
  const tenantId = activeAccount?.companyId ?? '';
  const { toast } = useToast();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['user-dashboard-widgets'] });

  const addWidget = useMutation({
    mutationFn: async (catalog: CatalogWidget) => {
      const userId = await getCurrentUserId();
      if (!userId || !tenantId) throw new Error('Auth required');
      const size = SIZE_MAP[catalog.tamanho_padrao] ?? SIZE_MAP.medium;

      const { error } = await supabase.from('user_dashboard_widgets').insert({
        tenant_id: tenantId,
        user_id: userId,
        widget_slug: catalog.slug,
        largura: size.w,
        altura: size.h,
        posicao_x: 0,
        posicao_y: 999,
      } as any);
      if (error) throw error;

      await logWidgetAction(tenantId, userId, catalog.slug, 'adicionar_widget');
      await emitWidgetEvent(tenantId, userId, catalog.slug, 'widget_adicionado');
    },
    onSuccess: () => { invalidate(); toast({ title: 'Widget adicionado' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const removeWidget = useMutation({
    mutationFn: async (widget: UserWidget) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Auth required');
      await supabase.from('user_dashboard_widgets').delete().eq('id', widget.id);
      await logWidgetAction(tenantId, userId, widget.widget_slug, 'remover_widget');
      await emitWidgetEvent(tenantId, userId, widget.widget_slug, 'widget_removido');
    },
    onSuccess: invalidate,
  });

  const togglePin = useMutation({
    mutationFn: async (widget: UserWidget) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Auth required');
      const newVal = !widget.fixado;
      await supabase.from('user_dashboard_widgets').update({ fixado: newVal, updated_at: new Date().toISOString() } as any).eq('id', widget.id);
      await logWidgetAction(tenantId, userId, widget.widget_slug, 'fixar_widget', { fixado: newVal });
      await emitWidgetEvent(tenantId, userId, widget.widget_slug, 'widget_fixado', String(newVal));
    },
    onSuccess: invalidate,
  });

  const moveWidget = useMutation({
    mutationFn: async ({ widgetId, slug, x, y }: { widgetId: string; slug: string; x: number; y: number }) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Auth required');
      await supabase.from('user_dashboard_widgets').update({ posicao_x: x, posicao_y: y, updated_at: new Date().toISOString() } as any).eq('id', widgetId);
      await logWidgetAction(tenantId, userId, slug, 'mover_widget', { x, y });
      await emitWidgetEvent(tenantId, userId, slug, 'widget_movido');
    },
    onSuccess: invalidate,
  });

  const resizeWidget = useMutation({
    mutationFn: async ({ widgetId, slug, w, h }: { widgetId: string; slug: string; w: number; h: number }) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Auth required');
      await supabase.from('user_dashboard_widgets').update({ largura: w, altura: h, updated_at: new Date().toISOString() } as any).eq('id', widgetId);
      await logWidgetAction(tenantId, userId, slug, 'redimensionar_widget', { w, h });
    },
    onSuccess: invalidate,
  });

  const resetLayout = useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId || !tenantId) throw new Error('Auth required');
      await supabase.from('user_dashboard_widgets').delete().eq('user_id', userId).eq('tenant_id', tenantId);
      await logWidgetAction(tenantId, userId, 'all', 'restaurar_layout');
      await emitWidgetEvent(tenantId, userId, 'all', 'layout_restaurado');
    },
    onSuccess: () => { invalidate(); toast({ title: 'Layout restaurado' }); },
  });

  const reorderWidgets = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Auth required');
      const updates = orderedIds.map((id, i) =>
        supabase.from('user_dashboard_widgets').update({ posicao_y: i, updated_at: new Date().toISOString() } as any).eq('id', id)
      );
      await Promise.all(updates);
      await emitWidgetEvent(tenantId, userId, 'all', 'layout_personalizado');
    },
    onSuccess: invalidate,
  });

  return { addWidget, removeWidget, togglePin, moveWidget, resizeWidget, resetLayout, reorderWidgets };
}
