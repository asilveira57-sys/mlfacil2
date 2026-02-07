import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  Template,
  TemplateVariant,
  TemplateAsset,
  TemplateRule,
  TemplateAuditLog,
  DesignTokens,
  TemplateScope,
  RuleType,
} from '@/types/templates';
import type { Json } from '@/integrations/supabase/types';

// ---- Helpers ----
async function fetchAllRows<T>(
  queryBuilder: any
): Promise<T[]> {
  const PAGE = 1000;
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ---- Templates CRUD ----
export function useTemplatesList() {
  return useQuery({
    queryKey: ['templates', 'list'],
    queryFn: async () => {
      const data = await fetchAllRows<Template>(
        supabase.from('templates').select('*').order('created_at', { ascending: false })
      );
      return data;
    },
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: ['templates', 'detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Template;
    },
  });
}

export function useTemplateMutations() {
  const qc = useQueryClient();

  const createTemplate = useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      scope: TemplateScope;
      is_system_default?: boolean;
      owner_workspace_id?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('templates')
        .insert({ ...payload, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      // Audit
      await supabase.from('template_audit_log').insert({
        actor_user_id: user?.id,
        action: 'create',
        template_id: (data as any).id,
        payload: payload as unknown as Json,
      } as any);
      return data as Template;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template criado');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Template> & { id: string }) => {
      const { data, error } = await supabase
        .from('templates')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('template_audit_log').insert({
        actor_user_id: user?.id,
        action: 'update',
        template_id: id,
        payload: updates as unknown as Json,
      } as any);
      return data as Template;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template atualizado');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('templates')
        .update({ is_active } as any)
        .eq('id', id);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('template_audit_log').insert({
        actor_user_id: user?.id,
        action: is_active ? 'activate' : 'deactivate',
        template_id: id,
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Status atualizado');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const duplicateTemplate = useMutation({
    mutationFn: async (sourceId: string) => {
      // Fetch source
      const { data: source, error: srcErr } = await supabase
        .from('templates')
        .select('*')
        .eq('id', sourceId)
        .single();
      if (srcErr || !source) throw srcErr || new Error('Template não encontrado');
      
      const src = source as Template;
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create copy
      const { data: newTpl, error: insErr } = await supabase
        .from('templates')
        .insert({
          name: `${src.name} (Cópia)`,
          description: src.description,
          scope: src.scope,
          is_system_default: false,
          is_active: false,
          owner_workspace_id: src.owner_workspace_id,
          created_by: user?.id,
        } as any)
        .select()
        .single();
      if (insErr) throw insErr;
      
      const newId = (newTpl as any).id;
      
      // Copy variants
      const { data: variants } = await supabase
        .from('template_variants')
        .select('*')
        .eq('template_id', sourceId);
      
      if (variants && variants.length > 0) {
        await supabase.from('template_variants').insert(
          variants.map((v: any) => ({
            template_id: newId,
            variant_key: v.variant_key,
            design_tokens: v.design_tokens,
            preview_image_url: v.preview_image_url,
          }))
        );
      }
      
      // Audit
      await supabase.from('template_audit_log').insert({
        actor_user_id: user?.id,
        action: 'duplicate',
        template_id: newId,
        payload: { source_id: sourceId } as unknown as Json,
      } as any);
      
      return newTpl as Template;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Template duplicado');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return { createTemplate, updateTemplate, toggleActive, duplicateTemplate };
}

// ---- Variants ----
export function useTemplateVariants(templateId: string | null) {
  return useQuery({
    queryKey: ['templates', 'variants', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_variants')
        .select('*')
        .eq('template_id', templateId!);
      if (error) throw error;
      return data as TemplateVariant[];
    },
  });
}

export function useVariantMutations() {
  const qc = useQueryClient();

  const upsertVariant = useMutation({
    mutationFn: async (payload: {
      template_id: string;
      variant_key: string;
      design_tokens: DesignTokens;
      preview_image_url?: string;
    }) => {
      const { data, error } = await supabase
        .from('template_variants')
        .upsert({
          ...payload,
          design_tokens: payload.design_tokens as unknown as Json,
        } as any, { onConflict: 'template_id,variant_key' })
        .select()
        .single();
      if (error) throw error;
      return data as TemplateVariant;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['templates', 'variants', vars.template_id] });
      toast.success('Variante salva');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return { upsertVariant };
}

// ---- Assets ----
export function useTemplateAssets(templateId: string | null) {
  return useQuery({
    queryKey: ['templates', 'assets', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_assets')
        .select('*')
        .eq('template_id', templateId!);
      if (error) throw error;
      return data as TemplateAsset[];
    },
  });
}

export function useAssetMutations() {
  const qc = useQueryClient();

  const uploadAsset = useMutation({
    mutationFn: async (payload: {
      template_id: string;
      asset_type: TemplateAsset['asset_type'];
      file: File;
    }) => {
      const path = `${payload.template_id}/${payload.asset_type}/${Date.now()}_${payload.file.name}`;
      const { error: upErr } = await supabase.storage
        .from('template-assets')
        .upload(path, payload.file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage
        .from('template-assets')
        .getPublicUrl(path);

      const { data, error } = await supabase
        .from('template_assets')
        .insert({
          template_id: payload.template_id,
          asset_type: payload.asset_type,
          file_url: urlData.publicUrl,
          meta: { original_name: payload.file.name, size: payload.file.size },
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as TemplateAsset;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['templates', 'assets', vars.template_id] });
      toast.success('Asset enviado');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const deleteAsset = useMutation({
    mutationFn: async (asset: TemplateAsset) => {
      // Remove from storage
      const url = new URL(asset.file_url);
      const storagePath = url.pathname.split('/template-assets/')[1];
      if (storagePath) {
        await supabase.storage.from('template-assets').remove([storagePath]);
      }
      const { error } = await supabase
        .from('template_assets')
        .delete()
        .eq('id', asset.id);
      if (error) throw error;
    },
    onSuccess: (_, asset) => {
      qc.invalidateQueries({ queryKey: ['templates', 'assets', asset.template_id] });
      toast.success('Asset removido');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return { uploadAsset, deleteAsset };
}

// ---- Rules ----
export function useTemplateRules() {
  return useQuery({
    queryKey: ['templates', 'rules'],
    queryFn: async () => {
      const data = await fetchAllRows<TemplateRule & { template: Template }>(
        supabase
          .from('template_rules')
          .select('*, template:templates(*)')
          .order('priority', { ascending: true })
      );
      return data;
    },
  });
}

export function useRuleMutations() {
  const qc = useQueryClient();

  const upsertRule = useMutation({
    mutationFn: async (payload: Omit<TemplateRule, 'id' | 'created_at' | 'updated_at' | 'template'> & { id?: string }) => {
      const { template, ...clean } = payload as any;
      const { data, error } = await supabase
        .from('template_rules')
        .upsert(clean as any)
        .select()
        .single();
      if (error) throw error;
      return data as TemplateRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'rules'] });
      qc.invalidateQueries({ queryKey: ['theme-resolver'] });
      toast.success('Regra salva');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('template_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'rules'] });
      qc.invalidateQueries({ queryKey: ['theme-resolver'] });
      toast.success('Regra removida');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return { upsertRule, deleteRule };
}

// ---- Audit Log ----
export function useTemplateAuditLog(templateId?: string) {
  return useQuery({
    queryKey: ['templates', 'audit', templateId],
    queryFn: async () => {
      let query = supabase
        .from('template_audit_log')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (templateId) {
        query = query.eq('template_id', templateId);
      }
      
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as TemplateAuditLog[];
    },
  });
}
