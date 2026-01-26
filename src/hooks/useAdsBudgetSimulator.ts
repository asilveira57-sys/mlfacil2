import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SimulationInput {
  targetType: 'campaign' | 'item' | 'global';
  targetId?: string; // campaign_id or item_id
  budgetChangePercent: number; // -100 to +500
  period: 7 | 14 | 30; // days of historical data to use
}

export interface SimulationResult {
  // Historical (real) metrics
  historical: {
    spent: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    acos: number;
    roas: number;
    avgDailySpend: number;
    margin: number;
    stockConsumed: number;
  };
  // Projected metrics
  projected: {
    spent: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    acos: number;
    roas: number;
    avgDailySpend: number;
    margin: number;
    stockConsumed: number;
  };
  // Changes (delta)
  delta: {
    spent: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    margin: number;
    stockConsumed: number;
  };
  // Percentage changes
  percentChange: {
    spent: number;
    revenue: number;
    clicks: number;
    margin: number;
    stockConsumed: number;
  };
  // Risk/opportunity assessment
  assessment: {
    level: 'safe' | 'moderate' | 'risky';
    message: string;
    recommendations: string[];
  };
}

export interface TargetOption {
  id: string;
  name: string;
  type: 'campaign' | 'item';
  currentSpent: number;
  currentRevenue: number;
  acos: number;
  roas: number;
}

