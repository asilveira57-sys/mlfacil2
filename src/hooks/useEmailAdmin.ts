import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Types
export interface EmailProviderSettings {
  id: string;
  provider_type: string;
  is_enabled: boolean;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  api_key_encrypted: string | null;
  domain_verified: boolean;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailCategory {
  id: string;
  key: string;
  name: string;
  description: string | null;
  default_opt_in: boolean;
  can_user_opt_out: boolean;
  created_at: string;
}

export interface EmailTemplate {
  id: string;
  key: string;
  category_id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  variables_schema_json: string[];
  is_enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  action: string;
  source_type: string | null;
  source_id: string | null;
  event_key: string | null;
  email: string | null;
  template_id: string | null;
  queue_id: string | null;
  message: string | null;
  details_json: Record<string, unknown> | null;
  created_at: string;
}

// Provider Settings
export function useEmailProviderSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'email-provider'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_provider_settings')
        .select('*')
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as EmailProviderSettings) || null;
    },
  });

  const upsertProvider = useMutation({
    mutationFn: async (settings: Partial<EmailProviderSettings>) => {
      const existing = query.data;
      if (existing) {
        const { data, error } = await supabase
          .from('email_provider_settings')
          .update(settings as any)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('email_provider_settings')
          .insert(settings as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-provider'] });
      toast.success('Configurações do provedor salvas');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const testProvider = useMutation({
    mutationFn: async (to_email: string) => {
      const { data, error } = await supabase.functions.invoke('email-test-provider', {
        body: { to_email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-provider'] });
      toast.success('E-mail de teste enviado!');
    },
    onError: (err) => toast.error(`Erro no teste: ${err.message}`),
  });

  return { ...query, upsertProvider, testProvider };
}

// Categories
export function useEmailCategories() {
  return useQuery({
    queryKey: ['admin', 'email-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_categories')
        .select('*')
        .order('key');
      if (error) throw error;
      return data as unknown as EmailCategory[];
    },
  });
}

// Templates
export function useEmailTemplates() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as EmailTemplate[];
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailTemplate> & { id: string }) => {
      // Get current template for versioning
      const { data: current } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (current) {
        // Save current version
        await supabase.from('email_template_versions').insert({
          template_id: id,
          version: (current as any).version,
          subject: (current as any).subject,
          body_html: (current as any).body_html,
          body_text: (current as any).body_text,
          variables_schema_json: (current as any).variables_schema_json,
        });
      }

      const { data, error } = await supabase
        .from('email_templates')
        .update({ ...updates, version: ((current as any)?.version || 0) + 1 } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-templates'] });
      toast.success('Template atualizado');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const renderPreview = useMutation({
    mutationFn: async ({ template_id, variables }: { template_id: string; variables: Record<string, string> }) => {
      const { data, error } = await supabase.functions.invoke('email-render-template', {
        body: { template_id, variables },
      });
      if (error) throw error;
      return data as { subject: string; body_html: string; body_text: string; schema: string[] };
    },
  });

  return { ...query, updateTemplate, renderPreview };
}

// Logs
export function useEmailLogs() {
  return useQuery({
    queryKey: ['admin', 'email-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as EmailLog[];
    },
  });
}
