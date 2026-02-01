/**
 * Pricing Engine Client
 * 
 * Client-side service for interacting with the pricing-engine edge function.
 * Provides typed methods for all pricing operations.
 */

import { invokeEdgeFunction, EdgeFunctionResult } from './edgeFunctionClient';

// ============================================================================
// Types
// ============================================================================

export interface PricingSimulation {
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  status: 'DRAFT' | 'SAVED' | 'APPROVED' | 'ARCHIVED';
  title: string;
  marketplace: string;
  currency: string;
  product_ref_type: 'PRODUCT' | 'VARIANT' | 'MANUAL_ITEM' | 'ML_ITEM';
  product_ref_id: string | null;
  ml_item_id: string | null;
  quantity: number;
  sale_price: number;
  target_margin: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingSimulationInput {
  id: string;
  simulation_id: string;
  version: number;
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
  created_at: string;
}

export interface PricingSimulationResult {
  id: string;
  simulation_id: string;
  inputs_id: string;
  version: number;
  gross_revenue: number;
  net_revenue: number;
  total_cost: number;
  cost_breakdown: {
    product: number;
    packaging: number;
    extra: number;
    shipping: number;
  };
  marketplace_fees_total: number;
  taxes_total: number;
  fees_breakdown: {
    marketplace_percent: number;
    marketplace_fixed: number;
    marketplace_total: number;
  };
  profit_value: number;
  profit_total: number;
  margin_percent: number;
  margin_after_shipping: number;
  markup_percent: number;
  breakeven_price: number;
  min_price_for_target: number | null;
  flags: string[];
  calculated_at: string;
  created_at: string;
}

export interface PricingValidationRule {
  id: string;
  workspace_id: string;
  scope: 'GLOBAL' | 'MARKETPLACE' | 'CATEGORY';
  marketplace: string | null;
  category_ref: string | null;
  min_margin_percent: number;
  warning_margin_percent: number;
  min_profit_value: number | null;
  allow_negative_margin: boolean;
  is_active: boolean;
}

export interface PricingSimulationEvent {
  id: string;
  simulation_id: string;
  workspace_id: string;
  actor_user_id: string;
  event_type: 'CREATED' | 'RECALCULATED' | 'SAVED' | 'APPROVED' | 'DUPLICATED' | 'ARCHIVED' | 'UPDATED';
  event_payload: Record<string, unknown>;
  margin_at_event: number | null;
  profit_at_event: number | null;
  created_at: string;
}

export interface CreateSimulationParams {
  workspace_id: string;
  title?: string;
  marketplace?: string;
  product_ref_type?: 'PRODUCT' | 'VARIANT' | 'MANUAL_ITEM' | 'ML_ITEM';
  product_ref_id?: string;
  ml_item_id?: string;
  sale_price: number;
  target_margin?: number;
  quantity?: number;
  inputs?: Partial<PricingSimulationInput>;
}

export interface RecalculateParams {
  simulation_id: string;
  sale_price?: number;
  quantity?: number;
  target_margin?: number;
  inputs?: Partial<PricingSimulationInput>;
}

export interface ListSimulationsParams {
  workspace_id: string;
  status?: 'DRAFT' | 'SAVED' | 'APPROVED' | 'ARCHIVED';
  marketplace?: string;
  product_ref_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ValidateParams {
  workspace_id: string;
  marketplace: string;
  category_ref?: string;
  sale_price: number;
  quantity: number;
  inputs: Partial<PricingSimulationInput>;
  target_margin?: number;
}

// Response types
interface CreateResponse {
  simulation: PricingSimulation;
  inputs: PricingSimulationInput;
  result: PricingSimulationResult;
}

interface ListResponse {
  simulations: (PricingSimulation & { latest_result: PricingSimulationResult | null })[];
  total: number;
  limit: number;
  offset: number;
}

interface DetailsResponse {
  simulation: PricingSimulation;
  latest_inputs: PricingSimulationInput | null;
  latest_result: PricingSimulationResult | null;
  inputs_history: PricingSimulationInput[];
  results_history: PricingSimulationResult[];
  events: PricingSimulationEvent[];
  validation_rules: PricingValidationRule[];
}

interface ValidationResponse {
  result: Omit<PricingSimulationResult, 'id' | 'simulation_id' | 'inputs_id' | 'version' | 'calculated_at' | 'created_at'>;
  validation: {
    valid: boolean;
    rule: PricingValidationRule | null;
    violations: string[];
  };
  warnings: string[];
}

interface ApproveResponse {
  simulation: PricingSimulation;
  validation: {
    valid: boolean;
    rule: PricingValidationRule | null;
    violations: string[];
  };
}

// ============================================================================
// API Client
// ============================================================================

const FUNCTION_NAME = 'pricing-engine';

/**
 * Create a new pricing simulation
 */
export async function createSimulation(
  params: CreateSimulationParams
): Promise<EdgeFunctionResult<CreateResponse>> {
  return invokeEdgeFunction<CreateResponse>(`${FUNCTION_NAME}/create`, {
    body: params as unknown as Record<string, unknown>,
  });
}

/**
 * Recalculate an existing simulation
 */
export async function recalculateSimulation(
  params: RecalculateParams
): Promise<EdgeFunctionResult<CreateResponse>> {
  return invokeEdgeFunction<CreateResponse>(`${FUNCTION_NAME}/recalculate`, {
    body: params as unknown as Record<string, unknown>,
  });
}

/**
 * Save a simulation (change status to SAVED)
 */
export async function saveSimulation(
  simulationId: string,
  options?: { title?: string; notes?: string }
): Promise<EdgeFunctionResult<{ simulation: PricingSimulation }>> {
  return invokeEdgeFunction<{ simulation: PricingSimulation }>(`${FUNCTION_NAME}/save`, {
    body: {
      simulation_id: simulationId,
      ...options,
    },
  });
}

/**
 * Approve a simulation (validates against workspace rules)
 */
export async function approveSimulation(
  simulationId: string,
  force = false
): Promise<EdgeFunctionResult<ApproveResponse>> {
  return invokeEdgeFunction<ApproveResponse>(`${FUNCTION_NAME}/approve`, {
    body: {
      simulation_id: simulationId,
      force,
    },
  });
}

/**
 * Duplicate a simulation
 */
export async function duplicateSimulation(
  simulationId: string,
  title?: string
): Promise<EdgeFunctionResult<CreateResponse>> {
  return invokeEdgeFunction<CreateResponse>(`${FUNCTION_NAME}/duplicate`, {
    body: {
      simulation_id: simulationId,
      title,
    },
  });
}

/**
 * Archive a simulation
 */
export async function archiveSimulation(
  simulationId: string
): Promise<EdgeFunctionResult<{ simulation: PricingSimulation }>> {
  return invokeEdgeFunction<{ simulation: PricingSimulation }>(`${FUNCTION_NAME}/archive`, {
    body: { simulation_id: simulationId },
  });
}

/**
 * List simulations with filters
 */
export async function listSimulations(
  params: ListSimulationsParams
): Promise<EdgeFunctionResult<ListResponse>> {
  const searchParams = new URLSearchParams();
  searchParams.set('workspace_id', params.workspace_id);
  
  if (params.status) searchParams.set('status', params.status);
  if (params.marketplace) searchParams.set('marketplace', params.marketplace);
  if (params.product_ref_id) searchParams.set('product_ref_id', params.product_ref_id);
  if (params.search) searchParams.set('search', params.search);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());
  
