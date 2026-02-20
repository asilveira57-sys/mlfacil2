import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────
export type ModuleRating = {
  id: string;
  module_id: string;
  user_id: string;
  stars: number;
  comment: string | null;
  is_public: boolean;
  is_hidden_by_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type SystemRating = {
  id: string;
  user_id: string;
  stars: number;
  comment: string | null;
  is_hidden_by_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type RatingStats = {
  avg_stars: number;
  ratings_count: number;
  stars_1: number;
  stars_2: number;
  stars_3: number;
  stars_4: number;
  stars_5: number;
  last_rating_at: string | null;
};

export type ConsentTemplate = {
  id: string;
  key: string;
  title: string;
  body: string;
  version: number;
};

// ─── Module Ratings ──────────────────────────────────────────
export function useModuleRatingStats(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['module-rating-stats', moduleId],
    queryFn: async () => {
      if (!moduleId) return null;
      const { data } = await supabase
        .from('module_rating_stats')
        .select('*')
        .eq('module_id', moduleId)
        .maybeSingle();
      return data as RatingStats | null;
    },
    enabled: !!moduleId,
  });
}

export function useMyModuleRating(moduleId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['my-module-rating', moduleId, userId],
    queryFn: async () => {
      if (!moduleId || !userId) return null;
      const { data } = await supabase
        .from('module_ratings')
        .select('*')
        .eq('module_id', moduleId)
        .eq('user_id', userId)
        .maybeSingle();
      return data as ModuleRating | null;
    },
    enabled: !!moduleId && !!userId,
  });
}

export function useModuleRatingsList(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['module-ratings-list', moduleId],
    queryFn: async () => {
      if (!moduleId) return [];
      const { data } = await supabase
        .from('module_ratings')
        .select('*')
        .eq('module_id', moduleId)
        .eq('is_public', true)
        .eq('is_hidden_by_admin', false)
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []) as ModuleRating[];
    },
    enabled: !!moduleId,
  });
}

export function useUpsertModuleRating(moduleId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, stars, comment, isPublic }: { userId: string; stars: number; comment?: string; isPublic?: boolean }) => {
      if (!moduleId) throw new Error('No module');
      const { error } = await supabase
        .from('module_ratings')
        .upsert(
          { module_id: moduleId, user_id: userId, stars, comment: comment || null, is_public: isPublic ?? true },
          { onConflict: 'module_id,user_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-rating-stats', moduleId] });
      qc.invalidateQueries({ queryKey: ['my-module-rating', moduleId] });
      qc.invalidateQueries({ queryKey: ['module-ratings-list', moduleId] });
    },
  });
}

// ─── System Rating ───────────────────────────────────────────
export function useSystemRatingStats() {
  return useQuery({
    queryKey: ['system-rating-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_rating_stats')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as RatingStats | null;
    },
  });
}

export function useMySystemRating(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-system-rating', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('system_ratings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      return data as SystemRating | null;
    },
    enabled: !!userId,
  });
}

export function useUpsertSystemRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, stars, comment }: { userId: string; stars: number; comment?: string }) => {
      // Check if rating already exists
      const { data: existing } = await supabase
        .from('system_ratings')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('system_ratings')
          .update({ stars, comment: comment || null })
          .eq('user_id', userId)
          .select('id')
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('system_ratings')
          .insert({ user_id: userId, stars, comment: comment || null })
          .select('id')
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-rating-stats'] });
      qc.invalidateQueries({ queryKey: ['my-system-rating'] });
    },
  });
}

// ─── Consent ─────────────────────────────────────────────────
export function useActiveConsentTemplate(key: string) {
  return useQuery({
    queryKey: ['consent-template', key],
    queryFn: async () => {
      const { data } = await supabase
        .from('consent_templates')
        .select('*')
        .eq('key', key)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as ConsentTemplate | null;
    },
  });
}

export function useSubmitConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      templateId: string;
      consentKey: string;
      consentVersion: number;
      accepted: boolean;
      source: string;
      metadata?: Record<string, any>;
    }) => {
      const { error, data } = await supabase
        .from('rating_consents')
        .insert({
          user_id: params.userId,
          template_id: params.templateId,
          consent_key: params.consentKey,
          consent_version: params.consentVersion,
          accepted: params.accepted,
          source: params.source,
          ip_address: null,
          user_agent: navigator.userAgent,
          metadata: params.metadata || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-consents'] });
    },
  });
}

export function useMyConsents(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-consents', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('rating_consents')
        .select('*, consent_templates!inner(title, body)')
        .eq('user_id', userId)
        .order('accepted_at', { ascending: false });
      return data || [];
    },
    enabled: !!userId,
  });
}

// ─── Testimonial Candidate ──────────────────────────────────
export function useCreateTestimonialCandidate() {
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      sourceType: string;
      sourceId: string;
      stars: number;
      text?: string;
      channels: string[];
      consentId?: string;
    }) => {
      const { error } = await supabase.from('testimonial_candidates').insert({
        user_id: params.userId,
        source_type: params.sourceType,
        source_id: params.sourceId,
        stars: params.stars,
        text: params.text || null,
        suggested_channels: params.channels,
        consent_id: params.consentId || null,
        status: 'pending',
      });
      if (error) throw error;
    },
  });
}

// ─── Admin Hooks ─────────────────────────────────────────────
export function useAdminTestimonialCandidates() {
  const qc = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['admin-testimonial-candidates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('testimonial_candidates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      const { error } = await supabase
        .from('testimonial_candidates')
        .update({ status, admin_notes: adminNotes || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-testimonial-candidates'] }),
  });

  const publish = useMutation({
    mutationFn: async (candidate: any) => {
      // Create public testimonial
      const { error: pubError } = await supabase.from('public_testimonials').insert({
        candidate_id: candidate.id,
        user_id: candidate.user_id,
        stars: candidate.stars,
        text: candidate.text || '',
        display_name: candidate.display_name || null,
        display_company: candidate.display_company || null,
        photo_url: candidate.photo_url || null,
        channels: candidate.suggested_channels || ['landing', 'social'],
      });
      if (pubError) throw pubError;

      // Update candidate status
      const { error: upError } = await supabase
        .from('testimonial_candidates')
        .update({ status: 'published' })
        .eq('id', candidate.id);
      if (upError) throw upError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-testimonial-candidates'] });
      qc.invalidateQueries({ queryKey: ['admin-public-testimonials'] });
    },
  });

  return { candidates, isLoading, updateStatus, publish };
}

export function useAdminPublicTestimonials() {
  const qc = useQueryClient();

  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ['admin-public-testimonials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_testimonials')
        .select('*')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('public_testimonials')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-public-testimonials'] }),
  });

  return { testimonials, isLoading, toggleActive };
}

export function useAdminAllRatings() {
  const qc = useQueryClient();

  const { data: moduleRatings = [], isLoading: loadingModuleRatings } = useQuery({
    queryKey: ['admin-module-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_ratings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: systemRatings = [], isLoading: loadingSystemRatings } = useQuery({
    queryKey: ['admin-system-ratings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_ratings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleHidden = useMutation({
    mutationFn: async ({ table, id, hidden, reason }: { table: 'module_ratings' | 'system_ratings'; id: string; hidden: boolean; reason?: string }) => {
      const { error } = await supabase
        .from(table)
        .update({ is_hidden_by_admin: hidden, hidden_reason: reason || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-module-ratings'] });
      qc.invalidateQueries({ queryKey: ['admin-system-ratings'] });
    },
  });

  return { moduleRatings, systemRatings, loadingModuleRatings, loadingSystemRatings, toggleHidden };
}
