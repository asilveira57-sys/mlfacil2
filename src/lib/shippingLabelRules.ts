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
 * Determine if a single order requires NF for a given layout.
 * Rules:
 * - Flex (self_service): never requires NF → all layouts allowed
 * - Fulfillment: blocked entirely (seller doesn't print)
 * - Coleta/Cross-docking (any other logistic_type):
 *   - 'mlfacil_100x175_header': requires NF (header pipeline needs DANFE page)
 *   - 'meli_100x150': does NOT require NF (ML API handles available pages)
 *   - 'meli_100x150_no_nf': does NOT require NF (etiqueta com cabeçalho, sem DANFE)
 *   - ZPL: does NOT require NF (label-only)
 */
function orderNeedsNf(order: ShippingOrder, layout: LabelLayout, format: LabelFormat): boolean {
  const isFlex = order.logistic_type === 'self_service';
  if (isFlex) return false;

  // Only the header layout strictly needs DANFE
  return layout === 'mlfacil_100x175_header' && format === 'pdf';
}

function orderHasNf(order: ShippingOrder): boolean {
  return order.invoice_status === 'emitida';
}

function orderIsFlex(order: ShippingOrder): boolean {
  return order.logistic_type === 'self_service';
}

function orderIsFull(order: ShippingOrder): boolean {
  return order.logistic_type === 'fulfillment';
}

/**
 * Compute layout capabilities for a batch of selected orders.
 * Returns which layouts are available and why others are blocked.
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

  // Check which orders block NF-dependent layouts (only header layout needs NF)
  const ordersBlockingHeaderLayout = selectedOrders.filter(o => !orderIsFlex(o) && !orderHasNf(o));
  const hasHeaderBlockers = ordersBlockingHeaderLayout.length > 0;

  return {
    canStandardPdf: { enabled: true }, // ML API handles pages; no NF needed
    canHeaderPdf: hasHeaderBlockers
      ? { enabled: false, reason: 'requer NF' }
      : { enabled: true },
    canNoNfPdf: { enabled: true },
    canZplStandard: { enabled: true },
    canZplHeader: { enabled: true },
  };
}

/**
 * For single-order reprint: determine the best layout to use.
 */
export function getReprintLayout(order: ShippingOrder, format: LabelFormat): LabelLayout {
  if (format === 'zpl') return 'meli_100x150';
  // PDF: if order doesn't have NF and is not Flex, use the header-without-DANFE layout
  if (!orderHasNf(order) && !orderIsFlex(order)) return 'meli_100x150_no_nf';
  return 'meli_100x150';
}

/**
 * Check if a single order can be reprinted in the given format.
 */
export function canReprintOrder(order: ShippingOrder, format: LabelFormat): boolean {
  if (!order.label_available || !order.shipment_id) return false;
  if (orderIsFull(order)) return false;
  // ZPL and label-only PDF always work; standard PDF needs NF or Flex
  return true;
}
