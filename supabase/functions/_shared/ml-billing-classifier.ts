/**
 * Unified ML Billing Charge Classifier — SINGLE SOURCE OF TRUTH
 * 
 * Hybrid logic: handles both legacy (pre-March 2026) and new ML billing formats.
 * 
 * New ML format (post-2026-03-04) splits fees into:
 * - "Custo por vender no Mercado Livre" (sale fee)
 * - "Custo por cobrar no Mercado Pago" (payment processing fee)
 * - "Custo de gestão da venda" (management fee)
 * - "Tarifa de venda total" (total sale fee)
 * All of the above are "commission" for our purposes.
 * 
 * Legacy format used: marketplace_fee in payments[], sale_fee_amount, etc.
 */

export type BillingCategory =
  | 'commission'
  | 'shipping'
  | 'installments'
  | 'adjustments'
  | 'storage'
  | 'ads'
  | 'unknown';

/**
 * Classify a billing charge type string into a category.
 * Accepts charge_type, transaction_detail, concept_type, or any descriptive label.
 */
export function classifyBillingCharge(chargeType: string): BillingCategory {
  const ct = (chargeType || '').toLowerCase().trim();
  if (!ct) return 'unknown';

  // ---- Adjustments / Cancellations / Refunds (check FIRST — "cancelamento" overrides other keywords) ----
  if (
    ct.includes('cancelamento') ||
    ct.includes('estorno') ||
    ct.includes('reembolso') ||
    ct.includes('bonificação') ||
    ct.includes('bonificacion') ||
    ct.includes('ajuste') ||
    ct.includes('adjustment') ||
    ct.includes('refund') ||
    ct.includes('chargeback') ||
    ct.includes('devolução') ||
    ct.includes('devolucion')
  ) {
    return 'adjustments';
  }

  // ---- Commission / Sale fees (both legacy and new format) ----
  if (
    // New ML format (post-2026-03-04)
    ct.includes('custo por vender') ||
    ct.includes('custo por cobrar') ||       // NEW: payment processing fee
    ct.includes('custo de gestão') ||         // NEW: management fee
    ct.includes('tarifa de venda') ||         // NEW: total sale fee
    // Legacy format
    ct.includes('cargo por venta') ||
    ct.includes('cargo por cobrar') ||
    ct.includes('costo de gestión') ||
    ct.includes('tarifa de venta') ||
    ct.includes('sale_fee') ||
    ct === 'sale_fee_amount' ||
    ct.includes('comisión') ||
    ct.includes('comissão') ||
    ct.includes('commission') ||
    // Generic fee patterns
    ct.includes('marketplace_fee') ||
    ct.includes('fixed_fee')
  ) {
    return 'commission';
  }

  // ---- Shipping ----
  if (
    ct.includes('tarifa de envio') ||
    ct.includes('envio extra') ||
    ct.includes('envio intermunicipal') ||
    ct.includes('envio interno') ||
    ct.includes('mercado envíos') ||
    ct.includes('mercado envios') ||
    ct.includes('shipping') ||
    ct === 'shipping_fee' ||
    ct.includes('frete') ||
    ct.includes('costo de envío') ||
    ct.includes('costo de envio')
  ) {
    return 'shipping';
  }

  // ---- Installments ----
  if (
    ct.includes('taxa de parcelamento') ||
    ct.includes('parcelamento') ||
    ct.includes('cuota') ||
    ct.includes('installment') ||
    ct.includes('financiamento') ||
    ct.includes('financiamiento')
  ) {
    return 'installments';
  }

  // ---- Storage (ignore in cost calc) ----
  if (
    ct.includes('armazenamento') ||
    ct.includes('almacenamiento') ||
    ct.includes('full') ||
    ct.includes('storage')
  ) {
    return 'storage';
  }

  // ---- Ads (ignore in cost calc) ----
  if (
    ct.includes('publicidade') ||
    ct.includes('publicidad') ||
    ct.includes('product ads') ||
    ct.includes('ads')
  ) {
    return 'ads';
  }

  return 'unknown';
}

/**
 * Process a billing charge into an accumulator object.
 * Handles signed amounts properly.
 */
export function processChargeIntoAccumulator(
  entry: { fee_ml: number; shipping: number; installments: number; adjustments: number },
  chargeType: string,
  amount: number,
): void {
  const category = classifyBillingCharge(chargeType);
  switch (category) {
    case 'commission':
      entry.fee_ml += amount;
      break;
    case 'shipping':
      entry.shipping += amount;
      break;
    case 'installments':
      entry.installments += amount;
      break;
    case 'adjustments':
      entry.adjustments += amount;
      break;
    case 'unknown':
      // Positive unknown amounts → treat as fee (conservative)
      if (amount > 0) entry.fee_ml += amount;
      break;
    // storage, ads → ignored in cost calculations
  }
}

/**
 * Determine if an order date falls under the new ML billing format.
 * ML changed billing structure around 2026-03-04.
 */
export const NEW_ML_BILLING_CUTOFF = '2026-03-04T00:00:00Z';

export function isNewMlBillingFormat(orderDateStr: string | null): boolean {
  if (!orderDateStr) return true; // default to new format for safety
  return new Date(orderDateStr) >= new Date(NEW_ML_BILLING_CUTOFF);
}