  return invokeEdgeFunction<ListResponse>(`${FUNCTION_NAME}/list?${searchParams.toString()}`);
}

/**
 * Get simulation details with full history
 */
export async function getSimulationDetails(
  simulationId: string
): Promise<EdgeFunctionResult<DetailsResponse>> {
  return invokeEdgeFunction<DetailsResponse>(
    `${FUNCTION_NAME}/details?simulation_id=${simulationId}`
  );
}

/**
 * Validate pricing without creating a simulation
 */
export async function validatePricing(
  params: ValidateParams
): Promise<EdgeFunctionResult<ValidationResponse>> {
  return invokeEdgeFunction<ValidationResponse>(`${FUNCTION_NAME}/validate`, {
    body: params as unknown as Record<string, unknown>,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get flag labels in Portuguese
 */
export function getFlagLabel(flag: string): string {
  const labels: Record<string, string> = {
    missing_cost: 'Custo do produto não informado',
    missing_dims: 'Dimensões não informadas',
    margin_negative: 'Margem negativa',
    margin_below_min: 'Margem abaixo do mínimo',
    shipping_out_of_table: 'Frete fora da tabela',
    shipping_manual_zero: 'Frete manual zerado',
    cost_incomplete: 'Custos incompletos',
  };
  return labels[flag] || flag;
}

/**
 * Get status label in Portuguese
 */
export function getStatusLabel(status: PricingSimulation['status']): string {
  const labels: Record<string, string> = {
    DRAFT: 'Rascunho',
    SAVED: 'Salva',
    APPROVED: 'Aprovada',
    ARCHIVED: 'Arquivada',
  };
  return labels[status] || status;
}

/**
 * Get status color class
 */
export function getStatusColor(status: PricingSimulation['status']): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-muted text-muted-foreground',
    SAVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    ARCHIVED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  };
  return colors[status] || '';
}

/**
 * Format currency
 */
export function formatCurrency(value: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Get margin color based on value and rules
 */
export function getMarginColor(
  margin: number,
  minMargin = 10,
  warningMargin = 15
): 'destructive' | 'warning' | 'success' {
  if (margin < 0) return 'destructive';
  if (margin < minMargin) return 'destructive';
  if (margin < warningMargin) return 'warning';
  return 'success';
}

// ============================================================================
// Default ML Fee Presets
// ============================================================================

export const ML_FEE_PRESETS = {
  gold_pro: { percent: 16.5, fixed: 6, label: 'Premium (Gold Pro)' },
  gold_special: { percent: 14, fixed: 5, label: 'Clássico (Gold Special)' },
  gold: { percent: 12, fixed: 4, label: 'Grátis (Gold)' },
} as const;

export const LOGISTIC_TYPES = [
  { value: 'ME1', label: 'Mercado Envios 1 (Correios)' },
  { value: 'ME2', label: 'Mercado Envios 2' },
  { value: 'FLEX', label: 'Flex' },
  { value: 'FULL', label: 'Full' },
  { value: 'DROP_OFF', label: 'Drop Off' },
  { value: 'COLETA', label: 'Coleta' },
] as const;

export const LISTING_TYPES = [
  { value: 'gold_pro', label: 'Premium' },
  { value: 'gold_special', label: 'Clássico' },
  { value: 'gold', label: 'Grátis' },
] as const;
