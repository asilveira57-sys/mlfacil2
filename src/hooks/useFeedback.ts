import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────
export type ModuleFeedback = {
  id: string;
  seller_id: string;
  user_id: string;
  module_slug: string;
  rating: number;
  comment: string | null;
  tags: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SystemFeedback = {
  id: string;
  seller_id: string;
  user_id: string;
  rating: number;
  nps: number | null;
  comment: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Testimonial = {
  id: string;
  seller_id: string;
  source: string;
  source_id: string | null;
  display_name: string;
  company_name: string | null;
  role: string | null;
  avatar_url: string | null;
  quote: string;
  rating: number | null;
  featured: boolean;
  published: boolean;
  published_at: string | null;
  consent_status: string;
  created_at: string;
  updated_at: string;
};

export type FeedbackDisplayRule = {
  id: string;
  kind: string;
  module_slug: string | null;
  min_events: number;
  min_days_since_first_use: number;
  cooldown_days: number;
  only_after_paid: boolean;
  only_after_first_renewal: boolean;
  enabled: boolean;
};

export type UserModuleUsage = {
  id: string;
  seller_id: string;
  user_id: string;
  module_slug: string;
  first_seen_at: string;
  last_seen_at: string;
  views_count: number;
  actions_count: number;
  last_action_at: string | null;
};

// ─── Module Feedback ─────────────────────────────────────────
export function useMyModuleFeedback(moduleSlug: string | undefined, userId: string | undefined, sellerId: string | undefined) {
  return useQuery({
    queryKey: ['my-module-feedback', moduleSlug, userId, sellerId],
    queryFn: async () => {
      if (!moduleSlug || !userId || !sellerId) return null;
      const { data } = await supabase
        .from('module_feedback')
        .select('*')
        .eq('module_slug', moduleSlug)
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      return data as ModuleFeedback | null;
    },
    enabled: !!moduleSlug && !!userId && !!sellerId,
  });
}

export function useUpsertModuleFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      sellerId: string;
      moduleSlug: string;
      rating: number;
      comment?: string;
      tags?: string[];
    }) => {
      // Check existing
      const { data: existing } = await supabase
        .from('module_feedback')
        .select('id')
        .eq('user_id', params.userId)
        .eq('seller_id', params.sellerId)
        .eq('module_slug', params.moduleSlug)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('module_feedback')
          .update({
            rating: params.rating,
            comment: params.comment || null,
            tags: params.tags || null,
            status: 'submitted',
          })
          .eq('id', existing.id)
          .select('id')
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('module_feedback')
          .insert({
            user_id: params.userId,
            seller_id: params.sellerId,
            module_slug: params.moduleSlug,
            rating: params.rating,
            comment: params.comment || null,
            tags: params.tags || null,
            status: 'submitted',
          })
          .select('id')
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my-module-feedback', vars.moduleSlug] });
    },
  });
}

// ─── System Feedback ─────────────────────────────────────────
export function useMySystemFeedback(userId: string | undefined, sellerId: string | undefined) {
  return useQuery({
    queryKey: ['my-system-feedback', userId, sellerId],
    queryFn: async () => {
      if (!userId || !sellerId) return null;
      const { data } = await supabase
        .from('system_feedback')
        .select('*')
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      return data as SystemFeedback | null;
    },
    enabled: !!userId && !!sellerId,
  });
}

export function useUpsertSystemFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      sellerId: string;
      rating: number;
      nps?: number;
      comment?: string;
    }) => {
      const { data: existing } = await supabase
        .from('system_feedback')
        .select('id')
        .eq('user_id', params.userId)
        .eq('seller_id', params.sellerId)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('system_feedback')
          .update({
            rating: params.rating,
            nps: params.nps ?? null,
            comment: params.comment || null,
            status: 'submitted',
          })
          .eq('id', existing.id)
          .select('id')
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('system_feedback')
          .insert({
            user_id: params.userId,
            seller_id: params.sellerId,
            rating: params.rating,
            nps: params.nps ?? null,
            comment: params.comment || null,
            status: 'submitted',
          })
          .select('id')
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my-system-feedback', vars.userId] });
    },
  });
}

// ─── Display Rules ───────────────────────────────────────────
export function useFeedbackDisplayRules() {
  return useQuery({
    queryKey: ['feedback-display-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback_display_rules')
        .select('*')
        .eq('enabled', true);
      if (error) throw error;
      return (data || []) as FeedbackDisplayRule[];
    },
  });
}

