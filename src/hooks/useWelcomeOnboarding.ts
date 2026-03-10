import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface OnboardingFlow {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  aplicacao_planos: string[] | null;
  aplicacao_perfis: string[] | null;
  versao: number;
  prioridade: number;
  exigir_conclusao: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStep {
  id: string;
  flow_id: string;
  ordem: number;
  tipo: 'texto' | 'midia' | 'video' | 'pergunta' | 'checklist' | 'aviso' | 'acao';
  titulo: string;
  conteudo: string | null;
  media_url: string | null;
  video_url: string | null;
  cta_label: string | null;
  cta_route: string | null;
  obrigatoria: boolean;
  validacao_schema: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingUserProgress {
  id: string;
  company_id: string;
  seller_id: string;
  user_id: string;
  flow_id: string;
  flow_versao: number;
  status: 'in_progress' | 'completed' | 'skipped' | 'forced_pending';
  step_atual: number;
  started_at: string;
  completed_at: string | null;
  ip_inicio: string | null;
  ip_fim: string | null;
  user_agent: string | null;
  origem: string | null;
  consent_hash: string | null;
  payload_respostas: Record<string, unknown>;
}

// ── Logger helper ─────────────────────────────────────────────────────────────
function logOnboardingEvent(action: string, userId?: string, meta?: Record<string, unknown>) {
  supabase
    .rpc('register_system_log', {
      p_level: 'info',
      p_system_area: 'onboarding',
      p_action: action,
      p_user_id: userId,
      p_meta_json: JSON.parse(JSON.stringify(meta ?? {})),
      p_success: true,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('[OnboardingLog]', error.message);
    });
}

// ── IP detection ──────────────────────────────────────────────────────────────
async function getUserIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    return data.ip ?? null;
  } catch {
    return null;
  }
}

