import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PeriodMetrics {
  period: string;
  startDate: string;
  endDate: string;
  totalSpent: number;
  totalRevenue: number;
  avgAcos: number;
  avgRoas: number;
  profit: number;
  profitMargin: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface ProductPerformance {
  itemId: string;
  title: string;
  thumbnail?: string;
  spent: number;
  revenue: number;
  profit: number;
  acos: number;
  roas: number;
  situation: 'profit' | 'loss' | 'neutral';
  trend: 'improved' | 'declined' | 'stable';
  previousSpent?: number;
  previousRevenue?: number;
  percentChange: number;
}

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  status: string;
  spent: number;
  revenue: number;
  profit: number;
  acos: number;
  roas: number;
  situation: 'profit' | 'loss' | 'neutral';
  trend: 'improved' | 'declined' | 'stable';
  percentChange: number;
}

export interface ExecutiveReportData {
  currentPeriod: PeriodMetrics | null;
  previousPeriod: PeriodMetrics | null;
  topProfitable: ProductPerformance[];
  topLoss: ProductPerformance[];
  improvedProducts: ProductPerformance[];
  declinedProducts: ProductPerformance[];
  campaignPerformance: CampaignPerformance[];
  insights: ReportInsight[];
}

export interface ReportInsight {
  type: 'success' | 'warning' | 'info' | 'critical';
  title: string;
  description: string;
  metric?: string;
  value?: string;
}

type PeriodType = 'weekly' | 'monthly';

