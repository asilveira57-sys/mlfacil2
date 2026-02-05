import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsultantRequest {
  seller_id: string;
  analysis_type: 'full' | 'quick' | 'specific';
  focus_area?: 'violations' | 'opportunities' | 'budget' | 'performance';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { seller_id, analysis_type = 'full', focus_area }: ConsultantRequest = await req.json();

    if (!seller_id) {
      return new Response(
        JSON.stringify({ error: 'seller_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ads-ai-consultant] Starting ${analysis_type} analysis for seller ${seller_id}`);

    // Gather all relevant data for analysis
    const analysisData = await gatherAnalysisData(supabase, seller_id);
    
    // Build the prompt for the AI consultant
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(analysisData, analysis_type, focus_area);

    console.log('[ads-ai-consultant] Calling Lovable AI for strategic analysis...');

    // Call Lovable AI for analysis
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_strategic_analysis',
              description: 'Generate a structured strategic analysis with prioritized recommendations',
              parameters: {
                type: 'object',
                properties: {
                  executive_summary: {
                    type: 'string',
                    description: 'Brief executive summary in Portuguese (2-3 sentences)'
                  },
                  health_score: {
                    type: 'number',
                    description: 'Overall ADS health score from 0-100'
                  },
                  health_status: {
                    type: 'string',
                    enum: ['critical', 'warning', 'healthy', 'excellent'],
                    description: 'Overall health status'
                  },
                  priority_actions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        priority: { type: 'number', description: '1 = highest priority' },
                        action: { type: 'string', description: 'Clear action in Portuguese' },
                        rationale: { type: 'string', description: 'Why this action in Portuguese' },
                        expected_impact: { type: 'string', description: 'Expected impact in Portuguese' },
                        risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
                        urgency: { type: 'string', enum: ['immediate', 'this_week', 'this_month'] },
                        category: { type: 'string', enum: ['budget', 'optimization', 'expansion', 'reduction', 'monitoring'] },
                        affected_items: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Item IDs or campaign names affected'
                        }
                      },
                      required: ['priority', 'action', 'rationale', 'expected_impact', 'risk_level', 'urgency', 'category']
                    }
                  },
                  risks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        risk: { type: 'string', description: 'Risk description in Portuguese' },
                        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                        mitigation: { type: 'string', description: 'How to mitigate in Portuguese' }
                      },
                      required: ['risk', 'severity', 'mitigation']
                    }
                  },
                  opportunities: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        opportunity: { type: 'string', description: 'Opportunity description in Portuguese' },
                        potential_value: { type: 'string', description: 'Estimated value or impact in Portuguese' },
                        effort_required: { type: 'string', enum: ['low', 'medium', 'high'] }
                      },
                      required: ['opportunity', 'potential_value', 'effort_required']
                    }
                  },
                  rule_analysis: {
                    type: 'object',
                    properties: {
                      total_violations: { type: 'number' },
                      total_opportunities: { type: 'number' },
                      most_triggered_rule: { type: 'string' },
                      rule_effectiveness_note: { type: 'string', description: 'Note about rule effectiveness in Portuguese' }
                    }
                  },
                  performance_trends: {
                    type: 'object',
                    properties: {
                      acos_trend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
                      roas_trend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
                      spend_trend: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
                      trend_explanation: { type: 'string', description: 'Brief explanation in Portuguese' }
                    }
                  },
                  next_steps: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of clear next steps in Portuguese'
                  }
                },
                required: ['executive_summary', 'health_score', 'health_status', 'priority_actions', 'risks', 'opportunities', 'next_steps']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'generate_strategic_analysis' } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[ads-ai-consultant] AI gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || !toolCall.function?.arguments) {
      throw new Error('Invalid AI response structure');
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    
    console.log(`[ads-ai-consultant] Analysis complete. Health score: ${analysis.health_score}`);

    // Store the analysis for history
    await supabase
      .from('ads_ai_analyses')
      .insert({
        seller_id,
        analysis_type,
        focus_area: focus_area || null,
        health_score: analysis.health_score,
        health_status: analysis.health_status,
        analysis_json: analysis,
        input_summary: {
          alerts_count: analysisData.alerts.length,
          tasks_count: analysisData.tasks.length,
          rules_count: analysisData.rules.length,
          items_count: analysisData.items.length,
        },
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis,
        generated_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ads-ai-consultant] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function gatherAnalysisData(supabase: any, sellerId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

  // Fetch all relevant data in parallel
  const [
    alertsResult,
    rulesResult,
    itemsResult,
    campaignsResult,
    metricsResult,
    tasksResult,
  ] = await Promise.all([
    // Recent alerts (last 30 days)
    supabase
      .from('ads_alerts')
      .select('*')
      .eq('seller_id', sellerId)
      .gte('created_at', dateStr)
      .order('created_at', { ascending: false }),
    
    // Automation rules
    supabase
      .from('ads_automation_rules')
      .select('*')
      .eq('seller_id', sellerId),
    
    // ADS items with performance
    supabase
      .from('ads_items')
      .select('*')
      .eq('seller_id', sellerId),
    
    // Campaigns
    supabase
      .from('ads_campaigns')
      .select('*')
      .eq('seller_id', sellerId),
    
    // Daily metrics
    supabase
      .from('ads_daily_metrics')
      .select('*')
      .eq('seller_id', sellerId)
      .gte('metric_date', dateStr)
      .order('metric_date', { ascending: false }),
    
    // ADS-related tasks
    supabase
      .from('tasks')
      .select('*')
      .eq('source_type', 'ads')
      .gte('created_at', dateStr)
      .order('created_at', { ascending: false }),
  ]);

  // Get cost catalog for margin context
  const { data: costCatalog } = await supabase
    .from('cost_catalog')
    .select('product_key, margin_percent, cost_total')
    .eq('seller_id', sellerId);

  return {
    alerts: alertsResult.data || [],
    rules: rulesResult.data || [],
    items: itemsResult.data || [],
    campaigns: campaignsResult.data || [],
    metrics: metricsResult.data || [],
    tasks: tasksResult.data || [],
    costCatalog: costCatalog || [],
  };
}

function buildSystemPrompt(): string {
  return `Você é um consultor estratégico especialista em publicidade do Mercado Livre (Mercado ADS).

Seu papel é analisar dados de campanhas publicitárias e fornecer recomendações claras, priorizadas e acionáveis para tomadores de decisão.

PRINCÍPIOS:
- Use linguagem executiva, clara e objetiva
- Priorize ações por impacto financeiro e urgência
- Explique riscos e oportunidades de forma simples
- Nunca execute ações - apenas recomende
- Considere o histórico de decisões anteriores
- Baseie recomendações em dados concretos

MÉTRICAS CHAVE:
- ACOS (Advertising Cost of Sales): % do gasto sobre receita - menor é melhor, ideal < 30%
- ROAS (Return on Ad Spend): receita / gasto - maior é melhor, ideal > 3
- Margem: margem cadastrada no catálogo de custos
- Conversões: vendas geradas pelos anúncios

CLASSIFICAÇÃO DE SAÚDE:
- Excellent: ACOS < 20%, ROAS > 4, lucro consistente
- Healthy: ACOS 20-30%, ROAS 3-4, operação estável
- Warning: ACOS 30-40%, ROAS 2-3, ajustes necessários
- Critical: ACOS > 40%, ROAS < 2, ação urgente

Analise os dados fornecidos e gere recomendações estratégicas priorizadas.`;
}

function buildUserPrompt(data: any, analysisType: string, focusArea?: string): string {
  // Aggregate metrics
  const totalSpent = data.items.reduce((sum: number, i: any) => sum + (i.spent || 0), 0);
  const totalRevenue = data.items.reduce((sum: number, i: any) => sum + (i.revenue_from_ads || 0), 0);
  const avgAcos = totalRevenue > 0 ? (totalSpent / totalRevenue) * 100 : 0;
  const avgRoas = totalSpent > 0 ? totalRevenue / totalSpent : 0;

  // Count alerts by type
  const violations = data.alerts.filter((a: any) => a.alert_type === 'rule_violation').length;
  const opportunities = data.alerts.filter((a: any) => a.alert_type === 'rule_opportunity').length;
  const dismissedAlerts = data.alerts.filter((a: any) => a.is_dismissed).length;

  // Task status breakdown
  const tasksByStatus = {
    todo: data.tasks.filter((t: any) => t.status === 'todo').length,
    in_progress: data.tasks.filter((t: any) => t.status === 'in_progress').length,
    done: data.tasks.filter((t: any) => t.status === 'done').length,
  };

  // Top items by issues
  const highAcosItems = data.items
    .filter((i: any) => i.acos && i.acos > 40)
    .sort((a: any, b: any) => (b.spent || 0) - (a.spent || 0))
    .slice(0, 5);

  const highRoasItems = data.items
    .filter((i: any) => i.roas && i.roas > 3)
    .sort((a: any, b: any) => (b.revenue_from_ads || 0) - (a.revenue_from_ads || 0))
    .slice(0, 5);

  // Rules summary
  const enabledRules = data.rules.filter((r: any) => r.is_enabled).length;
  const mostTriggeredRule = data.rules.reduce((max: any, r: any) => 
    (r.trigger_count || 0) > (max?.trigger_count || 0) ? r : max, null);

  // Build margin map
  const marginMap = new Map();
  data.costCatalog.forEach((c: any) => {
    if (c.product_key) marginMap.set(c.product_key, c.margin_percent);
  });

  // Items with margin issues (ACOS > margin)
  const marginIssues = data.items.filter((i: any) => {
    const margin = marginMap.get(i.item_id);
    return margin && i.acos && i.acos > margin;
  });

  let prompt = `## ANÁLISE DE PUBLICIDADE - MERCADO ADS

### RESUMO GERAL
- Total Investido: R$ ${totalSpent.toFixed(2)}
- Receita Total: R$ ${totalRevenue.toFixed(2)}
- ACOS Médio: ${avgAcos.toFixed(1)}%
- ROAS Médio: ${avgRoas.toFixed(2)}
- Lucro/Prejuízo: R$ ${(totalRevenue - totalSpent).toFixed(2)}

### ALERTAS (últimos 30 dias)
- Violações: ${violations}
- Oportunidades: ${opportunities}
- Dispensados: ${dismissedAlerts}

### TAREFAS GERADAS
- Pendentes: ${tasksByStatus.todo}
- Em Andamento: ${tasksByStatus.in_progress}
- Concluídas: ${tasksByStatus.done}

### REGRAS DE AUTOMAÇÃO
- Regras ativas: ${enabledRules} de ${data.rules.length}
- Regra mais acionada: ${mostTriggeredRule?.name || 'Nenhuma'} (${mostTriggeredRule?.trigger_count || 0} vezes)

### PRODUTOS COM ACOS ALTO (>40%)
${highAcosItems.length > 0 ? highAcosItems.map((i: any) => 
  `- ${i.title || i.item_id}: ACOS ${i.acos?.toFixed(1)}%, Gasto R$ ${(i.spent || 0).toFixed(2)}`
).join('\n') : 'Nenhum'}

### PRODUTOS COM ALTO ROAS (>3)
${highRoasItems.length > 0 ? highRoasItems.map((i: any) => 
  `- ${i.title || i.item_id}: ROAS ${i.roas?.toFixed(2)}, Receita R$ ${(i.revenue_from_ads || 0).toFixed(2)}`
).join('\n') : 'Nenhum'}

### PRODUTOS COM ACOS > MARGEM CADASTRADA
${marginIssues.length > 0 ? marginIssues.slice(0, 5).map((i: any) => {
  const margin = marginMap.get(i.item_id);
  return `- ${i.title || i.item_id}: ACOS ${i.acos?.toFixed(1)}% vs Margem ${margin?.toFixed(1)}%`;
}).join('\n') : 'Nenhum com dados de margem'}

### CAMPANHAS
- Total: ${data.campaigns.length}
- Ativas: ${data.campaigns.filter((c: any) => c.status === 'active').length}
- Pausadas: ${data.campaigns.filter((c: any) => c.status === 'paused').length}
`;

  if (focusArea) {
    prompt += `\n### FOCO DA ANÁLISE: ${focusArea.toUpperCase()}\n`;
  }

  prompt += `\nGere uma análise estratégica completa com recomendações priorizadas.`;

  return prompt;
}
