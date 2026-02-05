/**
 * Pricing Engine - Edge Function
 * 
 * Endpoints:
 * - POST /create - Create a new simulation
 * - POST /recalculate - Recalculate a simulation
 * - POST /save - Save a simulation
 * - POST /approve - Approve a simulation (validates rules)
 * - POST /duplicate - Duplicate a simulation
 * - POST /archive - Archive a simulation
 * - GET /list - List simulations with filters
 * - GET /details - Get simulation details
 * - POST /validate - Validate against workspace rules
 */

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Types
interface SimulationInput {
  cost_product: number;
  cost_packaging: number;
  cost_extra: number;
  cost_source: string;
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  dimensions_source: string;
  shipping_mode: string;
  shipping_charged_to_customer: number;
  shipping_cost_estimated: number;
  freight_ruleset_id: string | null;
  freight_profile: string;
  logistic_type: string;
  fee_mode: string;
  fee_percent: number;
  fee_fixed: number;
  fee_ruleset_id: string | null;
  tax_mode: string;
  tax_percent: number;
  discount_value: number;
  discount_percent: number;
  listing_type: string;
  channel_params: Record<string, unknown>;
}

interface SimulationResult {
  gross_revenue: number;
  net_revenue: number;
  total_cost: number;
  cost_breakdown: Record<string, number>;
  marketplace_fees_total: number;
  taxes_total: number;
  fees_breakdown: Record<string, number>;
  profit_value: number;
  profit_total: number;
  margin_percent: number;
  margin_after_shipping: number;
  markup_percent: number;
  breakeven_price: number;
  min_price_for_target: number | null;
  flags: string[];
}

interface ValidationRule {
  id: string;
  scope: string;
  marketplace: string | null;
  category_ref: string | null;
  min_margin_percent: number;
  warning_margin_percent: number;
  min_profit_value: number | null;
  allow_negative_margin: boolean;
}

// Profile weight/dimension estimates when actual values are missing
const PROFILE_ESTIMATES: Record<string, { weight_kg: number; dimensions_sum: number }> = {
  A: { weight_kg: 0.3, dimensions_sum: 40 },
  B: { weight_kg: 2, dimensions_sum: 100 },
  C: { weight_kg: 10, dimensions_sum: 200 },
};

// Helper functions
function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function respondError(code: string, message: string, status = 400, details?: unknown) {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, details } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function getEffectiveWeight(input: SimulationInput): number {
  if (input.weight_kg && input.weight_kg > 0) {
    return input.weight_kg;
  }
  const profile = input.freight_profile || 'B';
  return PROFILE_ESTIMATES[profile]?.weight_kg || 2;
}

function getEffectiveDimensionsSum(input: SimulationInput): number {
  if (input.height_cm && input.width_cm && input.length_cm) {
    return input.height_cm + input.width_cm + input.length_cm;
  }
  const profile = input.freight_profile || 'B';
  return PROFILE_ESTIMATES[profile]?.dimensions_sum || 100;
}

