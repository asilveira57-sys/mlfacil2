import { supabase } from '@/integrations/supabase/client';

// Default preferences when seller has no custom configuration
const DEFAULT_PREFERENCES = {
  show_customer: true,
  show_products: true,
  show_order_id: true,
  show_shipment_id: false,
  show_comment: true,
  show_sku: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 3,
  max_total_lines: 6,
  font_size: 9,
};

export interface HeaderPreferences {
  show_customer: boolean;
  show_products: boolean;
  show_order_id: boolean;
  show_shipment_id: boolean;
  show_comment: boolean;
  show_sku: boolean;
  line_order: string[];
  max_product_lines: number;
  max_total_lines: number;
  font_size: number;
}

export interface OrderData {
  order_id: string;
  pack_id?: string | null;
  shipment_id: string | null;
  buyer_name: string | null;
  order_comment: string | null;
}

export interface OrderItem {
  sku: string | null;
  title_short: string | null;
  title: string | null;
  quantity: number;
}

export interface HeaderLines {
  lines: string[];
  rawText: string;
  preferences: HeaderPreferences;
}

/**
 * Truncates a string to maxLength, adding ellipsis if truncated
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitizes text: removes line breaks, trims whitespace, limits length
 */
function sanitize(text: string | null | undefined, maxLength = 90): string {
  if (!text) return '';
  return truncate(
    text
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    maxLength
  );
}

/**
 * Builds product lines from order items.
 * Each item gets its own line: "Nx [SKU] Title"
 * If items exceed maxProductLines, last line shows "+N itens"
 */
