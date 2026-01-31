/**
 * FreightEngine - Motor de Cálculo de Frete Central
 * 
 * Serviço reutilizável para cálculo de frete esperado,
 * consumido por: Precificação, Produtos, Atualização em massa, Validação de Vendas
 */

export interface FreightRuleset {
  id: string;
  name: string;
  marketplace: string;
  country: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
  description: string | null;
}

export interface FreightRuleLine {
  id: string;
  ruleset_id: string;
  logistic_mode: string;
  ad_type: string;
  price_band_min: number;
  price_band_max: number | null;
  weight_min: number;
  weight_max: number | null;
  dimensions_limit_policy: string | null;
  dimensions_limit_value: number | null;
  seller_pays_value: number;
  seller_pays_formula: string | null;
  subsidy_type: 'none' | 'partial' | 'full';
  subsidy_value: number;
  is_free_shipping: boolean;
  notes: string | null;
  sort_order: number;
}

export interface ProductDimensions {
  weight_kg: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  freight_profile: 'A' | 'B' | 'C';
  dimensions_source: 'none' | 'api' | 'manual' | 'estimated';
}

export interface FreightContext {
  ruleset: FreightRuleset;
  ruleLines: FreightRuleLine[];
  logistic_mode: string;
  ad_type: 'classic' | 'premium';
  item_price: number;
  category_id?: string;
  is_promo?: boolean;
}

export interface FreightCalculationResult {
  expected_shipping_cost: number;
  expected_shipping_subsidy: number;
  matched_rule: FreightRuleLine | null;
  reason: string;
  is_free_for_buyer: boolean;
  calculation_details: {
    weight_used: number;
    dimensions_sum: number | null;
    price_band: string;
    matched_by: string;
  };
}

// Profile weight/dimension estimates when actual values are missing
const PROFILE_ESTIMATES = {
  A: { weight_kg: 0.3, dimensions_sum: 40 },
  B: { weight_kg: 2, dimensions_sum: 100 },
  C: { weight_kg: 10, dimensions_sum: 200 },
};

/**
 * Calculate dimensions sum (soma dos lados)
 */
function calculateDimensionsSum(product: ProductDimensions): number | null {
  if (product.height_cm && product.width_cm && product.length_cm) {
    return product.height_cm + product.width_cm + product.length_cm;
  }
  return null;
}

/**
 * Get effective weight for calculation
 * Uses actual weight or profile estimate as fallback
 */
function getEffectiveWeight(product: ProductDimensions): number {
  if (product.weight_kg && product.weight_kg > 0) {
    return product.weight_kg;
  }
  return PROFILE_ESTIMATES[product.freight_profile || 'B'].weight_kg;
}

/**
 * Get effective dimensions sum
 */
function getEffectiveDimensionsSum(product: ProductDimensions): number {
  const calculated = calculateDimensionsSum(product);
  if (calculated !== null) {
    return calculated;
  }
  return PROFILE_ESTIMATES[product.freight_profile || 'B'].dimensions_sum;
}

/**
 * Check if product matches a rule line's weight criteria
 */
function matchesWeight(rule: FreightRuleLine, weight: number): boolean {
  if (weight < rule.weight_min) return false;
  if (rule.weight_max !== null && weight > rule.weight_max) return false;
  return true;
}

/**
 * Check if price matches a rule line's price band
 */
function matchesPriceBand(rule: FreightRuleLine, price: number): boolean {
  if (price < rule.price_band_min) return false;
  if (rule.price_band_max !== null && price > rule.price_band_max) return false;
  return true;
}

/**
 * Check if dimensions match a rule line's dimension policy
 */
function matchesDimensions(rule: FreightRuleLine, dimensionsSum: number): boolean {
  if (!rule.dimensions_limit_policy || !rule.dimensions_limit_value) {
    return true; // No dimension limit
  }
  
  if (rule.dimensions_limit_policy === 'soma_lados') {
    return dimensionsSum <= rule.dimensions_limit_value;
  }
  
  // Add other policies as needed (cubicagem, maior_lado)
  return true;
}

/**
 * Calculate seller payment using formula if available
 */
function calculateSellerPayment(rule: FreightRuleLine, weight: number): number {
  if (rule.seller_pays_formula) {
    // Simple formula parser: supports {weight} placeholder
    try {
      const formula = rule.seller_pays_formula.replace('{weight}', weight.toString());
      // eslint-disable-next-line no-eval
      return eval(formula);
    } catch {
      return rule.seller_pays_value;
    }
  }
  return rule.seller_pays_value;
}

/**
 * Main calculation function
 */