export function useAdsBudgetSimulator(sellerId?: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [targets, setTargets] = useState<TargetOption[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Load available targets (campaigns and items)
  const loadTargets = useCallback(async () => {
    if (!sellerId) return;
    setLoadingTargets(true);

    try {
      // Load campaigns
      const { data: campaigns } = await supabase
        .from('ads_campaigns')
        .select('id, name, spent_total, status')
        .eq('seller_id', sellerId)
        .eq('status', 'active');

      // Load items
      const { data: items } = await supabase
        .from('ads_items')
        .select('id, item_id, title, spent, revenue_from_ads, acos, roas, status')
        .eq('seller_id', sellerId)
        .eq('status', 'active');

      const campaignTargets: TargetOption[] = (campaigns || []).map(c => ({
        id: c.id,
        name: c.name,
        type: 'campaign' as const,
        currentSpent: c.spent_total || 0,
        currentRevenue: 0,
        acos: 0,
        roas: 0,
      }));

      const itemTargets: TargetOption[] = (items || []).map(i => ({
        id: i.id,
        name: i.title || i.item_id,
        type: 'item' as const,
        currentSpent: i.spent || 0,
        currentRevenue: i.revenue_from_ads || 0,
        acos: i.acos || 0,
        roas: i.roas || 0,
      }));

      setTargets([...campaignTargets, ...itemTargets]);
    } catch (err) {
      console.error('[useAdsBudgetSimulator] loadTargets error:', err);
    } finally {
      setLoadingTargets(false);
    }
  }, [sellerId]);

  // Run simulation
  const simulate = useCallback(async (input: SimulationInput): Promise<SimulationResult | null> => {
    if (!sellerId) return null;
    setLoading(true);

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.period);

      // Build query based on target type
      let query = supabase
        .from('ads_daily_metrics')
        .select('*')
        .eq('seller_id', sellerId)
        .gte('metric_date', startDate.toISOString().split('T')[0])
        .lte('metric_date', endDate.toISOString().split('T')[0]);

      if (input.targetType === 'campaign' && input.targetId) {
        query = query.eq('campaign_id', input.targetId);
      } else if (input.targetType === 'item' && input.targetId) {
        query = query.eq('item_id', input.targetId);
      }

      const { data: metrics, error } = await query;
      if (error) throw error;

      // Aggregate historical metrics
      const historical = aggregateMetrics(metrics || [], input.period);

      // Apply budget change factor with diminishing returns
      const changeFactor = 1 + (input.budgetChangePercent / 100);
      const projected = projectMetrics(historical, changeFactor, input.budgetChangePercent);

      // Calculate deltas
      const delta = {
        spent: projected.spent - historical.spent,
        revenue: projected.revenue - historical.revenue,
        clicks: projected.clicks - historical.clicks,
        impressions: projected.impressions - historical.impressions,
        conversions: projected.conversions - historical.conversions,
        margin: projected.margin - historical.margin,
        stockConsumed: projected.stockConsumed - historical.stockConsumed,
      };

      // Calculate percentage changes
      const percentChange = {
        spent: historical.spent > 0 ? ((projected.spent - historical.spent) / historical.spent) * 100 : 0,
        revenue: historical.revenue > 0 ? ((projected.revenue - historical.revenue) / historical.revenue) * 100 : 0,
        clicks: historical.clicks > 0 ? ((projected.clicks - historical.clicks) / historical.clicks) * 100 : 0,
        margin: historical.margin !== 0 ? ((projected.margin - historical.margin) / Math.abs(historical.margin)) * 100 : 0,
        stockConsumed: historical.stockConsumed > 0 ? ((projected.stockConsumed - historical.stockConsumed) / historical.stockConsumed) * 100 : 0,
      };

      // Generate assessment
      const assessment = generateAssessment(historical, projected, input.budgetChangePercent);

      const simulationResult: SimulationResult = {
        historical,
        projected,
        delta,
        percentChange,
        assessment,
      };

      setResult(simulationResult);
      return simulationResult;
    } catch (err) {
      console.error('[useAdsBudgetSimulator] simulate error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return {
    simulate,
    result,
    loading,
    clearResult,
    targets,
    loadTargets,
    loadingTargets,
  };
}

// Helper functions

function aggregateMetrics(metrics: any[], period: number) {
  const totalSpent = metrics.reduce((sum, m) => sum + (m.spent || 0), 0);
  const totalRevenue = metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
  const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
  const totalImpressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
  const totalConversions = metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);

  const acos = totalRevenue > 0 ? (totalSpent / totalRevenue) * 100 : 0;
  const roas = totalSpent > 0 ? totalRevenue / totalSpent : 0;
  const margin = totalRevenue - totalSpent;
  
  // Estimate stock consumed (assume 1 unit per conversion as baseline)
  const stockConsumed = totalConversions;

  return {
    spent: totalSpent,
    revenue: totalRevenue,
    clicks: totalClicks,
    impressions: totalImpressions,
    conversions: totalConversions,
    acos,
    roas,
    avgDailySpend: totalSpent / period,
    margin,
    stockConsumed,
  };
}

function projectMetrics(
  historical: ReturnType<typeof aggregateMetrics>,
  changeFactor: number,
  budgetChangePercent: number
) {
  // Apply diminishing returns for large increases
  // For every 50% increase beyond 100%, efficiency drops by 10%
  let efficiencyFactor = 1;
  if (budgetChangePercent > 100) {
    const excessPercent = budgetChangePercent - 100;
    efficiencyFactor = 1 - (excessPercent / 500) * 0.3; // Max 30% efficiency loss
  }
  
  // For decreases, assume linear scaling (budget cut = proportional result cut)
  // For increases, apply diminishing returns
  let revenueMultiplier: number;
  let conversionMultiplier: number;
  
  if (budgetChangePercent < 0) {
    // Budget decrease: linear reduction with slight efficiency improvement
    revenueMultiplier = changeFactor * 1.05; // 5% efficiency gain on cuts
    conversionMultiplier = changeFactor * 1.03;
  } else if (budgetChangePercent <= 50) {
    // Small increase: nearly linear
    revenueMultiplier = changeFactor * 0.95;
    conversionMultiplier = changeFactor * 0.93;
  } else if (budgetChangePercent <= 100) {
    // Moderate increase: diminishing returns kick in
    revenueMultiplier = changeFactor * 0.85 * efficiencyFactor;
    conversionMultiplier = changeFactor * 0.82 * efficiencyFactor;
  } else {
    // Large increase: significant diminishing returns
    revenueMultiplier = changeFactor * 0.70 * efficiencyFactor;
    conversionMultiplier = changeFactor * 0.65 * efficiencyFactor;
  }

  const projectedSpent = historical.spent * changeFactor;
  const projectedRevenue = historical.revenue * revenueMultiplier;
  const projectedClicks = historical.clicks * (changeFactor * 0.9);
  const projectedImpressions = historical.impressions * (changeFactor * 0.95);
  const projectedConversions = historical.conversions * conversionMultiplier;

  const projectedAcos = projectedRevenue > 0 
    ? (projectedSpent / projectedRevenue) * 100 
    : 0;
  const projectedRoas = projectedSpent > 0 
    ? projectedRevenue / projectedSpent 
    : 0;

  return {
    spent: projectedSpent,
    revenue: projectedRevenue,
    clicks: projectedClicks,
    impressions: projectedImpressions,
    conversions: projectedConversions,
    acos: projectedAcos,
    roas: projectedRoas,
    avgDailySpend: projectedSpent / 30, // Normalize to 30 days
    margin: projectedRevenue - projectedSpent,
    stockConsumed: projectedConversions,
  };
}

function generateAssessment(
  historical: ReturnType<typeof aggregateMetrics>,
  projected: ReturnType<typeof projectMetrics>,
  budgetChangePercent: number
): SimulationResult['assessment'] {
  const recommendations: string[] = [];
  let level: 'safe' | 'moderate' | 'risky' = 'safe';
  let message = '';

  const marginChange = projected.margin - historical.margin;
  const roasChange = projected.roas - historical.roas;

  // Assess risk level
  if (budgetChangePercent > 100) {
    level = 'risky';
    message = 'Aumento agressivo de orçamento. Retornos podem ser significativamente menores que o proporcional.';
    recommendations.push('Considere aumentos graduais de 25-50% para validar performance');
    recommendations.push('Monitore ACOS diariamente na primeira semana');
  } else if (budgetChangePercent > 50) {
    level = 'moderate';
    message = 'Aumento moderado com potencial de retornos decrescentes.';
    recommendations.push('Acompanhe métricas semanalmente');
    recommendations.push('Esteja preparado para ajustar se ROAS cair abaixo de ' + (historical.roas * 0.8).toFixed(1));
  } else if (budgetChangePercent < -30) {
    level = 'moderate';
    message = 'Redução significativa pode impactar visibilidade e vendas.';
    recommendations.push('Priorize manter investimento em produtos com melhor ROAS');
    recommendations.push('Avalie impacto em ranking de busca');
  } else if (budgetChangePercent < 0) {
    level = 'safe';
    message = 'Redução conservadora com impacto proporcional esperado.';
    recommendations.push('Foque orçamento nos horários de maior conversão');
  } else {
    level = 'safe';
    message = 'Ajuste conservador com retornos proporcionais esperados.';
    recommendations.push('Mantenha monitoramento regular das métricas');
  }

  // Add specific recommendations based on metrics
  if (projected.acos > 40) {
    recommendations.push('ACOS projetado acima de 40% - avalie margem do produto');
  }
  
  if (projected.roas < 2) {
    recommendations.push('ROAS projetado abaixo de 2x - considere otimizar antes de escalar');
  }

  if (marginChange < 0 && budgetChangePercent > 0) {
    level = 'risky';
    message = 'Aumento de orçamento pode resultar em margem negativa.';
    recommendations.unshift('⚠️ Projeção indica redução de lucro - reavalie a estratégia');
  }

  return { level, message, recommendations };
}
