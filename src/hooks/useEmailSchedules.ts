import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface EmailSchedule {
  id: string;
  name: string;
  description: string | null;
  template_id: string;
  cron_expression: string;
  timezone: string;
  scope: string;
  segment_filter: Record<string, unknown>;
  variables_default: Record<string, unknown>;
  is_enabled: boolean;
  is_one_shot: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  template_name?: string;
}

export function useEmailSchedules() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'email-schedules'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('email_schedules')
        .select('*, email_templates(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        template_name: s.email_templates?.name,
        email_templates: undefined,
      })) as EmailSchedule[];
    },
  });

  const createSchedule = useMutation({
    mutationFn: async (schedule: Partial<EmailSchedule>) => {
      const { data, error } = await (supabase as any)
        .from('email_schedules')
        .insert(schedule)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-schedules'] });
      toast.success('Agendamento criado');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailSchedule> & { id: string }) => {
      const { template_name, ...clean } = updates as any;
      const { data, error } = await (supabase as any)
        .from('email_schedules')
        .update(clean)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-schedules'] });
      toast.success('Agendamento atualizado');
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const runNow = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await (supabase as any)
        .from('email_schedules')
        .update({ next_run_at: new Date().toISOString() })
        .eq('id', scheduleId);
      if (error) throw error;

      const { data, error: fnErr } = await supabase.functions.invoke('email-schedule-evaluate');
      if (fnErr) throw fnErr;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'email-schedules'] });
      toast.success(`Executado: ${data?.enqueued || 0} e-mails enfileirados`);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  return { ...query, createSchedule, updateSchedule, runNow };
}