// Core calculation function
function calculatePricing(
  salePrice: number,
  quantity: number,
  input: SimulationInput,
  targetMargin?: number | null
): SimulationResult {
  const flags: string[] = [];
  
  // Validate inputs
  if (!input.cost_product || input.cost_product <= 0) {
    flags.push('missing_cost');
  }
  
  if (!input.weight_kg && !input.height_cm) {
    flags.push('missing_dims');
  }
  
  // Costs
  const productCost = input.cost_product || 0;
  const packagingCost = input.cost_packaging || 0;
  const extraCost = input.cost_extra || 0;
  const shippingCost = input.shipping_cost_estimated || 0;
  
  // Revenue
  const shippingRevenue = input.shipping_charged_to_customer || 0;
  const discountValue = input.discount_value || 0;
  const discountPercent = input.discount_percent || 0;
  
  // Apply discount
  let effectivePrice = salePrice;
  if (discountPercent > 0) {
    effectivePrice = salePrice * (1 - discountPercent / 100);
  } else if (discountValue > 0) {
    effectivePrice = salePrice - discountValue;
  }
  
  const grossRevenue = (effectivePrice + shippingRevenue) * quantity;
  
  // Marketplace fees
  const feePercent = input.fee_percent || 0;
  const feeFixed = input.fee_fixed || 0;
  const marketplaceFees = (effectivePrice * feePercent / 100) + feeFixed;
  
  // Taxes
  const taxPercent = input.tax_percent || 0;
  const taxesTotal = effectivePrice * taxPercent / 100;
  
  // Net revenue after fees and taxes
  const netRevenue = effectivePrice - marketplaceFees - taxesTotal;
  
  // Total cost per unit
  const totalCostPerUnit = productCost + packagingCost + extraCost + shippingCost;
  const totalCost = totalCostPerUnit * quantity;
  
  // Profit
  const profitPerUnit = netRevenue + shippingRevenue - totalCostPerUnit;
  const profitTotal = profitPerUnit * quantity;
  
  // Margins
  const marginPercent = effectivePrice > 0 ? (profitPerUnit / effectivePrice) * 100 : 0;
  const marginAfterShipping = (effectivePrice + shippingRevenue) > 0 
    ? (profitPerUnit / (effectivePrice + shippingRevenue)) * 100 
    : 0;
  
  // Markup
  const markupPercent = totalCostPerUnit > 0 
    ? ((effectivePrice - totalCostPerUnit) / totalCostPerUnit) * 100 
    : 0;
  
  // Breakeven price (margin = 0)
  const feeMultiplier = 1 - (feePercent / 100) - (taxPercent / 100);
  const breakeven = feeMultiplier > 0 
    ? (totalCostPerUnit + feeFixed - shippingRevenue) / feeMultiplier 
    : 0;
  
  // Min price for target margin
  let minPriceForTarget: number | null = null;
  if (targetMargin !== null && targetMargin !== undefined) {
    const targetDecimal = targetMargin / 100;
    const denominator = feeMultiplier - targetDecimal;
    if (denominator > 0) {
      minPriceForTarget = (totalCostPerUnit + feeFixed - shippingRevenue) / denominator;
    }
  }
  
  // Flags
  if (marginPercent < 0) {
    flags.push('margin_negative');
  }
  
  if (input.shipping_mode === 'manual' && shippingCost === 0) {
    flags.push('shipping_manual_zero');
  }
  
  if (input.shipping_mode === 'table' && !input.freight_ruleset_id) {
    flags.push('shipping_out_of_table');
  }
  
  return {
    gross_revenue: Math.round(grossRevenue * 100) / 100,
    net_revenue: Math.round(netRevenue * quantity * 100) / 100,
    total_cost: Math.round(totalCost * 100) / 100,
    cost_breakdown: {
      product: productCost,
      packaging: packagingCost,
      extra: extraCost,
      shipping: shippingCost,
    },
    marketplace_fees_total: Math.round(marketplaceFees * quantity * 100) / 100,
    taxes_total: Math.round(taxesTotal * quantity * 100) / 100,
    fees_breakdown: {
      marketplace_percent: feePercent,
      marketplace_fixed: feeFixed,
      marketplace_total: marketplaceFees,
    },
    profit_value: Math.round(profitPerUnit * 100) / 100,
    profit_total: Math.round(profitTotal * 100) / 100,
    margin_percent: Math.round(marginPercent * 100) / 100,
    margin_after_shipping: Math.round(marginAfterShipping * 100) / 100,
    markup_percent: Math.round(markupPercent * 100) / 100,
    breakeven_price: Math.round(breakeven * 100) / 100,
    min_price_for_target: minPriceForTarget ? Math.round(minPriceForTarget * 100) / 100 : null,
    flags,
  };
}

