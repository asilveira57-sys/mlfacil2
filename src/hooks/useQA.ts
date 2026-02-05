import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  QaQuestion,
  QaResponse,
  QaDailyMetrics,
  QaLibraryResponse,
  QaResponseCategory,
  QaQuestionStatus,
  QaResponseSource,
} from '@/types/qa';

// =============================================
// QUESTIONS HOOKS
// =============================================

interface UseQuestionsOptions {
  sellerId: string | null;
  status?: QaQuestionStatus | 'all';
  riskLevel?: 'low' | 'medium' | 'high' | 'all';
  search?: string;
}

export function useQuestions({ sellerId, status = 'all', riskLevel = 'all', search }: UseQuestionsOptions) {
  return useQuery({
    queryKey: ['qa-questions', sellerId, status, riskLevel, search],
    queryFn: async () => {
      if (!sellerId) return [];

      let query = supabase
        .from('qa_questions')
        .select('*')
        .eq('seller_id', sellerId)
        .order('question_date', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (riskLevel !== 'all') {
        query = query.eq('risk_level', riskLevel);
      }

      if (search) {
        query = query.or(`question_text.ilike.%${search}%,item_title.ilike.%${search}%`);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return (data || []) as QaQuestion[];
    },
    enabled: !!sellerId,
  });
}

export function useQuestion(questionId: string | null) {
  return useQuery({
    queryKey: ['qa-question', questionId],
    queryFn: async () => {
      if (!questionId) return null;

      const { data, error } = await supabase
        .from('qa_questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (error) throw error;
      return data as QaQuestion;
    },
    enabled: !!questionId,
  });
}

export function useQuestionResponses(questionId: string | null) {
  return useQuery({
    queryKey: ['qa-responses', questionId],
    queryFn: async () => {
      if (!questionId) return [];

      const { data, error } = await supabase
        .from('qa_responses')
        .select('*')
        .eq('question_id', questionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as QaResponse[];
    },
    enabled: !!questionId,
  });
}

export function usePendingQuestionsCount(sellerId: string | null) {
  return useQuery({
    queryKey: ['qa-pending-count', sellerId],
    queryFn: async () => {
      if (!sellerId) return 0;

      const { count, error } = await supabase
        .from('qa_questions')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', sellerId)
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!sellerId,
    // DISABLED: Static mode - no polling. Use manual refresh button instead.
    // refetchInterval: 30000,
  });
}

// =============================================
// RESPONSE MUTATIONS
// =============================================

export interface CreateResponseResult {
  success: boolean;
  responseId?: string;
  mlResponseId?: string;
  error?: string;
  errorCode?: string;
}

export function useCreateResponse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      question_id: string;
      response_text: string;
      source: QaResponseSource;
      library_response_id?: string;
      ai_original_text?: string;
      is_draft?: boolean;
      seller_id: string;
      account_id?: string;
    }): Promise<CreateResponseResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. First, save the response locally (as draft temporarily if not draft)
      const insertData = {
        user_id: user.id,
        question_id: data.question_id,
        response_text: data.response_text,
        source: data.source,
        library_response_id: data.library_response_id || null,
        ai_original_text: data.ai_original_text || null,
        is_draft: data.is_draft ?? true,
        is_sent: false,
        seller_id: data.seller_id,
      };

      const { data: response, error } = await supabase
        .from('qa_responses')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;

      // If it's a draft, just update question status and return
      if (data.is_draft) {
        await supabase
          .from('qa_questions')
          .update({ status: 'draft' } as never)
          .eq('id', data.question_id);

        return { success: true, responseId: response.id };
      }

      // 2. For non-drafts, send to Mercado Livre API
      const mlResult = await supabase.functions.invoke('ml-answer-question', {
        body: {
          question_id: data.question_id,
          response_text: data.response_text,
          seller_id: data.seller_id,
          account_id: data.account_id,
        },
      });

      if (mlResult.error) {
        // Edge function call failed completely
        await supabase
          .from('qa_responses')
          .update({ send_error: mlResult.error.message } as never)
          .eq('id', response.id);

        return {
          success: false,
          responseId: response.id,
          error: 'Erro de conexão ao enviar resposta',
          errorCode: 'CONNECTION_ERROR',
        };
      }

      const mlData = mlResult.data;

      if (!mlData.success) {
        // ML API returned an error
        await supabase
          .from('qa_responses')
          .update({ send_error: mlData.error } as never)
          .eq('id', response.id);

        return {
          success: false,
          responseId: response.id,
          error: mlData.error || 'Erro ao enviar para o Mercado Livre',
          errorCode: mlData.error_code || 'ML_ERROR',
        };
      }

      // 3. Success! Update response with ML data
      await supabase
        .from('qa_responses')
        .update({
          is_sent: true,
          sent_at: mlData.sent_at || new Date().toISOString(),
          ml_response_id: mlData.ml_response_id,
          send_error: null,
        } as never)
        .eq('id', response.id);

      // 4. Update question status to answered
      await supabase
        .from('qa_questions')
        .update({ 
          status: 'answered', 
          answered_at: new Date().toISOString() 
        } as never)
        .eq('id', data.question_id);

      return {
        success: true,
        responseId: response.id,
        mlResponseId: mlData.ml_response_id,
      };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['qa-questions'] });
      queryClient.invalidateQueries({ queryKey: ['qa-responses', variables.question_id] });
      queryClient.invalidateQueries({ queryKey: ['qa-pending-count'] });
      
      if (variables.is_draft) {
        toast({
          title: 'Rascunho salvo',
          description: 'A resposta foi salva como rascunho',
        });
      } else if (result.success) {
        toast({
          title: 'Resposta enviada',
          description: 'A resposta foi enviada ao Mercado Livre com sucesso',
        });
      } else {
        toast({
          title: 'Erro ao enviar',
          description: result.error || 'Não foi possível enviar ao Mercado Livre',
          variant: 'destructive',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateQuestionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ questionId, status, category }: { 
      questionId: string; 
      status?: QaQuestionStatus;
      category?: string;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (category) updateData.category = category;

      const { error } = await supabase
        .from('qa_questions')
        .update(updateData as never)
        .eq('id', questionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-questions'] });
      queryClient.invalidateQueries({ queryKey: ['qa-pending-count'] });
    },
  });
}

export function useSnoozeQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ questionId, hours }: { questionId: string; hours: number }) => {
      const snoozeUntil = new Date();
      snoozeUntil.setHours(snoozeUntil.getHours() + hours);

      const { error } = await supabase
        .from('qa_questions')
        .update({ 
          is_snoozed: true, 
          snooze_until: snoozeUntil.toISOString() 
        } as never)
        .eq('id', questionId);

      if (error) throw error;
    },
    onSuccess: (_, { hours }) => {
      queryClient.invalidateQueries({ queryKey: ['qa-questions'] });
      toast({
        title: 'Pergunta adiada',
        description: `Você será lembrado em ${hours} hora(s)`,
      });
    },
  });
}