export function useAdsExecutiveReport(
  sellerId: string | undefined,
  periodType: PeriodType = 'weekly'
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExecutiveReportData>({
    currentPeriod: null,
    previousPeriod: null,
    topProfitable: [],
    topLoss: [],
    improvedProducts: [],
    declinedProducts: [],
    campaignPerformance: [],
    insights: [],
  });

  // Calculate date ranges based on period type
  const dateRanges = useMemo(() => {
    const today = new Date();
    const currentEnd = new Date(today);
    currentEnd.setHours(23, 59, 59, 999);

    let currentStart: Date;
    let previousStart: Date;
    let previousEnd: Date;

    if (periodType === 'weekly') {
      // Current week (last 7 days)
      currentStart = new Date(today);
      currentStart.setDate(currentStart.getDate() - 6);
      currentStart.setHours(0, 0, 0, 0);

      // Previous week (7 days before current)
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousEnd.setHours(23, 59, 59, 999);

      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 6);
      previousStart.setHours(0, 0, 0, 0);
    } else {
      // Current month (last 30 days)
      currentStart = new Date(today);
      currentStart.setDate(currentStart.getDate() - 29);
      currentStart.setHours(0, 0, 0, 0);

      // Previous month (30 days before current)
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousEnd.setHours(23, 59, 59, 999);

      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - 29);
      previousStart.setHours(0, 0, 0, 0);
    }

    return {
      current: {
        start: currentStart.toISOString().split('T')[0],
        end: currentEnd.toISOString().split('T')[0],
      },
      previous: {
        start: previousStart.toISOString().split('T')[0],
        end: previousEnd.toISOString().split('T')[0],
      },
    };
  }, [periodType]);

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }

    const fetchReportData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch current period metrics
        const { data: currentMetrics, error: currentError } = await supabase
          .from('ads_daily_metrics')
          .select('*')
          .eq('seller_id', sellerId)
          .gte('metric_date', dateRanges.current.start)
          .lte('metric_date', dateRanges.current.end);

        if (currentError) throw currentError;

        // Fetch previous period metrics
        const { data: previousMetrics, error: previousError } = await supabase
          .from('ads_daily_metrics')
          .select('*')
          .eq('seller_id', sellerId)
          .gte('metric_date', dateRanges.previous.start)
          .lte('metric_date', dateRanges.previous.end);

        if (previousError) throw previousError;

        // Fetch campaigns
        const { data: campaigns, error: campaignsError } = await supabase
          .from('ads_campaigns')
          .select('*')
          .eq('seller_id', sellerId);

        if (campaignsError) throw campaignsError;

        // Fetch items
        const { data: items, error: itemsError } = await supabase
          .from('ads_items')
          .select('*')
          .eq('seller_id', sellerId);

        if (itemsError) throw itemsError;

        // Aggregate current period
        const currentAgg = aggregateMetrics(currentMetrics || []);
        const previousAgg = aggregateMetrics(previousMetrics || []);

        // Calculate period summaries
        const currentPeriod: PeriodMetrics = {
          period: periodType === 'weekly' ? 'Esta Semana' : 'Este Mês',
          startDate: dateRanges.current.start,
          endDate: dateRanges.current.end,
          totalSpent: currentAgg.totalSpent,
          totalRevenue: currentAgg.totalRevenue,
          avgAcos: currentAgg.avgAcos,
          avgRoas: currentAgg.avgRoas,
          profit: currentAgg.totalRevenue - currentAgg.totalSpent,
          profitMargin: currentAgg.totalRevenue > 0
            ? ((currentAgg.totalRevenue - currentAgg.totalSpent) / currentAgg.totalRevenue) * 100
            : 0,
          impressions: currentAgg.impressions,
          clicks: currentAgg.clicks,
          conversions: currentAgg.conversions,
        };

        const previousPeriod: PeriodMetrics = {
          period: periodType === 'weekly' ? 'Semana Anterior' : 'Mês Anterior',
          startDate: dateRanges.previous.start,
          endDate: dateRanges.previous.end,
          totalSpent: previousAgg.totalSpent,
          totalRevenue: previousAgg.totalRevenue,
          avgAcos: previousAgg.avgAcos,
          avgRoas: previousAgg.avgRoas,
          profit: previousAgg.totalRevenue - previousAgg.totalSpent,
          profitMargin: previousAgg.totalRevenue > 0
            ? ((previousAgg.totalRevenue - previousAgg.totalSpent) / previousAgg.totalRevenue) * 100
            : 0,
          impressions: previousAgg.impressions,
          clicks: previousAgg.clicks,
          conversions: previousAgg.conversions,
        };

        // Aggregate by item
        const currentByItem = aggregateByItem(currentMetrics || []);
        const previousByItem = aggregateByItem(previousMetrics || []);

        // Build product performance
        const productPerformance: ProductPerformance[] = (items || []).map((item) => {
          const current = currentByItem.get(item.item_id) || { spent: 0, revenue: 0 };
          const previous = previousByItem.get(item.item_id) || { spent: 0, revenue: 0 };

          const profit = current.revenue - current.spent;
          const previousProfit = previous.revenue - previous.spent;
          const percentChange = previousProfit !== 0
            ? ((profit - previousProfit) / Math.abs(previousProfit)) * 100
            : profit > 0 ? 100 : 0;

          return {
            itemId: item.item_id,
            title: item.title || item.item_id,
            spent: current.spent,
            revenue: current.revenue,
            profit,
            acos: current.revenue > 0 ? (current.spent / current.revenue) * 100 : 0,
            roas: current.spent > 0 ? current.revenue / current.spent : 0,
            situation: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'neutral',
            trend: percentChange > 5 ? 'improved' : percentChange < -5 ? 'declined' : 'stable',
            previousSpent: previous.spent,
            previousRevenue: previous.revenue,
            percentChange,
          };
        });

        // Sort and filter products
        const topProfitable = productPerformance
          .filter(p => p.profit > 0)
          .sort((a, b) => b.profit - a.profit)
          .slice(0, 5);

        const topLoss = productPerformance
          .filter(p => p.profit < 0)
          .sort((a, b) => a.profit - b.profit)
          .slice(0, 5);

        const improvedProducts = productPerformance
          .filter(p => p.trend === 'improved' && p.percentChange > 10)
          .sort((a, b) => b.percentChange - a.percentChange)
          .slice(0, 5);

        const declinedProducts = productPerformance
          .filter(p => p.trend === 'declined' && p.percentChange < -10)
          .sort((a, b) => a.percentChange - b.percentChange)
          .slice(0, 5);

        // Aggregate by campaign
        const currentByCampaign = aggregateByCampaign(currentMetrics || []);
        const previousByCampaign = aggregateByCampaign(previousMetrics || []);

        const campaignPerformance: CampaignPerformance[] = (campaigns || []).map((c) => {
          const current = currentByCampaign.get(c.id) || { spent: 0, revenue: 0 };
          const previous = previousByCampaign.get(c.id) || { spent: 0, revenue: 0 };

          const profit = current.revenue - current.spent;
          const previousProfit = previous.revenue - previous.spent;
          const percentChange = previousProfit !== 0
            ? ((profit - previousProfit) / Math.abs(previousProfit)) * 100
            : profit > 0 ? 100 : 0;

          const situation: 'profit' | 'loss' | 'neutral' = profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'neutral';
          const trend: 'improved' | 'declined' | 'stable' = percentChange > 5 ? 'improved' : percentChange < -5 ? 'declined' : 'stable';

          return {
            campaignId: c.id,
            name: c.name,
            status: c.status,
            spent: current.spent,
            revenue: current.revenue,
            profit,
            acos: current.revenue > 0 ? (current.spent / current.revenue) * 100 : 0,
            roas: current.spent > 0 ? current.revenue / current.spent : 0,
            situation,
            trend,
            percentChange,
          };
        }).sort((a, b) => b.spent - a.spent);

        // Generate insights
        const insights = generateInsights(
          currentPeriod,
          previousPeriod,
          topProfitable,
          topLoss,
          campaignPerformance
        );

        setData({
          currentPeriod,
          previousPeriod,
          topProfitable,
          topLoss,
          improvedProducts,
          declinedProducts,
          campaignPerformance,
          insights,
        });
      } catch (err) {
        console.error('Error fetching executive report:', err);
        setError('Erro ao carregar relatório executivo');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [sellerId, dateRanges]);

  return { data, loading, error, dateRanges };
}