// Validate against workspace rules
async function validateAgainstRules(
  supabase: SupabaseClient,
  workspaceId: string,
  marketplace: string,
  categoryRef: string | null,
  result: SimulationResult
): Promise<{ valid: boolean; rule: ValidationRule | null; violations: string[] }> {
  // Get applicable rules (most specific first)
  const { data: rules } = await supabase
    .from('pricing_validation_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('scope', { ascending: false });
  
  if (!rules || rules.length === 0) {
    return { valid: true, rule: null, violations: [] };
  }
  
  // Find the most specific applicable rule
  let applicableRule: ValidationRule | null = null;
  
  for (const rule of rules) {
    const r = rule as ValidationRule;
    if (r.scope === 'CATEGORY' && r.category_ref === categoryRef && r.marketplace === marketplace) {
      applicableRule = r;
      break;
    }
    if (r.scope === 'MARKETPLACE' && r.marketplace === marketplace) {
      applicableRule = r;
      break;
    }
    if (r.scope === 'GLOBAL') {
      applicableRule = r;
      break;
    }
  }
  
  if (!applicableRule) {
    return { valid: true, rule: null, violations: [] };
  }
  
  const violations: string[] = [];
  
  // Check margin
  if (result.margin_percent < applicableRule.min_margin_percent) {
    if (!applicableRule.allow_negative_margin && result.margin_percent < 0) {
      violations.push(`Margem negativa não permitida (${result.margin_percent.toFixed(2)}%)`);
    } else {
      violations.push(`Margem ${result.margin_percent.toFixed(2)}% abaixo do mínimo ${applicableRule.min_margin_percent}%`);
    }
  }
  
  // Check min profit
  if (applicableRule.min_profit_value && result.profit_value < applicableRule.min_profit_value) {
    violations.push(`Lucro R$ ${result.profit_value.toFixed(2)} abaixo do mínimo R$ ${applicableRule.min_profit_value.toFixed(2)}`);
  }
  
  return {
    valid: violations.length === 0,
    rule: applicableRule,
    violations,
  };
}

// Log event
async function logEvent(
  supabase: SupabaseClient,
  simulationId: string,
  workspaceId: string,
  userId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  marginAtEvent?: number,
  profitAtEvent?: number
) {
  await supabase.from('pricing_simulation_events').insert({
    simulation_id: simulationId,
    workspace_id: workspaceId,
    actor_user_id: userId,
    event_type: eventType,
    event_payload: payload,
    margin_at_event: marginAtEvent,
    profit_at_event: profitAtEvent,
  });
}

// Main handler
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get user from auth header
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user } } = await anonClient.auth.getUser(token);
    userId = user?.id || null;
  }
  
  if (!userId) {
    return respondError('UNAUTHORIZED', 'Autenticação necessária', 401);
  }
  
  try {
    // Route handling
    if (req.method === 'POST' && action === 'create') {
      return await handleCreate(supabase, userId, await req.json());
    }
    
    if (req.method === 'POST' && action === 'recalculate') {
      return await handleRecalculate(supabase, userId, await req.json());
    }
    
    if (req.method === 'POST' && action === 'save') {
      return await handleSave(supabase, userId, await req.json());
    }
    
    if (req.method === 'POST' && action === 'approve') {
      return await handleApprove(supabase, userId, await req.json());
    }
    
    if (req.method === 'POST' && action === 'duplicate') {
      return await handleDuplicate(supabase, userId, await req.json());
    }
    
    if (req.method === 'POST' && action === 'archive') {
      return await handleArchive(supabase, userId, await req.json());
    }
    
    if (req.method === 'GET' && action === 'list') {
      return await handleList(supabase, userId, url.searchParams);
    }
    
    if (req.method === 'GET' && action === 'details') {
      return await handleDetails(supabase, userId, url.searchParams);
    }
    
    if (req.method === 'POST' && action === 'validate') {
      return await handleValidate(supabase, userId, await req.json());
    }
    
    return respondError('NOT_FOUND', `Ação não encontrada: ${action}`, 404);
  } catch (error) {
    console.error('[pricing-engine] Error:', error);
    const errMsg = error instanceof Error ? error.message : 'Erro interno';
    return respondError('INTERNAL_ERROR', errMsg, 500);
  }
});

