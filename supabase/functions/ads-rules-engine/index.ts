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
  workspace_id: string | null;
  name: string;
  rule_type: string; // 'violation' | 'opportunity'
  conditions: {
    items: RuleCondition[];
    extra: ExtraCondition[];
    severity: string;
  };
  is_enabled: boolean;
  trigger_count?: number;
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
  category_id?: string | null;
  ad_group_id?: string | null;
}

interface AdsCampaign {
  id: string;
  name: string;
  ml_campaign_id: string;
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
    return { evaluated: 0, triggered: 0, tasks_created: 0, events: [] };
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

  // Fetch campaigns for enrichment
  const { data: campaigns } = await supabase
    .from('ads_campaigns')
    .select('id, name, ml_campaign_id')
    .eq('seller_id', sellerId);

  const campaignMap = new Map<string, AdsCampaign>();
  (campaigns || []).forEach((c: AdsCampaign) => campaignMap.set(c.id, c));

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
  (costCatalog || []).forEach((c: { product_key: string; margin_percent: number | null }) => {
    if (c.product_key && c.margin_percent !== null) {
      marginMap.set(c.product_key, c.margin_percent);
    }
  });

  // Fetch active promotions
  const { data: promotions } = await supabase
    .from('promotions')
    .select('item_id, id, name')
    .eq('seller_id', sellerId)
    .eq('status', 'active');

  const promotedItems = new Map<string, { id: string; name: string }>();
  (promotions || []).forEach((p: { item_id: string; id: string; name: string }) => {
    promotedItems.set(p.item_id, { id: p.id, name: p.name });
  });

  // Get user's workspace for task creation
  const { data: userPrefs } = await supabase
    .from('user_preferences')
    .select('active_workspace_id')
    .eq('user_id', rules[0]?.user_id)
    .single();

  const workspaceId = userPrefs?.active_workspace_id;

  // Evaluate each rule against each item
  const events: any[] = [];
  let triggered = 0;
  let tasksCreated = 0;

