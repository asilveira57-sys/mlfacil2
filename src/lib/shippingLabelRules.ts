import { LabelLayout, ShippingOrder } from '@/hooks/useShippingLabels';

export type LabelFormat = 'pdf' | 'zpl';

export interface LayoutCapability {
  enabled: boolean;
  reason?: string;
}

export interface SelectionCapabilities {
  /** PDF Padrão ML (etiqueta + DANFE) */
  canStandardPdf: LayoutCapability;
  /** PDF Com Cabeçalho (etiqueta + cabeçalho + DANFE) */
  canHeaderPdf: LayoutCapability;
  /** PDF Somente Etiquetas de envio (com cabeçalho, sem DANFE) */
  canNoNfPdf: LayoutCapability;
  /** ZPL (sempre somente etiqueta) */
  canZplStandard: LayoutCapability;
  canZplHeader: LayoutCapability;
}

/**
 * Check if an order has NF ready.
 * Considers both the internal invoice cache AND marketplace substatus signals.
 * If the order is in "pronta" tab, the marketplace already confirmed fiscal readiness.
 */
function orderHasNf(order: ShippingOrder): boolean {
  if (order.invoice_status === 'emitida') return true;
  // Marketplace substatus signals that fiscal documentation is ready
  const readySubstatuses = ['ready_to_print', 'invoice_issued', 'invoice_validated', 'not_required', 'printed', 'ready_for_pickup', 'in_packing_list'];
  return readySubstatuses.includes(order.shipment_substatus || '');
}

function orderIsFlex(order: ShippingOrder): boolean {
  return order.logistic_type === 'self_service';
}

function orderIsFull(order: ShippingOrder): boolean {
  return order.logistic_type === 'fulfillment';
}

/**
 * Compute layout capabilities for a batch of selected orders.
 * 
 * Rules:
 * - Full: nothing allowed
 * - Coleta:
 *   - Padrão ML: always (label + DANFE if exists)
 *   - Só Etiqueta: always (header, ignore DANFE)
 *   - Cabeçalho + DANFE: only with NF ready
 * - Flex:
 *   - Padrão ML: always
 *   - Só Etiqueta: always
 *   - Cabeçalho + DANFE: always (falls back to header-only if no DANFE)
 * - Mixed (Coleta + Flex): each shipment follows its own rule.
 *   Blocked only if a Coleta order lacks NF for "Cabeçalho + DANFE".
 */
export function computeSelectionCapabilities(selectedOrders: ShippingOrder[]): SelectionCapabilities {
  if (selectedOrders.length === 0) {
    return {
      canStandardPdf: { enabled: true },
      canHeaderPdf: { enabled: true },
      canNoNfPdf: { enabled: true },
      canZplStandard: { enabled: true },
      canZplHeader: { enabled: true },
    };
  }

  const hasFull = selectedOrders.some(orderIsFull);
  if (hasFull) {
    const reason = 'Seleção contém pedidos Full (ML envia)';
    return {
      canStandardPdf: { enabled: false, reason },
      canHeaderPdf: { enabled: false, reason },
      canNoNfPdf: { enabled: false, reason },
      canZplStandard: { enabled: false, reason },
      canZplHeader: { enabled: false, reason },
    };
  }

  // "Cabeçalho + DANFE" is blocked only if there's a COLETA order without NF ready.
  // Flex orders NEVER block this option (backend falls back to header-only).
  const coletaWithoutNf = selectedOrders.filter(o => !orderIsFlex(o) && !orderHasNf(o));
  const hasColetaBlockers = coletaWithoutNf.length > 0;

  return {
    canStandardPdf: { enabled: true },
    canHeaderPdf: hasColetaBlockers
      ? { enabled: false, reason: `${coletaWithoutNf.length} pedido(s) coleta sem NF` }
      : { enabled: true },
    canNoNfPdf: { enabled: true },
    canZplStandard: { enabled: true },
    canZplHeader: { enabled: true },
  };
}

/**
 * For single-order reprint: determine which layouts are available.
 */
export interface ReprintOption {
  label: string;
  layout: LabelLayout;
  format: 'pdf' | 'zpl';
  enabled: boolean;
  reason?: string;
}

export function getReprintOptions(order: ShippingOrder): ReprintOption[] {
  const isFlex = orderIsFlex(order);
  const isFull = orderIsFull(order);
  const hasNf = orderHasNf(order);

  if (isFull || !order.label_available || !order.shipment_id) {
    return [];
  }

  // For Coleta: "Cabeçalho + DANFE" requires NF
  // For Flex: "Cabeçalho + DANFE" always enabled (fallback to header-only)
  const headerDanfeEnabled = isFlex || hasNf;
  const headerDanfeReason = !headerDanfeEnabled ? 'NF não emitida' : undefined;

  return [
    { label: 'Padrão ML', layout: 'meli_100x150', format: 'pdf', enabled: true },
    { label: 'Só a Etiqueta', layout: 'meli_100x150_no_nf', format: 'pdf', enabled: true },
    {
      label: 'Cabeçalho + DANFE',
      layout: 'mlfacil_100x175_header',
      format: 'pdf',
      enabled: headerDanfeEnabled,
      reason: headerDanfeReason,
    },
    { label: 'ZPL Padrão', layout: 'meli_100x150', format: 'zpl', enabled: true },
    { label: 'ZPL com Cabeçalho', layout: 'mlfacil_100x175_header', format: 'zpl', enabled: true },
  ];
}

/**
 * For single-order reprint: determine the best layout to use (legacy compat).
 */
export function getReprintLayout(order: ShippingOrder, format: LabelFormat): LabelLayout {
  if (format === 'zpl') return 'meli_100x150';
  return 'meli_100x150';
}

/**
 * Check if a single order can be reprinted in the given format.
 */
export function canReprintOrder(order: ShippingOrder, format: LabelFormat): boolean {
  if (!order.label_available || !order.shipment_id) return false;
  if (orderIsFull(order)) return false;
  return true;
}