// =============================================
// LIBRARY HOOKS
// =============================================

export function useResponseLibrary(sellerId: string | null) {
  return useQuery({
    queryKey: ['qa-library', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from('qa_response_library')
        .select('*, category:qa_response_categories(*)')
        .eq('seller_id', sellerId)
        .eq('is_active', true)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return (data || []) as QaLibraryResponse[];
    },
    enabled: !!sellerId,
  });
}

export function useResponseCategories(sellerId: string | null) {
  return useQuery({
    queryKey: ['qa-categories', sellerId],
    queryFn: async () => {
      if (!sellerId) return [];

      const { data, error } = await supabase
        .from('qa_response_categories')
        .select('*')
        .eq('seller_id', sellerId)
        .order('sort_order');

      if (error) throw error;
      return (data || []) as QaResponseCategory[];
    },
    enabled: !!sellerId,
  });
}

export function useCreateLibraryResponse() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      seller_id: string;
      name: string;
      content: string;
      category_id?: string;
      shortcut?: string;
      tags?: string[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const insertData = {
        user_id: user.id,
        seller_id: data.seller_id,
        name: data.name,
        content: data.content,
        category_id: data.category_id || null,
        shortcut: data.shortcut || null,
        tags: data.tags || [],
        is_approved: true,
        is_active: true,
      };

      const { data: response, error } = await supabase
        .from('qa_response_library')
        .insert(insertData as never)
        .select()
        .single();

      if (error) throw error;
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-library'] });
      toast({
        title: 'Resposta salva',
        description: 'A resposta foi adicionada à biblioteca',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useIncrementLibraryUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (libraryId: string) => {
      const { data: current } = await supabase
        .from('qa_response_library')
        .select('usage_count')
        .eq('id', libraryId)
        .single();

      const { error } = await supabase
        .from('qa_response_library')
        .update({ usage_count: (current?.usage_count || 0) + 1 } as never)
        .eq('id', libraryId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-library'] });
    },
  });
}

// =============================================
// VALIDATION & AI
// =============================================

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  suggestions?: string[];
}