function buildProductLines(
  items: OrderItem[],
  maxProductLines: number,
  showSku: boolean,
  maxLineLength = 72
): string[] {
  if (items.length === 0) return [];

  // Sort by quantity desc, then by display text
  const sortedItems = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    const textA = a.sku || a.title_short || a.title || '';
    const textB = b.sku || b.title_short || b.title || '';
    return textA.localeCompare(textB);
  });

  // Format each item: "Nx [SKU] Title" or "Nx Title"
  const formattedItems = sortedItems.map(item => {
    const skuPart = showSku && item.sku ? `[${item.sku}] ` : '';
    const displayText = item.title_short || item.title || item.sku || 'Item';
    // Reserve space for qty prefix + SKU bracket, truncate title to fit
    const prefix = `${item.quantity}x ${skuPart}`;
    const maxTitleLen = maxLineLength - prefix.length;
    const truncatedTitle = truncate(displayText, Math.max(maxTitleLen, 15));
    return `${prefix}${truncatedTitle}`;
  });

  const lines: string[] = [];

  for (let i = 0; i < formattedItems.length; i++) {
    if (lines.length >= maxProductLines) {
      // Add "+N itens" to last line
      const remaining = formattedItems.length - i;
      if (remaining > 0 && lines.length > 0) {
        const suffix = ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
        const lastLine = lines[lines.length - 1];
        if (lastLine.length + suffix.length <= maxLineLength) {
          lines[lines.length - 1] = lastLine + suffix;
        } else {
          lines[lines.length - 1] = truncate(lastLine, maxLineLength - suffix.length) + suffix;
        }
      }
      break;
    }

    if (lines.length === maxProductLines - 1 && i < formattedItems.length - 1) {
      // Last allowed line but more items remain
      const remaining = formattedItems.length - i - 1;
      const suffix = remaining > 0 ? ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}` : '';
      const line = formattedItems[i];
      if (line.length + suffix.length <= maxLineLength) {
        lines.push(line + suffix);
      } else {
        lines.push(truncate(line, maxLineLength - suffix.length) + suffix);
      }
      break;
    }

    lines.push(truncate(formattedItems[i], maxLineLength));
  }

  return lines;
}

/**
 * Builds header lines for a shipping label based on order data and seller preferences.
 * Customer line is ALWAYS first, regardless of line_order configuration.
 */
export async function buildHeaderLines(
  sellerId: string,
  order: OrderData,
  items: OrderItem[]
): Promise<HeaderLines> {
  // Step 1: Load seller preferences (or use defaults)
  const { data: prefData } = await supabase
    .from('meli_label_header_preferences')
    .select('*')
    .eq('seller_id', sellerId)
    .maybeSingle();

  const prefs: HeaderPreferences = prefData
    ? {
        show_customer: prefData.show_customer,
        show_products: prefData.show_products,
        show_order_id: prefData.show_order_id,
        show_shipment_id: prefData.show_shipment_id,
        show_comment: prefData.show_comment,
        show_sku: prefData.show_sku ?? true,
        line_order: prefData.line_order as string[],
        max_product_lines: prefData.max_product_lines,
        max_total_lines: prefData.max_total_lines,
        font_size: prefData.font_size,
      }
    : DEFAULT_PREFERENCES;

  // Step 2: Build content for each line type
  const lineContents: Record<string, string[]> = {
    customer: [],
    products: [],
    order: [],
    shipment: [],
    comment: [],
  };

  // Customer line
  if (prefs.show_customer && order.buyer_name) {
    lineContents.customer = [`Cliente: ${sanitize(order.buyer_name, 40)}`];
  }

  // Products lines — one per item with SKU
  if (prefs.show_products && items.length > 0) {
    lineContents.products = buildProductLines(items, prefs.max_product_lines, prefs.show_sku);
  }

  // Order ID line (use pack_id if available, fallback to order_id)
  if (prefs.show_order_id) {
    lineContents.order = [`Pedido: ${order.pack_id || order.order_id}`];
  }

  // Shipment ID line
  if (prefs.show_shipment_id && order.shipment_id) {
    lineContents.shipment = [`Envio: ${order.shipment_id}`];
  }

  // Comment line
  if (prefs.show_comment && order.order_comment) {
    const cleanComment = sanitize(order.order_comment, 60);
    if (cleanComment) {
      lineContents.comment = [`Obs: ${cleanComment}`];
    }
  }

  // Step 3: Assemble lines — customer ALWAYS first, then remaining in configured order
  const allLines: string[] = [];

  // Force customer first
  if (lineContents.customer.length > 0) {
    for (const line of lineContents.customer) {
      if (allLines.length >= prefs.max_total_lines) break;
      allLines.push(line);
    }
  }

  // Then remaining sections in configured order (skip customer since already added)
  for (const lineType of prefs.line_order) {
    if (lineType === 'customer') continue; // already added first
    const content = lineContents[lineType] || [];
    for (const line of content) {
      if (allLines.length >= prefs.max_total_lines) break;
      allLines.push(line);
    }
    if (allLines.length >= prefs.max_total_lines) break;
  }

  // Step 4: Build raw text for storage (newline-separated)
  const rawText = allLines.join('\n');

  return {
    lines: allLines,
    rawText,
    preferences: prefs,
  };
}

/**
 * Builds header for an order using cached data from the database.
 */
export async function buildHeaderLinesFromCache(
  sellerId: string,
  orderId: string
): Promise<HeaderLines | null> {
  const { data: orderData, error: orderError } = await supabase
    .from('meli_orders_cache')
    .select('order_id, pack_id, shipment_id, buyer_name, order_comment')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId)
    .maybeSingle();

  if (orderError || !orderData) {
    console.error('Error loading order for header:', orderError);
    return null;
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from('meli_order_items_cache')
    .select('sku, title_short, title, quantity')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  if (itemsError) {
    console.error('Error loading items for header:', itemsError);
  }

  const order: OrderData = {
    order_id: orderData.order_id,
    pack_id: orderData.pack_id,
    shipment_id: orderData.shipment_id,
    buyer_name: orderData.buyer_name,
    order_comment: orderData.order_comment,
  };

  const items: OrderItem[] = (itemsData || []).map(item => ({
    sku: item.sku,
    title_short: item.title_short,
    title: item.title,
    quantity: item.quantity,
  }));

  return buildHeaderLines(sellerId, order, items);
}

/**
 * Updates the internal_header field in meli_orders_cache for an order.
 */
export async function saveHeaderToCache(
  sellerId: string,
  orderId: string,
  headerText: string
): Promise<boolean> {
  const { error } = await supabase
    .from('meli_orders_cache')
    .update({ internal_header: headerText })
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  if (error) {
    console.error('Error saving header to cache:', error);
    return false;
  }

  return true;
}

/**
 * Builds and saves header for an order in one operation.
 */
export async function buildAndSaveHeader(
  sellerId: string,
  orderId: string
): Promise<HeaderLines | null> {
  const header = await buildHeaderLinesFromCache(sellerId, orderId);
  
  if (header) {
    await saveHeaderToCache(sellerId, orderId, header.rawText);
  }
  
  return header;
}