// Helper functions
function aggregateMetrics(metrics: any[]) {
  const totalSpent = metrics.reduce((sum, m) => sum + (m.spent || 0), 0);
  const totalRevenue = metrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
  const impressions = metrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
  const clicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
  const conversions = metrics.reduce((sum, m) => sum + (m.conversions || 0), 0);

  return {
    totalSpent,
    totalRevenue,
    avgAcos: totalRevenue > 0 ? (totalSpent / totalRevenue) * 100 : 0,
    avgRoas: totalSpent > 0 ? totalRevenue / totalSpent : 0,
    impressions,
    clicks,
    conversions,
  };
}

function aggregateByItem(metrics: any[]) {
  const map = new Map<string, { spent: number; revenue: number }>();
  for (const m of metrics) {
    if (!m.item_id) continue;
    const existing = map.get(m.item_id) || { spent: 0, revenue: 0 };
    map.set(m.item_id, {
      spent: existing.spent + (m.spent || 0),
      revenue: existing.revenue + (m.revenue || 0),
    });
  }
  return map;
}

function aggregateByCampaign(metrics: any[]) {
  const map = new Map<string, { spent: number; revenue: number }>();
  for (const m of metrics) {
    if (!m.campaign_id) continue;
    const existing = map.get(m.campaign_id) || { spent: 0, revenue: 0 };
    map.set(m.campaign_id, {
      spent: existing.spent + (m.spent || 0),
      revenue: existing.revenue + (m.revenue || 0),
    });
  }
  return map;
}

function generateInsights(
  current: PeriodMetrics,
  previous: PeriodMetrics,
  topProfitable: ProductPerformance[],
  topLoss: ProductPerformance[],
  campaigns: CampaignPerformance[]
): ReportInsight[] {
  const insights: ReportInsight[] = [];

  // Overall profit/loss
  if (current.profit > 0) {
    insights.push({
      type: 'success',
      title: 'Resultado positivo no período',
      description: `Suas campanhas geraram um lucro líquido de R$ ${current.profit.toFixed(2)} após custos de publicidade.`,
      metric: 'Lucro',
      value: `R$ ${current.profit.toFixed(2)}`,
    });
  } else if (current.profit < 0) {
    insights.push({
      type: 'critical',
      title: 'Resultado negativo no período',
      description: `Suas campanhas tiveram um prejuízo de R$ ${Math.abs(current.profit).toFixed(2)}. Considere revisar estratégias de lance e segmentação.`,
      metric: 'Prejuízo',
      value: `R$ ${Math.abs(current.profit).toFixed(2)}`,
    });
  }

  // Trend comparison
  const profitChange = current.profit - previous.profit;
  if (profitChange > 0) {
    const percentImproved = previous.profit !== 0
      ? ((profitChange / Math.abs(previous.profit)) * 100).toFixed(1)
      : '100';
    insights.push({
      type: 'success',
      title: 'Melhoria em relação ao período anterior',
      description: `O resultado melhorou ${percentImproved}% comparado ao período anterior.`,
      metric: 'Variação',
      value: `+${percentImproved}%`,
    });
  } else if (profitChange < 0) {
    const percentDeclined = previous.profit !== 0
      ? ((Math.abs(profitChange) / Math.abs(previous.profit)) * 100).toFixed(1)
      : '100';
    insights.push({
      type: 'warning',
      title: 'Queda em relação ao período anterior',
      description: `O resultado caiu ${percentDeclined}% comparado ao período anterior.`,
      metric: 'Variação',
      value: `-${percentDeclined}%`,
    });
  }

  // ACOS analysis
  if (current.avgAcos > 40) {
    insights.push({
      type: 'warning',
      title: 'ACOS acima do recomendado',
      description: `Seu ACOS médio de ${current.avgAcos.toFixed(1)}% está acima de 40%. Produtos com baixa conversão podem estar consumindo orçamento.`,
      metric: 'ACOS',
      value: `${current.avgAcos.toFixed(1)}%`,
    });
  }

  // Top performer
  if (topProfitable.length > 0) {
    const top = topProfitable[0];
    insights.push({
      type: 'info',
      title: 'Produto destaque do período',
      description: `"${top.title}" foi o produto mais lucrativo, gerando R$ ${top.profit.toFixed(2)} de lucro com ROAS de ${top.roas.toFixed(2)}x.`,
      metric: 'Lucro',
      value: `R$ ${top.profit.toFixed(2)}`,
    });
  }

  // Top loss
  if (topLoss.length > 0) {
    const worst = topLoss[0];
    insights.push({
      type: 'critical',
      title: 'Produto com maior prejuízo',
      description: `"${worst.title}" gerou prejuízo de R$ ${Math.abs(worst.profit).toFixed(2)}. Avalie pausar ou ajustar lances.`,
      metric: 'Prejuízo',
      value: `R$ ${Math.abs(worst.profit).toFixed(2)}`,
    });
  }

  // Campaigns with issues
  const losssCampaigns = campaigns.filter(c => c.profit < 0 && c.status === 'active');
  if (losssCampaigns.length > 0) {
    insights.push({
      type: 'warning',
      title: `${losssCampaigns.length} campanhas ativas com prejuízo`,
      description: `Estas campanhas estão gastando mais do que gerando. Considere revisar a estratégia ou pausar temporariamente.`,
      metric: 'Campanhas',
      value: `${losssCampaigns.length}`,
    });
  }

  return insights;
}