export function calculateFreight(
  product: ProductDimensions,
  context: FreightContext
): FreightCalculationResult {
  const weight = getEffectiveWeight(product);
  const dimensionsSum = getEffectiveDimensionsSum(product);
  
  // Filter rules by logistic mode and ad type
  const applicableRules = context.ruleLines
    .filter(r => 
      r.logistic_mode === context.logistic_mode && 
      r.ad_type === context.ad_type
    )
    .sort((a, b) => a.sort_order - b.sort_order);
  
  if (applicableRules.length === 0) {
    return {
      expected_shipping_cost: 0,
      expected_shipping_subsidy: 0,
      matched_rule: null,
      reason: `Nenhuma regra encontrada para ${context.logistic_mode}/${context.ad_type}`,
      is_free_for_buyer: false,
      calculation_details: {
        weight_used: weight,
        dimensions_sum: dimensionsSum,
        price_band: `R$ ${context.item_price}`,
        matched_by: 'none',
      },
    };
  }
  
  // Find matching rule
  for (const rule of applicableRules) {
    const weightMatch = matchesWeight(rule, weight);
    const priceMatch = matchesPriceBand(rule, context.item_price);
    const dimensionsMatch = matchesDimensions(rule, dimensionsSum);
    
    if (weightMatch && priceMatch && dimensionsMatch) {
      const sellerPays = calculateSellerPayment(rule, weight);
      let subsidy = 0;
      
      if (rule.subsidy_type === 'full') {
        subsidy = sellerPays;
      } else if (rule.subsidy_type === 'partial') {
        subsidy = rule.subsidy_value;
      }
      
      const finalCost = Math.max(0, sellerPays - subsidy);
      
      return {
        expected_shipping_cost: finalCost,
        expected_shipping_subsidy: subsidy,
        matched_rule: rule,
        reason: `Regra: ${rule.notes || `Peso ${rule.weight_min}-${rule.weight_max || '∞'}kg, Preço ${rule.price_band_min}-${rule.price_band_max || '∞'}`}`,
        is_free_for_buyer: rule.is_free_shipping,
        calculation_details: {
          weight_used: weight,
          dimensions_sum: dimensionsSum,
          price_band: `R$ ${rule.price_band_min} - ${rule.price_band_max || '∞'}`,
          matched_by: 'weight+price+dimensions',
        },
      };
    }
  }
  
  // No matching rule found
  return {
    expected_shipping_cost: 0,
    expected_shipping_subsidy: 0,
    matched_rule: null,
    reason: `Produto fora das faixas de peso/preço/dimensão configuradas`,
    is_free_for_buyer: false,
    calculation_details: {
      weight_used: weight,
      dimensions_sum: dimensionsSum,
      price_band: `R$ ${context.item_price}`,
      matched_by: 'none',
    },
  };
}

/**
 * Determine freight profile based on weight and dimensions
 */
export function determineFreightProfile(
  product: ProductDimensions,
  settings: {
    profile_a_weight_max: number;
    profile_a_dimensions_sum: number;
    profile_b_weight_max: number;
    profile_b_dimensions_sum: number;
  }
): 'A' | 'B' | 'C' {
  const weight = product.weight_kg || 0;
  const dimensionsSum = calculateDimensionsSum(product) || 0;
  
  // Profile A: Small and light
  if (weight <= settings.profile_a_weight_max && dimensionsSum <= settings.profile_a_dimensions_sum) {
    return 'A';
  }
  
  // Profile B: Medium
  if (weight <= settings.profile_b_weight_max && dimensionsSum <= settings.profile_b_dimensions_sum) {
    return 'B';
  }
  
  // Profile C: Large and heavy
  return 'C';
}

/**
 * Validate shipping divergence
 */
export function validateShippingDivergence(
  charged: number,
  paid: number,
  expected: number,
  settings: {
    tolerance_value: number;
    tolerance_percent: number;
    comparison_mode: 'paid_vs_expected' | 'charged_vs_expected' | 'both';
  }
): {
  is_divergent: boolean;
  diff_value: number;
  diff_percent: number;
  comparison_used: string;
} {
  let valueToCompare: number;
  let comparisonUsed: string;
  
  if (settings.comparison_mode === 'paid_vs_expected') {
    valueToCompare = paid;
    comparisonUsed = 'Custo pago vs esperado';
  } else if (settings.comparison_mode === 'charged_vs_expected') {
    valueToCompare = charged;
    comparisonUsed = 'Receita cobrada vs esperada';
  } else {
    // 'both' - use the one with larger divergence
    const paidDiff = Math.abs(paid - expected);
    const chargedDiff = Math.abs(charged - expected);
    valueToCompare = paidDiff > chargedDiff ? paid : charged;
    comparisonUsed = paidDiff > chargedDiff ? 'Custo pago vs esperado' : 'Receita cobrada vs esperada';
  }
  
  const diffValue = valueToCompare - expected;
  const diffPercent = expected > 0 ? (diffValue / expected) * 100 : 0;
  
  const isDivergent = 
    Math.abs(diffValue) > settings.tolerance_value ||
    Math.abs(diffPercent) > settings.tolerance_percent;
  
  return {
    is_divergent: isDivergent,
    diff_value: diffValue,
    diff_percent: diffPercent,
    comparison_used: comparisonUsed,
  };
}

/**
 * Common logistic modes for Mercado Livre
 */
export const ML_LOGISTIC_MODES = [
  { value: 'ME1', label: 'Mercado Envios 1 (Correios)' },
  { value: 'ME2', label: 'Mercado Envios 2 (Próprio)' },
  { value: 'FLEX', label: 'Mercado Envios Flex' },
  { value: 'FULL', label: 'Mercado Envios Full' },
  { value: 'COLETA', label: 'Coleta em Agência' },
  { value: 'DROP_OFF', label: 'Drop Off' },
] as const;

/**
 * Ad types
 */
export const ML_AD_TYPES = [
  { value: 'classic', label: 'Clássico' },
  { value: 'premium', label: 'Premium' },
] as const;
