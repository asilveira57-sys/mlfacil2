/**
 * Unified eligibility rules for labelTest module.
 * Used by both frontend (button enable/disable) and referenced by backend validation.
 * NEVER import from shipping-labels or shippingLabelRules.ts.
 */

export type LabelTestLayout = 'meli_100x150' | 'meli_100x150_no_nf' | 'mlfacil_100x175_header';

export type EligibilityReasonCode =
  | 'eligible'
  | 'full'
  | 'sem_label_available'
  | 'nf_pendente'
  | 'shipment_nao_encontrado'
  | 'sem_shipment_id'
  | 'status_invalido';

export interface ShipmentEligibility {
  shipment_id: string;
  eligible: boolean;
  reason_code: EligibilityReasonCode;
  reason_message: string;
}

export interface SelectionDiagnostics {
  total_selected: number;
  total_valid: number;
  total_invalid: number;
  items: ShipmentEligibility[];
}

// Substatuses that indicate the order was already processed and can be reprinted
const REPRINT_SUBSTATUSES = new Set([
  'ready_to_print',
  'printed',
  'ready_for_pickup',
  'in_packing_list',
  'invoice_issued',
  'invoice_validated',
  'not_required',
]);

// Substatuses that indicate NF is ready (for layouts requiring DANFE)
const NF_READY_SUBSTATUSES = new Set([
  'ready_to_print',
  'invoice_issued',
  'invoice_validated',
  'not_required',
  'printed',
  'ready_for_pickup',
  'in_packing_list',
]);

export interface ShipmentData {
  shipment_id?: string | null;
  logistic_type?: string | null;
  label_available?: boolean | null;
  shipment_substatus?: string | null;
  shipment_status?: string | null;
  invoice_status?: string | null;
  final_status?: string | null;
}

/**
 * Check if a single shipment is eligible for label generation/reprint.
 * This is THE source of truth — used in front and back.
 */
export function checkShipmentEligibility(s: ShipmentData): ShipmentEligibility {
  const sid = s.shipment_id || 'unknown';

  if (!s.shipment_id) {
    return { shipment_id: sid, eligible: false, reason_code: 'sem_shipment_id', reason_message: 'Envio sem ID de shipment' };
  }

  if (s.logistic_type === 'fulfillment') {
    return { shipment_id: sid, eligible: false, reason_code: 'full', reason_message: 'Pedido Full (ML envia)' };
  }

  if (!s.label_available) {
    // Exception: reprint-eligible substatuses should still be allowed even if label_available is false/null
    const sub = s.shipment_substatus || '';
    if (REPRINT_SUBSTATUSES.has(sub)) {
      // Allow — reprint substatus overrides label_available flag
    } else {
      return { shipment_id: sid, eligible: false, reason_code: 'sem_label_available', reason_message: 'Etiqueta não disponível (aguardando ML)' };
    }
  }

  return { shipment_id: sid, eligible: true, reason_code: 'eligible', reason_message: 'Elegível' };
}

/**
 * Check if NF is ready for a shipment (used for DANFE-required layouts).
 */
export function hasNfReady(s: ShipmentData): boolean {
  if (s.invoice_status === 'emitida') return true;
  return NF_READY_SUBSTATUSES.has(s.shipment_substatus || '');
}

/**
 * Compute diagnostics for a batch of selected orders.
 */
export function computeSelectionDiagnostics(orders: ShipmentData[]): SelectionDiagnostics {
  const items = orders.map(o => checkShipmentEligibility(o));
  return {
    total_selected: orders.length,
    total_valid: items.filter(i => i.eligible).length,
    total_invalid: items.filter(i => !i.eligible).length,
    items,
  };
}

/**
 * Layout capabilities for the V2 bulk action bar.
 */
export interface LayoutCapabilityV2 {
  enabled: boolean;
  reason?: string;
}

export interface SelectionCapabilitiesV2 {
  canStandardPdf: LayoutCapabilityV2;
  canHeaderPdf: LayoutCapabilityV2;
  canNoNfPdf: LayoutCapabilityV2;
  canZplStandard: LayoutCapabilityV2;
  canZplHeader: LayoutCapabilityV2;
}

export function computeCapabilitiesV2(orders: ShipmentData[]): SelectionCapabilitiesV2 {
  if (orders.length === 0) {
    return {
      canStandardPdf: { enabled: true },
      canHeaderPdf: { enabled: true },
      canNoNfPdf: { enabled: true },
      canZplStandard: { enabled: true },
      canZplHeader: { enabled: true },
    };
  }

  const diagnostics = computeSelectionDiagnostics(orders);
  const eligibleOrders = orders.filter((_, i) => diagnostics.items[i].eligible);

  if (eligibleOrders.length === 0) {
    const reasons = [...new Set(diagnostics.items.map(i => i.reason_message))].join('; ');
    return {
      canStandardPdf: { enabled: false, reason: reasons },
      canHeaderPdf: { enabled: false, reason: reasons },
      canNoNfPdf: { enabled: false, reason: reasons },
      canZplStandard: { enabled: false, reason: reasons },
      canZplHeader: { enabled: false, reason: reasons },
    };
  }

  // "Cabeçalho + DANFE" requires NF for COLETA orders.
  // Flex (self_service) NUNCA bloqueia: o backend gera só a etiqueta (sem DANFE) automaticamente.
  const coletaWithoutNf = eligibleOrders.filter(o =>
    o.logistic_type !== 'self_service' && !hasNfReady(o)
  );

  return {
    canStandardPdf: { enabled: true },
    canHeaderPdf: coletaWithoutNf.length > 0
      ? { enabled: false, reason: `${coletaWithoutNf.length} pedido(s) coleta sem NF` }
      : { enabled: true },
    canNoNfPdf: { enabled: true },
    canZplStandard: { enabled: true },
    canZplHeader: { enabled: true },
  };
}