function generateConsentHash(flowId: string, versao: number, steps: OnboardingStep[]): string {
  const raw = `${flowId}|${versao}|${steps.map(s => s.id).join(',')}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// ── Fetch active flow for user ────────────────────────────────────────────────
export function useActiveOnboardingFlow(userId: string | null, companyId: string | null) {
  return useQuery({
    queryKey: ['onboarding-active-flow', userId, companyId],
    enabled: !!userId && !!companyId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
    queryFn: async () => {
      if (!userId || !companyId) return null;

      // Get active flows ordered by priority desc
      const { data: flows, error: flowsError } = await supabase
        .from('onboarding_flows')
        .select('*')
        .eq('ativo', true)
        .order('prioridade', { ascending: false });

      if (flowsError || !flows || flows.length === 0) return null;

      for (const flow of flows) {
        const { data: progress } = await supabase
          .from('onboarding_user_progress')
          .select('id, status, step_atual, payload_respostas, flow_versao, started_at, company_id, seller_id, user_id, flow_id, completed_at, ip_inicio, ip_fim, user_agent, origem, consent_hash')
          .eq('user_id', userId)
          .eq('flow_id', flow.id)
          .eq('flow_versao', flow.versao)
          .maybeSingle();

        // Skip if completed or skipped
        if (progress && (progress.status === 'completed' || progress.status === 'skipped')) {
          continue;
        }

        const { data: steps, error: stepsError } = await supabase
          .from('onboarding_steps')
          .select('*')
          .eq('flow_id', flow.id)
          .order('ordem', { ascending: true });

        if (stepsError || !steps || steps.length === 0) continue;

        const typedProgress: OnboardingUserProgress | null = progress
          ? {
              ...progress,
              status: progress.status as OnboardingUserProgress['status'],
              payload_respostas: (progress.payload_respostas as Record<string, unknown>) ?? {},
            }
          : null;

        return {
          flow: flow as OnboardingFlow,
          steps: steps.map(s => ({ ...s, validacao_schema: s.validacao_schema as Record<string, unknown> | null })) as OnboardingStep[],
          progress: typedProgress,
        };
      }

      return null;
    },
  });
}

// ── Start or resume progress ──────────────────────────────────────────────────
export function useStartOnboardingProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId, companyId, sellerId, flow,
    }: {
      userId: string;
      companyId: string;
      sellerId: string;
      flow: OnboardingFlow;
    }) => {
      const ip = await getUserIp();
      const ua = navigator.userAgent;

      // Try to insert; if already exists, fetch the existing row
      const { data, error } = await supabase
        .from('onboarding_user_progress')
        .upsert({
          company_id: companyId,
          seller_id: sellerId,
          user_id: userId,
          flow_id: flow.id,
          flow_versao: flow.versao,
          status: 'in_progress',
          step_atual: 1,
          ip_inicio: ip,
          user_agent: ua,
          origem: 'web',
          started_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,seller_id,user_id,flow_id,flow_versao',
          ignoreDuplicates: true,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      // When ignoreDuplicates is true and row already exists, data is null.
      // Fetch the existing progress row in that case.
      if (data) return data;

      const { data: existing, error: fetchErr } = await supabase
        .from('onboarding_user_progress')
        .select('*')
        .eq('company_id', companyId)
        .eq('seller_id', sellerId)
        .eq('user_id', userId)
        .eq('flow_id', flow.id)
        .eq('flow_versao', flow.versao)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      return existing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-active-flow'] });
    },
    onError: (error) => {
      console.error('[startOnboardingProgress] Falha ao salvar progresso:', error);
    },
  });
}

// ── Record step event ─────────────────────────────────────────────────────────
export function useRecordStepEvent() {
  return useMutation({
    mutationFn: async ({
      companyId, sellerId, userId, flowId, flowVersao, step, evento, details,
    }: {
      companyId: string;
      sellerId: string;
      userId: string;
      flowId: string;
      flowVersao: number;
      step: OnboardingStep;
      evento: 'view' | 'next' | 'back' | 'submit' | 'fail_validation' | 'cta_click';
      details?: Record<string, unknown>;
    }) => {
      const ip = await getUserIp();
      const ua = navigator.userAgent;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('onboarding_step_events').insert({
        company_id: companyId,
        seller_id: sellerId,
        user_id: userId,
        flow_id: flowId,
        flow_versao: flowVersao,
        step_id: step.id,
        step_ordem: step.ordem,
        evento,
        ip,
        user_agent: ua,
        details: (details ?? {}) as any,
      } as any);

      logOnboardingEvent(`onboarding_step_${evento}`, userId, {
        flow_id: flowId, step_id: step.id, step_ordem: step.ordem,
      });
    },
  });
}

// ── Update progress (step advance/back) ───────────────────────────────────────
export function useUpdateOnboardingProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      progressId, stepAtual, payloadRespostas,
    }: {
      progressId: string;
      stepAtual: number;
      payloadRespostas?: Record<string, unknown>;
    }) => {
      const updates: Record<string, unknown> = {
        step_atual: stepAtual,
        updated_at: new Date().toISOString(),
      };
      if (payloadRespostas) updates.payload_respostas = payloadRespostas;

      const { error } = await supabase
        .from('onboarding_user_progress')
        .update(updates)
        .eq('id', progressId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-active-flow'] });
    },
  });
}

// ── Complete onboarding ───────────────────────────────────────────────────────
export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      progressId, flow, steps, userId, companyId, sellerId, payloadRespostas, startedAt,
    }: {
      progressId: string;
      flow: OnboardingFlow;
      steps: OnboardingStep[];
      userId: string;
      companyId: string;
      sellerId: string;
      payloadRespostas: Record<string, unknown>;
      startedAt: string;
    }) => {
      const ip = await getUserIp();
      const ua = navigator.userAgent;
      const completedAt = new Date().toISOString();
      const consentHash = generateConsentHash(flow.id, flow.versao, steps);
      const duracao = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);

      const { error } = await supabase
        .from('onboarding_user_progress')
        .update({
          status: 'completed',
          completed_at: completedAt,
          ip_fim: ip,
          consent_hash: consentHash,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload_respostas: payloadRespostas as any,
          updated_at: completedAt,
        })
        .eq('id', progressId);

      if (error) throw error;

      // Log timeline event: onboarding_completed
      await supabase.from('timeline_events').insert({
        company_id: companyId,
        seller_id: sellerId,
        user_id: userId,
        event_type: 'onboarding_completed',
        event_title: 'Boas-Vindas concluído',
        occurred_at: completedAt,
        ip,
        user_agent: ua,
        source: 'onboarding',
        event_payload: {
          flow_id: flow.id,
          flow_versao: flow.versao,
          flow_slug: flow.slug,
          duracao_segundos: duracao,
          total_steps: steps.length,
          consent_hash: consentHash,
          user_agent: ua,
        },
      });

      logOnboardingEvent('onboarding_completed', userId, {
        flow_id: flow.id, versao: flow.versao, duracao_segundos: duracao, consent_hash: consentHash,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-active-flow'] });
      toast.success('Boas-Vindas concluído! Bem-vindo ao Marketplace Fácil 🎉');
    },
  });
}

// ── Skip onboarding ───────────────────────────────────────────────────────────
export function useSkipOnboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ progressId }: { progressId: string }) => {
      const { error } = await supabase
        .from('onboarding_user_progress')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', progressId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-active-flow'] });
    },
  });
}

// ── Admin: list all flows (no limit) ─────────────────────────────────────────
export function useAdminOnboardingFlows() {
  return useQuery({
    queryKey: ['admin-onboarding-flows'],
    queryFn: async () => {
      let all: OnboardingFlow[] = [];
      let from = 0;
      const PAGE = 500;
      while (true) {
        const { data, error } = await supabase
          .from('onboarding_flows')
          .select('*')
          .order('prioridade', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data as OnboardingFlow[]);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
  });
}

// ── Admin: list all steps for a flow ─────────────────────────────────────────
export function useAdminOnboardingSteps(flowId: string | null) {
  return useQuery({
    queryKey: ['admin-onboarding-steps', flowId],
    enabled: !!flowId,
    queryFn: async () => {
      if (!flowId) return [];
      const { data, error } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('flow_id', flowId)
        .order('ordem', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(s => ({
        ...s,
        validacao_schema: s.validacao_schema as Record<string, unknown> | null,
      })) as OnboardingStep[];
    },
  });
}

// ── Admin: upsert flow ────────────────────────────────────────────────────────
export function useUpsertOnboardingFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (flow: Partial<OnboardingFlow> & { slug: string; nome: string }) => {
      const { data, error } = flow.id
        ? await supabase.from('onboarding_flows').update(flow).eq('id', flow.id).select().single()
        : await supabase.from('onboarding_flows').insert(flow).select().single();
      if (error) throw error;
      return data as OnboardingFlow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-onboarding-flows'] });
      toast.success('Fluxo salvo com sucesso');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Admin: upsert step ────────────────────────────────────────────────────────
export function useUpsertOnboardingStep() {
  const queryClient = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (step: Partial<OnboardingStep> & { flow_id: string; ordem: number; tipo: string; titulo: string }) => {
      const payload = { ...step, validacao_schema: step.validacao_schema as any } as any;
      const { data, error } = step.id
        ? await supabase.from('onboarding_steps').update(payload).eq('id', step.id).select().single()
        : await supabase.from('onboarding_steps').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-onboarding-steps', vars.flow_id] });
      toast.success('Etapa salva');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Admin: delete step ────────────────────────────────────────────────────────
export function useDeleteOnboardingStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, flowId }: { stepId: string; flowId: string }) => {
      const { error } = await supabase.from('onboarding_steps').delete().eq('id', stepId);
      if (error) throw error;
      return flowId;
    },
    onSuccess: (flowId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-onboarding-steps', flowId] });
      toast.success('Etapa removida');
    },
  });
}

// ── Admin: force reapply flow ─────────────────────────────────────────────────
export function useForceOnboardingReapply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ flowId }: { flowId: string }) => {
      // Mark all non-completed as forced_pending
      const { error } = await supabase
        .from('onboarding_user_progress')
        .update({ status: 'forced_pending', updated_at: new Date().toISOString() })
        .eq('flow_id', flowId)
        .in('status', ['completed', 'skipped']);
      if (error) throw error;

      logOnboardingEvent('onboarding_admin_force_reapply', undefined, { flow_id: flowId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-onboarding-flows'] });
      toast.success('Reapresentação forçada para todos os usuários');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Admin: audit stats for a flow ────────────────────────────────────────────
export function useOnboardingFlowAudit(flowId: string | null) {
  return useQuery({
    queryKey: ['admin-onboarding-audit', flowId],
    enabled: !!flowId,
    queryFn: async () => {
      if (!flowId) return null;

      const { data, error } = await supabase
        .from('onboarding_user_progress')
        .select('status, started_at, completed_at, ip_inicio, ip_fim, user_id')
        .eq('flow_id', flowId)
        .order('started_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      const completed = rows.filter(r => r.status === 'completed');
      const skipped = rows.filter(r => r.status === 'skipped');
      const inProgress = rows.filter(r => r.status === 'in_progress');

      const avgSeconds = completed.length > 0
        ? Math.round(
            completed
              .filter(r => r.completed_at)
              .reduce((acc, r) => {
                return acc + (new Date(r.completed_at!).getTime() - new Date(r.started_at).getTime()) / 1000;
              }, 0) / completed.length
          )
        : 0;

      return {
        total: rows.length,
        completed: completed.length,
        skipped: skipped.length,
        inProgress: inProgress.length,
        avgSeconds,
        rows,
      };
    },
  });
}
