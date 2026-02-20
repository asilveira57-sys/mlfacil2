import { supabase } from '@/integrations/supabase/client';

// Default preferences when seller has no custom configuration
const DEFAULT_PREFERENCES = {
  show_customer: true,
  show_products: true,
  show_order_id: true,
  show_shipment_id: false,
  show_comment: true,
  line_order: ['customer', 'products', 'order', 'comment'],
  max_product_lines: 3,
  max_total_lines: 6,
  font_size: 8,
};

export interface HeaderPreferences {
  show_customer: boolean;
  show_products: boolean;
  show_order_id: boolean;
  show_shipment_id: boolean;
  show_comment: boolean;
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
 * Builds product lines from order items
 * Returns array of lines, respecting maxProductLines limit
 * If items don't fit, last line ends with "+N itens"
 */
function buildProductLines(
  items: OrderItem[],
  maxProductLines: number,
  maxLineLength = 45
): string[] {
  if (items.length === 0) return [];

  // Sort by quantity desc, then by display text
  const sortedItems = [...items].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    const textA = a.sku || a.title_short || a.title || '';
    const textB = b.sku || b.title_short || b.title || '';
    return textA.localeCompare(textB);
  });

  // Format each item as "Nx SKU" or "Nx Title"
  const formattedItems = sortedItems.map(item => {
    const displayText = item.title_short || item.title || item.sku || 'Item';
    const truncatedText = truncate(displayText, 25); // SKU/title max 25 chars
    return `${item.quantity}x ${truncatedText}`;
  });

  const lines: string[] = [];
  let currentLine = '';
  let itemsPlaced = 0;

  for (let i = 0; i < formattedItems.length; i++) {
    const item = formattedItems[i];
    const separator = currentLine ? ' | ' : '';
    const potentialLine = currentLine + separator + item;

    // Check if we're at the line limit
    if (lines.length === maxProductLines - 1 && i < formattedItems.length - 1) {
      // This is the last allowed line and there are more items
      const remainingCount = formattedItems.length - itemsPlaced;
      
      // Try to fit current item + remaining count
      if (potentialLine.length + ` +${remainingCount - 1} itens`.length <= maxLineLength) {
        currentLine = potentialLine;
        itemsPlaced++;
        
        const remaining = formattedItems.length - itemsPlaced;
        if (remaining > 0) {
          currentLine += ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
        }
        lines.push(currentLine);
        break;
      } else {
        // Can't fit, finalize with remaining count
        if (currentLine) {
          const remaining = formattedItems.length - itemsPlaced;
          currentLine += ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
          lines.push(currentLine);
        } else {
          // Edge case: single item too long
          lines.push(truncate(item, maxLineLength - 10) + ` +${formattedItems.length - 1} itens`);
        }
        break;
      }
    }

    // Normal case: try to add to current line
    if (potentialLine.length <= maxLineLength) {
      currentLine = potentialLine;
      itemsPlaced++;
    } else {
      // Line is full, start new line
      if (currentLine) {
        lines.push(currentLine);
        currentLine = item;
        itemsPlaced++;
      } else {
        // Single item too long, truncate it
        lines.push(truncate(item, maxLineLength));
        itemsPlaced++;
        currentLine = '';
      }
    }

    // Check if we've used all allowed lines
    if (lines.length >= maxProductLines) {
      // Add remaining count to last line if there are more items
      const remaining = formattedItems.length - itemsPlaced;
      if (remaining > 0 && lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const suffix = ` +${remaining} ${remaining === 1 ? 'item' : 'itens'}`;
        if (lastLine.length + suffix.length <= maxLineLength) {
          lines[lines.length - 1] = lastLine + suffix;
        } else {
          // Truncate last line to fit suffix
          lines[lines.length - 1] = truncate(lastLine, maxLineLength - suffix.length) + suffix;
        }
      }
      break;
    }
  }

  // Push remaining line if not at limit
  if (currentLine && lines.length < maxProductLines) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Builds header lines for a shipping label based on order data and seller preferences.
 * Returns an object with the lines array and concatenated raw text for storage.
 * 
 * @param sellerId - The seller's Mercado Livre ID
 * @param order - Order data (order_id, shipment_id, buyer_name, order_comment)
 * @param items - Array of order items with sku, title, quantity
 * @returns Promise<HeaderLines> - Lines array, raw text, and preferences used
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

  // Products lines
  if (prefs.show_products && items.length > 0) {
    lineContents.products = buildProductLines(items, prefs.max_product_lines);
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

  // Step 3: Assemble lines in configured order, respecting max_total_lines
  const allLines: string[] = [];

  for (const lineType of prefs.line_order) {
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
 * This is the main entry point - loads order and items from cache.
 * 
 * @param sellerId - The seller's Mercado Livre ID
 * @param orderId - The order ID to build header for
 * @returns Promise<HeaderLines | null> - Header lines or null if order not found
 */
export async function buildHeaderLinesFromCache(
  sellerId: string,
  orderId: string
): Promise<HeaderLines | null> {
  // Load order data
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

  // Load order items
  const { data: itemsData, error: itemsError } = await supabase
    .from('meli_order_items_cache')
    .select('sku, title_short, title, quantity')
    .eq('seller_id', sellerId)
    .eq('order_id', orderId);

  if (itemsError) {
    console.error('Error loading items for header:', itemsError);
    // Continue with empty items
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
 * Call this after building header lines to cache the result.
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
 * Returns the header lines or null if failed.
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
