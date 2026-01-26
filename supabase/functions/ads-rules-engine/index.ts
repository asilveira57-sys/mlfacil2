import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RuleCondition {
  metric: string;
  operator: string;
  compare_with: string;
  fixed_value?: number;
  period_days: number;
}

interface ExtraCondition {
  type: 'in_promotion' | 'stock_low' | 'no_sales' | 'has_sales';
  enabled: boolean;
}

interface AdsRule {
  id: string;
  user_id: string;
  seller_id: string;
  name: string;
  rule_type: string; // 'violation' | 'opportunity'
  conditions: {
    items: RuleCondition[];
    extra: ExtraCondition[];
    severity: string;
  };
  is_enabled: boolean;
}

interface AdsItem {
  id: string;
  item_id: string;
  title: string | null;
  spent: number;
  clicks: number;
  impressions: number;
  conversions: number;
  revenue_from_ads: number;
  acos: number | null;
  roas: number | null;
  current_price: number | null;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { seller_id, action = 'evaluate' } = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ads-rules-engine] Starting ${action} for seller ${seller_id}`);

    if (action === 'evaluate') {
      const result = await evaluateRules(supabase, seller_id);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ads-rules-engine] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function evaluateRules(supabase: any, sellerId: string) {
  // Fetch enabled rules for this seller
  const { data: rulesRaw, error: rulesError } = await supabase
    .from('ads_automation_rules')
    .select('*')
    .eq('seller_id', sellerId)
    .eq('is_enabled', true);

  if (rulesError) {
    throw new Error(`Failed to fetch rules: ${rulesError.message}`);
  }

  const rules: AdsRule[] = (rulesRaw || []).map((r: any) => ({
    ...r,
    conditions: r.conditions || { items: [], extra: [], severity: 'medium' },
  }));

  if (rules.length === 0) {
    console.log('[ads-rules-engine] No enabled rules found');
    return { evaluated: 0, triggered: 0, events: [] };
  }

  console.log(`[ads-rules-engine] Found ${rules.length} enabled rules`);

  // Fetch ads items for evaluation
  const { data: items, error: itemsError } = await supabase
    .from('ads_items')
    .select('*')
    .eq('seller_id', sellerId);

  if (itemsError) {
    throw new Error(`Failed to fetch ads items: ${itemsError.message}`);
  }

  console.log(`[ads-rules-engine] Found ${items?.length || 0} ads items`);

  // Fetch daily metrics for period-based evaluation (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: dailyMetrics } = await supabase
    .from('ads_daily_metrics')
    .select('*')
    .eq('seller_id', sellerId)
    .gte('metric_date', thirtyDaysAgo.toISOString().split('T')[0]);

  // Fetch margin data from cost catalog
  const { data: costCatalog } = await supabase
    .from('cost_catalog')
    .select('product_key, margin_percent')
    .eq('seller_id', sellerId);

  const marginMap = new Map<string, number>();
  (costCatalog || []).forEach((c: any) => {
    if (c.product_key && c.margin_percent !== null) {
      marginMap.set(c.product_key, c.margin_percent);
    }
  });

  // Fetch active promotions
  const { data: promotions } = await supabase
    .from('promotions')
    .select('item_id')
    .eq('seller_id', sellerId)
    .eq('status', 'active');

  const promotedItems = new Set<string>((promotions || []).map((p: { item_id: string }) => p.item_id));

  // Evaluate each rule against each item
  const events: any[] = [];
  let triggered = 0;

  for (const rule of rules) {
    const ruleConditions = rule.conditions?.items || [];
    const extraConditions = rule.conditions?.extra || [];
    const severity = rule.conditions?.severity || 'medium';

    for (const item of (items || []) as AdsItem[]) {
      // Calculate period-based metrics
      const itemMetrics = calculatePeriodMetrics(item, dailyMetrics || [], ruleConditions);
      
      // Check all conditions
      const allConditionsMet = checkAllConditions(
        item,
        itemMetrics,
        ruleConditions,
        extraConditions,
        marginMap,
        promotedItems
      );

      if (allConditionsMet && ruleConditions.length > 0 || (ruleConditions.length === 0 && extraConditions.filter(e => e.enabled).length > 0 && allConditionsMet)) {
        triggered++;
        
        const event = {
          rule_id: rule.id,
          rule_name: rule.name,
          item_id: item.item_id,
          item_title: item.title,
          event_type: rule.rule_type,
          severity,
          metrics: itemMetrics,
        };
        
        events.push(event);

        // Create alert in database
        await createAlert(supabase, rule, item, itemMetrics, severity, sellerId);
      }
    }

    // Update last_evaluated_at
    await supabase
      .from('ads_automation_rules')
      .update({ 
        updated_at: new Date().toISOString(),
      })
      .eq('id', rule.id);
  }

  console.log(`[ads-rules-engine] Evaluated ${rules.length} rules, triggered ${triggered} events`);

  return { 
    evaluated: rules.length, 
    triggered, 
    events,
  };
}

function calculatePeriodMetrics(
  item: AdsItem, 
  dailyMetrics: any[], 
  conditions: RuleCondition[]
): Record<string, number> {
  // Get the max period needed
  const maxPeriod = conditions.reduce((max, c) => Math.max(max, c.period_days || 7), 7);
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxPeriod);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Filter metrics for this item and period
  const itemMetrics = dailyMetrics.filter(m => 
    m.item_id === item.item_id && 
    m.metric_date >= cutoffStr
  );

  const totalSpent = itemMetrics.reduce((sum, m) => sum + (m.spent || 0), 0) || item.spent || 0;
  const totalRevenue = itemMetrics.reduce((sum, m) => sum + (m.revenue || 0), 0) || item.revenue_from_ads || 0;
  const totalClicks = itemMetrics.reduce((sum, m) => sum + (m.clicks || 0), 0) || item.clicks || 0;
  const totalImpressions = itemMetrics.reduce((sum, m) => sum + (m.impressions || 0), 0) || item.impressions || 0;
  const totalConversions = itemMetrics.reduce((sum, m) => sum + (m.conversions || 0), 0) || item.conversions || 0;

  const acos = totalRevenue > 0 ? (totalSpent / totalRevenue) * 100 : item.acos || 0;
  const roas = totalSpent > 0 ? totalRevenue / totalSpent : item.roas || 0;

  return {
    spent: totalSpent,
    revenue: totalRevenue,
    clicks: totalClicks,
    impressions: totalImpressions,
    conversions: totalConversions,
    acos,
    roas,
  };
}

function checkAllConditions(
  item: AdsItem,
  metrics: Record<string, number>,
  conditions: RuleCondition[],
  extraConditions: ExtraCondition[],
  marginMap: Map<string, number>,
  promotedItems: Set<string>
): boolean {
  // Check metric conditions
  for (const cond of conditions) {
    const value = metrics[cond.metric] ?? 0;
    let compareValue: number;

    if (cond.compare_with === 'fixed_value') {
      compareValue = cond.fixed_value ?? 0;
    } else if (cond.compare_with === 'margin_registered') {
      // Get margin from cost catalog
      const margin = marginMap.get(item.item_id) ?? 25; // Default 25%
      compareValue = margin;
    } else if (cond.compare_with === 'target_acos') {
      compareValue = 30; // Default target ACOS
    } else if (cond.compare_with === 'target_roas') {
      compareValue = 3; // Default target ROAS
    } else {
      compareValue = 0;
    }

    if (!evaluateOperator(value, cond.operator, compareValue)) {
      return false;
    }
  }

  // Check extra conditions
  for (const extra of extraConditions) {
    if (!extra.enabled) continue;

    switch (extra.type) {
      case 'in_promotion':
        if (!promotedItems.has(item.item_id)) return false;
        break;
      case 'stock_low':
        // Assume stock is low if we have no stock data or it's explicitly low
        // In real implementation, this would check inventory
        break;
      case 'no_sales':
        if (metrics.conversions > 0) return false;
        break;
      case 'has_sales':
        if (metrics.conversions === 0) return false;
        break;
    }
  }

  return true;
}

function evaluateOperator(value: number, operator: string, compareValue: number): boolean {
  switch (operator) {
    case 'gt': return value > compareValue;
    case 'gte': return value >= compareValue;
    case 'lt': return value < compareValue;
    case 'lte': return value <= compareValue;
    case 'eq': return value === compareValue;
    case 'neq': return value !== compareValue;
    default: return false;
  }
}

async function createAlert(
  supabase: any,
  rule: AdsRule,
  item: AdsItem,
  metrics: Record<string, number>,
  severity: string,
  sellerId: string
) {
  const alertType = rule.rule_type === 'opportunity' ? 'rule_opportunity' : 'rule_violation';
  
  // Check if similar alert already exists (avoid duplicates)
  const { data: existing } = await supabase
    .from('ads_alerts')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('item_id', item.item_id)
    .eq('alert_type', alertType)
    .eq('is_dismissed', false)
    .contains('data_json', { rule_id: rule.id })
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[ads-rules-engine] Alert already exists for rule ${rule.id} and item ${item.item_id}`);
    return;
  }

  const message = generateAlertMessage(rule, item, metrics);

  const { error } = await supabase
    .from('ads_alerts')
    .insert({
      user_id: rule.user_id,
      seller_id: sellerId,
      alert_type: alertType,
      severity,
      title: rule.name,
      message_pt: message,
      item_id: item.item_id,
      data_json: {
        rule_id: rule.id,
        rule_name: rule.name,
        item_title: item.title,
        metrics,
      },
    });

  if (error) {
    console.error(`[ads-rules-engine] Failed to create alert: ${error.message}`);
  } else {
    // Update trigger count
    await supabase
      .from('ads_automation_rules')
      .update({ 
        trigger_count: (rule as any).trigger_count ? (rule as any).trigger_count + 1 : 1,
        last_triggered_at: new Date().toISOString(),
      })
      .eq('id', rule.id);
  }
}

function generateAlertMessage(rule: AdsRule, item: AdsItem, metrics: Record<string, number>): string {
  const isViolation = rule.rule_type === 'violation';
  
  if (isViolation) {
    if (metrics.acos > 30) {
      return `Produto "${item.title || item.item_id}" com ACOS de ${metrics.acos.toFixed(1)}% - acima do limite.`;
    }
    if (metrics.conversions === 0 && metrics.spent > 50) {
      return `Produto "${item.title || item.item_id}" gastou R$ ${metrics.spent.toFixed(2)} sem conversões.`;
    }
    return `Regra "${rule.name}" disparada para "${item.title || item.item_id}".`;
  } else {
    if (metrics.roas > 3) {
      return `Oportunidade: "${item.title || item.item_id}" com ROAS de ${metrics.roas.toFixed(1)} - considere aumentar investimento.`;
    }
    return `Oportunidade detectada para "${item.title || item.item_id}".`;
  }
}