// Handler: Create simulation
async function handleCreate(
  supabase: SupabaseClient,
  userId: string,
  body: {
    workspace_id: string;
    title?: string;
    marketplace?: string;
    product_ref_type?: string;
    product_ref_id?: string;
    ml_item_id?: string;
    sale_price: number;
    target_margin?: number;
    quantity?: number;
    inputs?: Partial<SimulationInput>;
  }
) {
  const {
    workspace_id,
    title,
    marketplace = 'ML',
    product_ref_type = 'MANUAL_ITEM',
    product_ref_id,
    ml_item_id,
    sale_price,
    target_margin,
    quantity = 1,
    inputs = {},
  } = body;
  
  if (!workspace_id) {
    return respondError('MISSING_WORKSPACE', 'workspace_id é obrigatório');
  }
  
  if (!sale_price || sale_price <= 0) {
    return respondError('INVALID_PRICE', 'sale_price deve ser maior que zero');
  }
  
  // Create simulation
  const { data: simulation, error: simError } = await supabase
    .from('pricing_simulations')
    .insert({
      workspace_id,
      created_by_user_id: userId,
      title: title || `Simulação ${new Date().toLocaleDateString('pt-BR')}`,
      marketplace,
      product_ref_type,
      product_ref_id,
      ml_item_id,
      sale_price,
      target_margin,
      quantity,
      status: 'DRAFT',
    })
    .select()
    .single();
  
  if (simError) {
    console.error('[create] Simulation error:', simError);
    return respondError('DB_ERROR', simError.message);
  }
  
  const sim = simulation as { id: string; workspace_id: string };
  
  // Default inputs
  const defaultInputs: SimulationInput = {
    cost_product: 0,
    cost_packaging: 0,
    cost_extra: 0,
    cost_source: 'manual',
    weight_kg: null,
    height_cm: null,
    width_cm: null,
    length_cm: null,
    dimensions_source: 'manual',
    shipping_mode: 'manual',
    shipping_charged_to_customer: 0,
    shipping_cost_estimated: 0,
    freight_ruleset_id: null,
    freight_profile: 'B',
    logistic_type: 'ME2',
    fee_mode: 'manual',
    fee_percent: 16.5, // ML default
    fee_fixed: 6,
    fee_ruleset_id: null,
    tax_mode: 'none',
    tax_percent: 0,
    discount_value: 0,
    discount_percent: 0,
    listing_type: 'gold_pro',
    channel_params: {},
    ...inputs,
  };
  
  // Create inputs
  const { data: inputData, error: inputError } = await supabase
    .from('pricing_simulation_inputs')
    .insert({
      simulation_id: sim.id,
      version: 1,
      ...defaultInputs,
    })
    .select()
    .single();
  
  if (inputError) {
    console.error('[create] Input error:', inputError);
    return respondError('DB_ERROR', inputError.message);
  }
  
  const inp = inputData as { id: string };
  
  // Calculate initial result
  const result = calculatePricing(sale_price, quantity, defaultInputs, target_margin);
  
  // Save result
  const { data: resultData, error: resultError } = await supabase
    .from('pricing_simulation_results')
    .insert({
      simulation_id: sim.id,
      inputs_id: inp.id,
      version: 1,
      ...result,
    })
    .select()
    .single();
  
  if (resultError) {
    console.error('[create] Result error:', resultError);
    return respondError('DB_ERROR', resultError.message);
  }
  
  // Log event
  await logEvent(
    supabase,
    sim.id,
    workspace_id,
    userId,
    'CREATED',
    { sale_price, quantity, marketplace },
    result.margin_percent,
    result.profit_value
  );
  
  return respond({
    simulation,
    inputs: inputData,
    result: resultData,
  });
}