  for (const rule of rules) {
    const ruleConditions = rule.conditions?.items || [];
    const extraConditions = rule.conditions?.extra || [];
    const severity = rule.conditions?.severity || 'medium';

    for (const item of (items || []) as AdsItem[]) {
      // Calculate period-based metrics
      const itemMetrics = calculatePeriodMetrics(item, dailyMetrics || [], ruleConditions);
      
      // Check all conditions
      const promotedItemsSet = new Set(promotedItems.keys());
      const allConditionsMet = checkAllConditions(
        item,
        itemMetrics,
        ruleConditions,
        extraConditions,
        marginMap,
        promotedItemsSet
      );

      if (allConditionsMet && (ruleConditions.length > 0 || extraConditions.filter(e => e.enabled).length > 0)) {
        triggered++;
        
        const promotionInfo = promotedItems.get(item.item_id);
        const margin = marginMap.get(item.item_id);
        
        const eventData = {
          rule_id: rule.id,
          rule_name: rule.name,
          item_id: item.item_id,
          item_title: item.title,
          event_type: rule.rule_type,
          severity,
          metrics: itemMetrics,
          promotion_id: promotionInfo?.id,
          promotion_name: promotionInfo?.name,
          margin_percent: margin,
          category_id: item.category_id,
        };
        
        events.push(eventData);

        // Create alert in database
        const alertCreated = await createAlert(supabase, rule, item, itemMetrics, severity, sellerId, promotionInfo);

        // Create task if workspace is available
        if (workspaceId && alertCreated) {
          const taskCreated = await createTask(
            supabase, 
            rule, 
            item, 
            itemMetrics, 
            severity, 
            sellerId, 
            workspaceId,
            promotionInfo,
            margin
          );
          if (taskCreated) tasksCreated++;
        }
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

  console.log(`[ads-rules-engine] Evaluated ${rules.length} rules, triggered ${triggered} events, created ${tasksCreated} tasks`);

  return { 
    evaluated: rules.length, 
    triggered, 
    tasks_created: tasksCreated,
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
  const itemMetrics = dailyMetrics.filter((m: any) => 
    m.item_id === item.item_id && 
    m.metric_date >= cutoffStr
  );

  const totalSpent = itemMetrics.reduce((sum: number, m: any) => sum + (m.spent || 0), 0) || item.spent || 0;
  const totalRevenue = itemMetrics.reduce((sum: number, m: any) => sum + (m.revenue || 0), 0) || item.revenue_from_ads || 0;
  const totalClicks = itemMetrics.reduce((sum: number, m: any) => sum + (m.clicks || 0), 0) || item.clicks || 0;
  const totalImpressions = itemMetrics.reduce((sum: number, m: any) => sum + (m.impressions || 0), 0) || item.impressions || 0;
  const totalConversions = itemMetrics.reduce((sum: number, m: any) => sum + (m.conversions || 0), 0) || item.conversions || 0;

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
      const margin = marginMap.get(item.item_id) ?? 25;
      compareValue = margin;
    } else if (cond.compare_with === 'target_acos') {
      compareValue = 30;
    } else if (cond.compare_with === 'target_roas') {
      compareValue = 3;
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
  sellerId: string,
  promotionInfo?: { id: string; name: string }
): Promise<boolean> {
  const alertType = rule.rule_type === 'opportunity' ? 'rule_opportunity' : 'rule_violation';
  
  // Check if similar alert already exists (avoid duplicates)
  const { data: existing } = await supabase
    .from('ads_alerts')
    .select('id')
    .eq('seller_id', sellerId)
    .eq('item_id', item.item_id)
    .eq('alert_type', alertType)
    .eq('is_dismissed', false)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[ads-rules-engine] Alert already exists for rule ${rule.id} and item ${item.item_id}`);
    return false;
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
        promotion_id: promotionInfo?.id,
        promotion_name: promotionInfo?.name,
      },
    });

  if (error) {
    console.error(`[ads-rules-engine] Failed to create alert: ${error.message}`);
    return false;
  }

  // Update trigger count
  await supabase
    .from('ads_automation_rules')
    .update({ 
      trigger_count: (rule.trigger_count || 0) + 1,
      last_triggered_at: new Date().toISOString(),
    })
    .eq('id', rule.id);

  return true;
}

async function createTask(
  supabase: any,
  rule: AdsRule,
  item: AdsItem,
  metrics: Record<string, number>,
  severity: string,
  sellerId: string,
  workspaceId: string,
  promotionInfo?: { id: string; name: string },
  margin?: number
): Promise<boolean> {
  const isViolation = rule.rule_type === 'violation';
  
  // Generate unique source_id for deduplication
  const sourceId = `ads_rule_${rule.id}_${item.item_id}`;
  
  // Check for existing open task with same source
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('source_type', 'ads')
    .eq('source_id', sourceId)
    .neq('status', 'done')
    .limit(1);

  if (existingTask && existingTask.length > 0) {
    console.log(`[ads-rules-engine] Task already exists for ${sourceId}`);
    return false;
  }

  // Determine priority based on financial impact
  const priority = calculateTaskPriority(metrics, severity, isViolation);
  
  // Build task title and description
  const title = generateTaskTitle(rule, item, isViolation);
  const description = generateTaskDescription(rule, item, metrics, promotionInfo, margin);

  // Build tags
  const tags: string[] = ['ads', rule.rule_type];
  if (promotionInfo) tags.push('promo');
  if (metrics.acos > 30) tags.push('acos-alto');
  if (metrics.roas > 3) tags.push('roas-alto');

  // Build source_ref with full context
  const sourceRef = {
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    item_id: item.item_id,
    item_title: item.title,
    seller_id: sellerId,
    metrics,
    promotion_id: promotionInfo?.id,
    promotion_name: promotionInfo?.name,
    margin_percent: margin,
    triggered_at: new Date().toISOString(),
    conditions_summary: summarizeConditions(rule.conditions?.items || []),
  };

  const { data: newTask, error } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      title,
      description,
      priority,
      status: 'todo',
      source_type: 'ads',
      source_id: sourceId,
      source_ref: sourceRef,
      tags,
      created_by_user_id: rule.user_id,
      due_at: calculateDueDate(priority),
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[ads-rules-engine] Failed to create task: ${error.message}`);
    return false;
  }

  console.log(`[ads-rules-engine] Created task ${newTask.id} for rule ${rule.name}`);

  // Add checklist items for common actions
  if (newTask?.id) {
    await addTaskChecklist(supabase, newTask.id, isViolation, metrics);
    
    // Create notification for the user
    await createTaskNotification(supabase, workspaceId, rule.user_id, newTask.id, title, isViolation);
  }

  return true;
}

function calculateTaskPriority(
  metrics: Record<string, number>, 
  severity: string, 
  isViolation: boolean
): 'low' | 'medium' | 'high' | 'urgent' {
  // Calculate financial impact
  const potentialLoss = metrics.spent - metrics.revenue;
  
  if (severity === 'critical' || potentialLoss > 500) {
    return 'urgent';
  }
  if (severity === 'high' || potentialLoss > 200 || (isViolation && metrics.acos > 50)) {
    return 'high';
  }
  if (severity === 'medium' || potentialLoss > 50) {
    return 'medium';
  }
  return 'low';
}

function generateTaskTitle(rule: AdsRule, item: AdsItem, isViolation: boolean): string {
  const prefix = isViolation ? '⚠️' : '📈';
  const itemName = item.title ? item.title.substring(0, 50) : item.item_id;
  return `${prefix} [ADS] ${rule.name}: ${itemName}`;
}

function generateTaskDescription(
  rule: AdsRule,
  item: AdsItem,
  metrics: Record<string, number>,
  promotionInfo?: { id: string; name: string },
  margin?: number
): string {
  const lines: string[] = [
    `## Regra Acionada`,
    `**${rule.name}**`,
    '',
    `## Produto`,
    `- **Título:** ${item.title || 'N/A'}`,
    `- **ID:** ${item.item_id}`,
    `- **Preço atual:** ${item.current_price ? `R$ ${item.current_price.toFixed(2)}` : 'N/A'}`,
    '',
    `## Métricas de ADS`,
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Gasto | R$ ${metrics.spent.toFixed(2)} |`,
    `| Receita | R$ ${metrics.revenue.toFixed(2)} |`,
    `| ACOS | ${metrics.acos.toFixed(1)}% |`,
    `| ROAS | ${metrics.roas.toFixed(2)} |`,
    `| Cliques | ${metrics.clicks} |`,
    `| Conversões | ${metrics.conversions} |`,
  ];

  if (margin !== undefined) {
    lines.push('', `## Margem Cadastrada`, `**${margin.toFixed(1)}%**`);
  }

  if (promotionInfo) {
    lines.push('', `## Promoção Ativa`, `**${promotionInfo.name}** (ID: ${promotionInfo.id})`);
  }

  lines.push(
    '',
    `## Análise`,
    rule.rule_type === 'violation' 
      ? `Este produto requer atenção pois as métricas de publicidade estão fora dos parâmetros desejados.`
      : `Este produto apresenta uma oportunidade de escalar investimento em publicidade.`,
    '',
    `---`,
    `*Gerado automaticamente pelo Motor de Regras de ADS em ${new Date().toLocaleString('pt-BR')}*`
  );

  return lines.join('\n');
}

function summarizeConditions(conditions: RuleCondition[]): string {
  return conditions.map(c => 
    `${c.metric} ${c.operator} ${c.compare_with === 'fixed_value' ? c.fixed_value : c.compare_with}`
  ).join(', ');
}

function calculateDueDate(priority: string): string {
  const now = new Date();
  switch (priority) {
    case 'urgent':
      now.setHours(now.getHours() + 4);
      break;
    case 'high':
      now.setHours(now.getHours() + 24);
      break;
    case 'medium':
      now.setHours(now.getHours() + 72);
      break;
    default:
      now.setDate(now.getDate() + 7);
  }
  return now.toISOString();
}

async function addTaskChecklist(
  supabase: any, 
  taskId: string, 
  isViolation: boolean, 
  metrics: Record<string, number>
) {
  const items: { title: string; sort_order: number }[] = [];

  if (isViolation) {
    items.push({ title: 'Analisar histórico de performance do produto', sort_order: 1 });
    
    if (metrics.acos > 30) {
      items.push({ title: 'Avaliar redução de lance ou pausa do anúncio', sort_order: 2 });
      items.push({ title: 'Verificar se preço está competitivo', sort_order: 3 });
    }
    
    if (metrics.conversions === 0) {
      items.push({ title: 'Verificar qualidade do anúncio (título, fotos)', sort_order: 2 });
      items.push({ title: 'Considerar pausar temporariamente', sort_order: 3 });
    }
    
    items.push({ title: 'Documentar decisão tomada', sort_order: 10 });
  } else {
    items.push({ title: 'Analisar margem atual vs ACOS', sort_order: 1 });
    items.push({ title: 'Avaliar aumento de investimento', sort_order: 2 });
    items.push({ title: 'Verificar disponibilidade de estoque', sort_order: 3 });
    items.push({ title: 'Documentar decisão tomada', sort_order: 10 });
  }

  for (const item of items) {
    await supabase
      .from('task_checklists')
      .insert({
        task_id: taskId,
        title: item.title,
        sort_order: item.sort_order,
        is_done: false,
      });
  }
}

async function createTaskNotification(
  supabase: any,
  workspaceId: string,
  userId: string,
  taskId: string,
  taskTitle: string,
  isViolation: boolean
) {
  await supabase
    .from('notifications')
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      type: 'automation_created',
      title: isViolation ? 'Nova tarefa de ADS (Violação)' : 'Nova tarefa de ADS (Oportunidade)',
      body: taskTitle,
      link: `/tarefas?task=${taskId}`,
      is_read: false,
    });
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