// ─── Module Usage ────────────────────────────────────────────
export function useMyModuleUsage(moduleSlug: string | undefined, userId: string | undefined, sellerId: string | undefined) {
  return useQuery({
    queryKey: ['my-module-usage', moduleSlug, userId, sellerId],
    queryFn: async () => {
      if (!moduleSlug || !userId || !sellerId) return null;
      const { data } = await supabase
        .from('user_module_usage')
        .select('*')
        .eq('module_slug', moduleSlug)
        .eq('user_id', userId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      return data as UserModuleUsage | null;
    },
    enabled: !!moduleSlug && !!userId && !!sellerId,
  });
}

export function useTrackModuleUsage() {
  return useMutation({
    mutationFn: async (params: { userId: string; sellerId: string; moduleSlug: string; isAction?: boolean }) => {
      const { error } = await supabase.rpc('track_module_usage', {
        p_user_id: params.userId,
        p_seller_id: params.sellerId,
        p_module_slug: params.moduleSlug,
        p_is_action: params.isAction ?? false,
      });
      if (error) throw error;
    },
  });
}

// ─── Should Show Feedback Prompt ─────────────────────────────
export function useShouldShowFeedbackPrompt(
  kind: 'module' | 'system',
  moduleSlug: string | undefined,
  userId: string | undefined,
  sellerId: string | undefined
) {
  const { data: rules } = useFeedbackDisplayRules();
  const { data: usage } = useMyModuleUsage(
    kind === 'module' ? moduleSlug : undefined,
    userId,
    sellerId
  );
  const { data: existingFeedback } = kind === 'module'
    ? useMyModuleFeedback(moduleSlug, userId, sellerId)
    : useMySystemFeedback(userId, sellerId);

  const shouldShow = (() => {
    if (!rules || !userId || !sellerId) return false;

    const rule = rules.find(r => {
      if (r.kind !== kind) return false;
      if (kind === 'module' && r.module_slug && r.module_slug !== moduleSlug) return false;
      return true;
    });

    if (!rule) return false;

    // If already has feedback, check cooldown
    if (existingFeedback) {
      const lastDate = new Date(existingFeedback.updated_at);
      const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < rule.cooldown_days) return false;
    }

    // For module feedback, check usage
    if (kind === 'module' && usage) {
      const totalEvents = usage.views_count + usage.actions_count;
      if (totalEvents < rule.min_events) return false;

      const daysSinceFirst = (Date.now() - new Date(usage.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst < rule.min_days_since_first_use) return false;
    } else if (kind === 'module' && !usage) {
      return false;
    }

    return true;
  })();

  return shouldShow;
}

// ─── Admin Hooks ─────────────────────────────────────────────
export function useAdminModuleFeedback() {
  return useQuery({
    queryKey: ['admin-module-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ModuleFeedback[];
    },
  });
}

export function useAdminSystemFeedback() {
  return useQuery({
    queryKey: ['admin-system-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SystemFeedback[];
    },
  });
}

export function useAdminTestimonials() {
  const qc = useQueryClient();

  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ['admin-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('testimonials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Testimonial[];
    },
  });

  const togglePublished = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from('testimonials')
        .update({
          published,
          published_at: published ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-testimonials'] }),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const { error } = await supabase
        .from('testimonials')
        .update({ featured })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-testimonials'] }),
  });

  return { testimonials, isLoading, togglePublished, toggleFeatured };
}

export function useAdminUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ table, id, status }: { table: 'module_feedback' | 'system_feedback'; id: string; status: string }) => {
      const { error } = await supabase
        .from(table)
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-module-feedback'] });
      qc.invalidateQueries({ queryKey: ['admin-system-feedback'] });
    },
  });
}

export function useAdminCreateTestimonial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sellerId: string;
      source: string;
      sourceId?: string;
      displayName: string;
      companyName?: string;
      quote: string;
      rating?: number;
    }) => {
      const { error } = await supabase.from('testimonials').insert({
        seller_id: params.sellerId,
        source: params.source,
        source_id: params.sourceId || null,
        display_name: params.displayName,
        company_name: params.companyName || null,
        quote: params.quote,
        rating: params.rating || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-testimonials'] }),
  });
}
