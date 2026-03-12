import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PriorityAction {
  priority: number;
  action: string;
  rationale: string;
  expected_impact: string;
  risk_level: 'low' | 'medium' | 'high';
  urgency: 'immediate' | 'this_week' | 'this_month';
  category: 'budget' | 'optimization' | 'expansion' | 'reduction' | 'monitoring';
  affected_items?: string[];
}

export interface Risk {
  risk: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
}

export interface Opportunity {
  opportunity: string;
  potential_value: string;
  effort_required: 'low' | 'medium' | 'high';
}

export interface RuleAnalysis {
  total_violations: number;
  total_opportunities: number;
  most_triggered_rule: string;
  rule_effectiveness_note: string;
}

export interface PerformanceTrends {
  acos_trend: 'improving' | 'stable' | 'declining';
  roas_trend: 'improving' | 'stable' | 'declining';
  spend_trend: 'increasing' | 'stable' | 'decreasing';
  trend_explanation: string;
}

export interface AiAnalysis {
  executive_summary: string;
  health_score: number;
  health_status: 'critical' | 'warning' | 'healthy' | 'excellent';
  priority_actions: PriorityAction[];
  risks: Risk[];
  opportunities: Opportunity[];
  rule_analysis?: RuleAnalysis;
  performance_trends?: PerformanceTrends;
  next_steps: string[];
}

export interface ConsultantState {
  loading: boolean;
  error: string | null;
  analysis: AiAnalysis | null;
  generatedAt: string | null;
}

export function useAdsAiConsultant(sellerId: string | undefined) {
  const [state, setState] = useState<ConsultantState>({
    loading: false,
    error: null,
    analysis: null,
    generatedAt: null,
  });

  const runAnalysis = async (
    analysisType: 'full' | 'quick' | 'specific' = 'full',
    focusArea?: 'violations' | 'opportunities' | 'budget' | 'performance'
  ) => {
    if (!sellerId) {
      toast.error('Conta não conectada');
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.functions.invoke('ads-ai-consultant', {
        body: { seller_id: sellerId, analysis_type: analysisType, focus_area: focusArea },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.error) {
        if (data.error.includes('Rate limit')) {
          toast.error('Limite de requisições atingido. Tente novamente em alguns minutos.');
        } else if (data.error.includes('credits') || data.error.includes('insufficient_quota')) {
          toast.error('Créditos de IA esgotados. Adicione créditos para continuar.');
        } else {
          toast.error(data.error);
        }
        setState(prev => ({ ...prev, loading: false, error: data.error }));
        return;
      }

      setState({
        loading: false,
        error: null,
        analysis: data.analysis,
        generatedAt: data.generated_at,
      });

      toast.success('Análise estratégica gerada com sucesso!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao gerar análise';
      console.error('[useAdsAiConsultant] Error:', err);
      setState(prev => ({ ...prev, loading: false, error: message }));
      toast.error(message);
    }
  };

  const clearAnalysis = () => {
    setState({
      loading: false,
      error: null,
      analysis: null,
      generatedAt: null,
    });
  };

  return {
    ...state,
    runAnalysis,
    clearAnalysis,
  };
}