// Handler: Recalculate
async function handleRecalculate(
  supabase: SupabaseClient,
  userId: string,
  body: {
    simulation_id: string;
    sale_price?: number;
    quantity?: number;
    target_margin?: number;
    inputs?: Partial<SimulationInput>;
  }
) {
  const { simulation_id, sale_price, quantity, target_margin, inputs } = body;
  
  if (!simulation_id) {
    return respondError('MISSING_ID', 'simulation_id é obrigatório');
  }
  
  // Get simulation
  const { data: simulation, error: simError } = await supabase
    .from('pricing_simulations')
    .select('*')
    .eq('id', simulation_id)
    .single();
  
  if (simError || !simulation) {
    return respondError('NOT_FOUND', 'Simulação não encontrada');
  }
  
  const sim = simulation as { id: string; workspace_id: string; status: string; sale_price: number; quantity: number; target_margin: number | null };
  
  if (sim.status === 'APPROVED' || sim.status === 'ARCHIVED') {
    return respondError('INVALID_STATUS', 'Simulação aprovada ou arquivada não pode ser recalculada');
  }
  
  // Get latest input
  const { data: latestInput } = await supabase
    .from('pricing_simulation_inputs')
    .select('*')
    .eq('simulation_id', simulation_id)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  const latest = (latestInput || {}) as SimulationInput;
  
  // Merge inputs
  const mergedInputs: SimulationInput = {
    cost_product: latest.cost_product || 0,
    cost_packaging: latest.cost_packaging || 0,
    cost_extra: latest.cost_extra || 0,
    cost_source: latest.cost_source || 'manual',
    weight_kg: latest.weight_kg || null,
    height_cm: latest.height_cm || null,
    width_cm: latest.width_cm || null,
    length_cm: latest.length_cm || null,
    dimensions_source: latest.dimensions_source || 'manual',
    shipping_mode: latest.shipping_mode || 'manual',
    shipping_charged_to_customer: latest.shipping_charged_to_customer || 0,
    shipping_cost_estimated: latest.shipping_cost_estimated || 0,
    freight_ruleset_id: latest.freight_ruleset_id || null,
    freight_profile: latest.freight_profile || 'B',
    logistic_type: latest.logistic_type || 'ME2',
    fee_mode: latest.fee_mode || 'manual',
    fee_percent: latest.fee_percent || 16.5,
    fee_fixed: latest.fee_fixed || 6,
    fee_ruleset_id: latest.fee_ruleset_id || null,
    tax_mode: latest.tax_mode || 'none',
    tax_percent: latest.tax_percent || 0,
    discount_value: latest.discount_value || 0,
    discount_percent: latest.discount_percent || 0,
    listing_type: latest.listing_type || 'gold_pro',
    channel_params: latest.channel_params || {},
    ...inputs,
  };
  
  const effectivePrice = sale_price ?? sim.sale_price;
  const effectiveQuantity = quantity ?? sim.quantity;
  const effectiveTargetMargin = target_margin ?? sim.target_margin;
  
  // Get new version number
  const { count } = await supabase
    .from('pricing_simulation_inputs')
    .select('*', { count: 'exact', head: true })
    .eq('simulation_id', simulation_id);
  
  const newVersion = (count || 0) + 1;
  
  // Create new input record
  const { data: newInput, error: inputError } = await supabase
    .from('pricing_simulation_inputs')
    .insert({
      simulation_id,
      version: newVersion,
      ...mergedInputs,
    })
    .select()
    .single();
  
  if (inputError) {
    return respondError('DB_ERROR', inputError.message);
  }
  
  const newInp = newInput as { id: string };
  
  // Calculate
  const result = calculatePricing(effectivePrice, effectiveQuantity, mergedInputs, effectiveTargetMargin);
  
  // Save result
  const { data: resultData, error: resultError } = await supabase
    .from('pricing_simulation_results')
    .insert({
      simulation_id,
      inputs_id: newInp.id,
      version: newVersion,
      ...result,
    })
    .select()
    .single();
  
  if (resultError) {
    return respondError('DB_ERROR', resultError.message);
  }
  
  // Update simulation
  await supabase
    .from('pricing_simulations')
    .update({
      sale_price: effectivePrice,
      quantity: effectiveQuantity,
      target_margin: effectiveTargetMargin,
      updated_at: new Date().toISOString(),
    })
    .eq('id', simulation_id);
  
  // Log event
  await logEvent(
    supabase,
    simulation_id,
    sim.workspace_id,
    userId,
    'RECALCULATED',
    { version: newVersion, sale_price: effectivePrice },
    result.margin_percent,
    result.profit_value
  );
  
  return respond({
    simulation: { ...simulation, sale_price: effectivePrice, quantity: effectiveQuantity },
    inputs: newInput,
    result: resultData,
  });
}