export function useValidateResponse() {
  const [isValidating, setIsValidating] = useState(false);

  const validate = useCallback(async (content: string): Promise<ValidationResult> => {
    setIsValidating(true);
    try {
      const response = await supabase.functions.invoke('qa-engine', {
        body: { action: 'validate', content },
      });

      if (response.error) throw response.error;
      return response.data as ValidationResult;
    } catch (error) {
      console.error('Validation error:', error);
      return { isValid: false, errors: ['Erro ao validar conteúdo'] };
    } finally {
      setIsValidating(false);
    }
  }, []);

  return { validate, isValidating };
}

export function useAiSuggest() {
  const [isGenerating, setIsGenerating] = useState(false);

  const suggest = useCallback(async (
    questionText: string,
    itemContext?: { title?: string; sku?: string; variation?: string }
  ): Promise<string> => {
    setIsGenerating(true);
    try {
      const response = await supabase.functions.invoke('qa-engine', {
        body: { 
          action: 'suggest', 
          questionText,
          itemContext,
        },
      });

      if (response.error) throw response.error;
      return response.data?.suggestion || '';
    } catch (error) {
      console.error('AI suggest error:', error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { suggest, isGenerating };
}

// =============================================
// AUDIT
// =============================================

export function useLogAudit() {
  return useMutation({
    mutationFn: async (data: {
      seller_id: string;
      question_id?: string;
      response_id?: string;
      action: string;
      question_text?: string;
      response_text?: string;
      response_source?: QaResponseSource;
      validation_result?: Record<string, unknown>;
      block_reasons?: string[];
      metadata?: Record<string, unknown>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const insertData = {
        user_id: user.id,
        actor_id: user.id,
        seller_id: data.seller_id,
        question_id: data.question_id || null,
        response_id: data.response_id || null,
        action: data.action,
        question_text: data.question_text || null,
        response_text: data.response_text || null,
        response_source: data.response_source || null,
        validation_result: data.validation_result || null,
        block_reasons: data.block_reasons || null,
        metadata: data.metadata || {},
      };

      const { error } = await supabase
        .from('qa_audit_log')
        .insert(insertData as never);

      if (error) throw error;
    },
  });
}

// =============================================
// METRICS
// =============================================

export function useQaMetrics(sellerId: string | null) {
  return useQuery({
    queryKey: ['qa-metrics', sellerId],
    queryFn: async () => {
      if (!sellerId) return null;

      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('qa_daily_metrics')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('metric_date', today)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as QaDailyMetrics | null;
    },
    enabled: !!sellerId,
  });
}

// =============================================
// REALTIME
// =============================================

export function useQuestionsRealtime(sellerId: string | null, onNewQuestion: (q: QaQuestion) => void) {
  useEffect(() => {
    if (!sellerId) return;

    const channel = supabase
      .channel(`qa-questions-${sellerId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'qa_questions',
          filter: `seller_id=eq.${sellerId}`,
        },
        (payload) => {
          onNewQuestion(payload.new as QaQuestion);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId, onNewQuestion]);
}