// Handler: Save
async function handleSave(
  supabase: SupabaseClient,
  userId: string,
  body: { simulation_id: string; title?: string; notes?: string }
) {
  const { simulation_id, title, notes } = body;
  
  const { data: simulation, error } = await supabase
    .from('pricing_simulations')
    .update({
      status: 'SAVED',
      title: title || undefined,
      notes: notes || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', simulation_id)
    .select()
    .single();
  
  if (error) {
    return respondError('DB_ERROR', error.message);
  }
  
  const sim = simulation as { workspace_id: string };
  
  await logEvent(supabase, simulation_id, sim.workspace_id, userId, 'SAVED', { title, notes });
  
  return respond({ simulation });
}

// Handler: Approve
async function handleApprove(
  supabase: SupabaseClient,
  userId: string,
  body: { simulation_id: string; force?: boolean }
) {
  const { simulation_id, force = false } = body;
  
  // Get simulation with latest result
  const { data: simulation } = await supabase
    .from('pricing_simulations')
    .select('*')
    .eq('id', simulation_id)
    .single();
  
  if (!simulation) {
    return respondError('NOT_FOUND', 'Simulação não encontrada');
  }
  
  const sim = simulation as { id: string; workspace_id: string; marketplace: string };
  
  // Get latest result
  const { data: latestResult } = await supabase
    .from('pricing_simulation_results')
    .select('*')
    .eq('simulation_id', simulation_id)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  if (!latestResult) {
    return respondError('NO_RESULT', 'Simulação não possui resultado calculado');
  }
  
  const result = latestResult as { id: string } & SimulationResult;
  
  // Validate against rules
  const validation = await validateAgainstRules(
    supabase,
    sim.workspace_id,
    sim.marketplace,
    null, // TODO: get category from inputs
    result
  );
  
  if (!validation.valid && !force) {
    return respondError('VALIDATION_FAILED', 'Simulação não passou na validação', 400, {
      violations: validation.violations,
      rule: validation.rule,
    });
  }
  
  // Approve
  const { data: updated, error } = await supabase
    .from('pricing_simulations')
    .update({
      status: 'APPROVED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', simulation_id)
    .select()
    .single();
  
  if (error) {
    return respondError('DB_ERROR', error.message);
  }
  
  // Update result with validation info
  await supabase
    .from('pricing_simulation_results')
    .update({
      validation_rule_id: validation.rule?.id,
      validation_passed: true,
    })
    .eq('id', result.id);
  
  await logEvent(
    supabase,
    simulation_id,
    sim.workspace_id,
    userId,
    'APPROVED',
    { forced: force, rule_id: validation.rule?.id },
    result.margin_percent,
    result.profit_value
  );
  
  return respond({ simulation: updated, validation });
}

// Handler: Duplicate
async function handleDuplicate(
  supabase: SupabaseClient,
  userId: string,
  body: { simulation_id: string; title?: string }
) {
  const { simulation_id, title } = body;
  
  // Get original
  const { data: original } = await supabase
    .from('pricing_simulations')
    .select('*')
    .eq('id', simulation_id)
    .single();
  
  if (!original) {
    return respondError('NOT_FOUND', 'Simulação não encontrada');
  }
  
  const orig = original as {
    workspace_id: string;
    title: string;
    marketplace: string;
    product_ref_type: string;
    product_ref_id: string | null;
    ml_item_id: string | null;
    sale_price: number;
    target_margin: number | null;
    quantity: number;
  };
  
  // Get latest inputs
  const { data: originalInputs } = await supabase
    .from('pricing_simulation_inputs')
    .select('*')
    .eq('simulation_id', simulation_id)
    .order('version', { ascending: false })
    .limit(1)
    .single();
  
  if (!originalInputs) {
    return respondError('NO_INPUTS', 'Simulação não possui inputs');
  }
  
  const origInputs = originalInputs as SimulationInput & { id: string; simulation_id: string; created_at: string };
  
  // Create new simulation
  const { data: newSimulation, error: simError } = await supabase
    .from('pricing_simulations')
    .insert({
      workspace_id: orig.workspace_id,
      created_by_user_id: userId,
      title: title || `${orig.title} (cópia)`,
      marketplace: orig.marketplace,
      product_ref_type: orig.product_ref_type,
      product_ref_id: orig.product_ref_id,
      ml_item_id: orig.ml_item_id,
      sale_price: orig.sale_price,
      target_margin: orig.target_margin,
      quantity: orig.quantity,
      status: 'DRAFT',
    })
    .select()
    .single();
  
  if (simError) {
    return respondError('DB_ERROR', simError.message);
  }
  
  const newSim = newSimulation as { id: string };
  
  // Clone inputs (without id, simulation_id, created_at)
  const inputData: SimulationInput = {
    cost_product: origInputs.cost_product,
    cost_packaging: origInputs.cost_packaging,
    cost_extra: origInputs.cost_extra,
    cost_source: origInputs.cost_source,
    weight_kg: origInputs.weight_kg,
    height_cm: origInputs.height_cm,
    width_cm: origInputs.width_cm,
    length_cm: origInputs.length_cm,
    dimensions_source: origInputs.dimensions_source,
    shipping_mode: origInputs.shipping_mode,
    shipping_charged_to_customer: origInputs.shipping_charged_to_customer,
    shipping_cost_estimated: origInputs.shipping_cost_estimated,
    freight_ruleset_id: origInputs.freight_ruleset_id,
    freight_profile: origInputs.freight_profile,
    logistic_type: origInputs.logistic_type,
    fee_mode: origInputs.fee_mode,
    fee_percent: origInputs.fee_percent,
    fee_fixed: origInputs.fee_fixed,
    fee_ruleset_id: origInputs.fee_ruleset_id,
    tax_mode: origInputs.tax_mode,
    tax_percent: origInputs.tax_percent,
    discount_value: origInputs.discount_value,
    discount_percent: origInputs.discount_percent,
    listing_type: origInputs.listing_type,
    channel_params: origInputs.channel_params,
  };
  
  const { data: newInputs, error: inputError } = await supabase
    .from('pricing_simulation_inputs')
    .insert({
      simulation_id: newSim.id,
      version: 1,
      ...inputData,
    })
    .select()
    .single();
  
  if (inputError) {
    return respondError('DB_ERROR', inputError.message);
  }
  
  const newInp = newInputs as { id: string };
  
  // Recalculate
  const result = calculatePricing(
    orig.sale_price,
    orig.quantity,
    inputData,
    orig.target_margin
  );
  
  const { data: newResult, error: resultError } = await supabase
    .from('pricing_simulation_results')
    .insert({
      simulation_id: newSim.id,
      inputs_id: newInp.id,
      version: 1,
      ...result,
    })
    .select()
    .single();
  
  if (resultError) {
    return respondError('DB_ERROR', resultError.message);
  }
  
  // Log events
  await logEvent(supabase, simulation_id, orig.workspace_id, userId, 'DUPLICATED', {
    new_simulation_id: newSim.id,
  });
  
  await logEvent(supabase, newSim.id, orig.workspace_id, userId, 'CREATED', {
    duplicated_from: simulation_id,
  });
  
  return respond({
    simulation: newSimulation,
    inputs: newInputs,
    result: newResult,
  });
}

// Handler: Archive
async function handleArchive(
  supabase: SupabaseClient,
  userId: string,
  body: { simulation_id: string }
) {
  const { simulation_id } = body;
  
  const { data: simulation, error } = await supabase
    .from('pricing_simulations')
    .update({
      status: 'ARCHIVED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', simulation_id)
    .select()
    .single();
  
  if (error) {
    return respondError('DB_ERROR', error.message);
  }
  
  const sim = simulation as { workspace_id: string };
  
  await logEvent(supabase, simulation_id, sim.workspace_id, userId, 'ARCHIVED', {});
  
  return respond({ simulation });
}

// Handler: List
async function handleList(
  supabase: SupabaseClient,
  _userId: string,
  params: URLSearchParams
) {
  const workspaceId = params.get('workspace_id');
  const status = params.get('status');
  const marketplace = params.get('marketplace');
  const productRefId = params.get('product_ref_id');
  const search = params.get('search');
  const limit = parseInt(params.get('limit') || '50');
  const offset = parseInt(params.get('offset') || '0');
  
  if (!workspaceId) {
    return respondError('MISSING_WORKSPACE', 'workspace_id é obrigatório');
  }
  
  // First get simulations
  let query = supabase
    .from('pricing_simulations')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  if (marketplace) {
    query = query.eq('marketplace', marketplace);
  }
  
  if (productRefId) {
    query = query.eq('product_ref_id', productRefId);
  }
  
  if (search) {
    query = query.ilike('title', `%${search}%`);
  }
  
  const { data: simulations, error, count } = await query;
  
  if (error) {
    return respondError('DB_ERROR', error.message);
  }
  
  // Get latest results for each simulation
  const simulationIds = (simulations || []).map((s: { id: string }) => s.id);
  
  let resultsMap: Record<string, unknown> = {};
  
  if (simulationIds.length > 0) {
    const { data: results } = await supabase
      .from('pricing_simulation_results')
      .select('*')
      .in('simulation_id', simulationIds)
      .order('version', { ascending: false });
    
    // Group by simulation_id and get the latest (first after ordering)
    resultsMap = (results || []).reduce((acc: Record<string, unknown>, r: { simulation_id: string }) => {
      if (!acc[r.simulation_id]) {
        acc[r.simulation_id] = r;
      }
      return acc;
    }, {});
  }
  
  // Merge
  const enrichedSimulations = (simulations || []).map((sim: { id: string }) => ({
    ...sim,
    latest_result: resultsMap[sim.id] || null,
  }));
  
  return respond({
    simulations: enrichedSimulations,
    total: count,
    limit,
    offset,
  });
}

// Handler: Details
async function handleDetails(
  supabase: SupabaseClient,
  _userId: string,
  params: URLSearchParams
) {
  const simulationId = params.get('simulation_id');
  
  if (!simulationId) {
    return respondError('MISSING_ID', 'simulation_id é obrigatório');
  }
  
  // Get simulation
  const { data: simulation, error: simError } = await supabase
    .from('pricing_simulations')
    .select('*')
    .eq('id', simulationId)
    .single();
  
  if (simError || !simulation) {
    return respondError('NOT_FOUND', 'Simulação não encontrada');
  }
  
  const sim = simulation as { workspace_id: string };
  
  // Get inputs (all versions)
  const { data: inputs } = await supabase
    .from('pricing_simulation_inputs')
    .select('*')
    .eq('simulation_id', simulationId)
    .order('version', { ascending: false });
  
  // Get results (all versions)
  const { data: results } = await supabase
    .from('pricing_simulation_results')
    .select('*')
    .eq('simulation_id', simulationId)
    .order('version', { ascending: false });
  
  // Get events
  const { data: events } = await supabase
    .from('pricing_simulation_events')
    .select('*')
    .eq('simulation_id', simulationId)
    .order('created_at', { ascending: false });
  
  // Get validation rules for workspace
  const { data: validationRules } = await supabase
    .from('pricing_validation_rules')
    .select('*')
    .eq('workspace_id', sim.workspace_id)
    .eq('is_active', true);
  
  return respond({
    simulation,
    latest_inputs: (inputs as unknown[])?.[0] || null,
    latest_result: (results as unknown[])?.[0] || null,
    inputs_history: inputs,
    results_history: results,
    events,
    validation_rules: validationRules,
  });
}

// Handler: Validate
async function handleValidate(
  supabase: SupabaseClient,
  _userId: string,
  body: {
    workspace_id: string;
    marketplace: string;
    category_ref?: string;
    sale_price: number;
    quantity: number;
    inputs: Partial<SimulationInput>;
    target_margin?: number;
  }
) {
  const { workspace_id, marketplace, category_ref, sale_price, quantity, inputs, target_margin } = body;
  
  // Calculate
  const defaultInputs: SimulationInput = {
    cost_product: 0,
    cost_packaging: 0,
    cost_extra: 0,
    cost_source: 'manual',
    weight_kg: null,
    height_cm: null,
    width_cm: null,
    length_cm: null,
    dimensions_source: 'manual',
    shipping_mode: 'manual',
    shipping_charged_to_customer: 0,
    shipping_cost_estimated: 0,
    freight_ruleset_id: null,
    freight_profile: 'B',
    logistic_type: 'ME2',
    fee_mode: 'manual',
    fee_percent: 16.5,
    fee_fixed: 6,
    fee_ruleset_id: null,
    tax_mode: 'none',
    tax_percent: 0,
    discount_value: 0,
    discount_percent: 0,
    listing_type: 'gold_pro',
    channel_params: {},
    ...inputs,
  };
  
  const result = calculatePricing(sale_price, quantity, defaultInputs, target_margin);
  
  // Validate
  const validation = await validateAgainstRules(
    supabase,
    workspace_id,
    marketplace,
    category_ref || null,
    result
  );
  
  return respond({
    result,
    validation,
    warnings: result.flags.includes('margin_negative') 
      ? ['Atenção: margem negativa detectada'] 
      : [],
  });
}
