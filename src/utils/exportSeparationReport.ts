import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ShippingOrder, OrderItemSummary } from '@/hooks/useShippingLabels';

const DEFAULT_LOGO_URL = '/marketplace-facil-logo.png';

export type SeparationMode = 'per_order' | 'accumulated';

interface SeparationReportOptions {
  orders: ShippingOrder[];
  orderItems: Map<string, OrderItemSummary[]>;
  mode: SeparationMode;
  logoUrl?: string | null;
  sellerName?: string;
}

interface AccumulatedItem {
  item_id: string;
  variation_id: string | null;
  variation_attributes: { name: string; value: string }[] | null;
  sku: string | null;
  title: string | null;
  thumbnail: string | null;
  quantity: number;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadThumbnail(url: string): Promise<string | null> {
  try {
    // ML thumbnails use http, proxy or just try
    const secureUrl = url.replace('http://', 'https://');
    return await loadImageAsBase64(secureUrl);
  } catch {
    return null;
  }
}

function drawHeader(
  doc: jsPDF,
  logoData: string | null,
  sellerName: string | undefined,
  mode: SeparationMode,
  pageWidth: number,
) {
  const headerH = 22;
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, pageWidth, headerH, 'F');

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 8, 2, 0, 17);
    } catch { /* skip */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('Relatório de Separação', pageWidth / 2, 9, { align: 'center' });
  doc.setFontSize(8);
  const subtitle = [
    sellerName || '',
    mode === 'accumulated' ? 'Acumulado por produto' : 'Por pedido',
    format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
  ].filter(Boolean).join(' • ');
  doc.text(subtitle, pageWidth / 2, 16, { align: 'center' });

  return headerH;
}

function drawFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 8, pageHeight - 4, { align: 'right' });
    doc.text('Marketplace Fácil', 8, pageHeight - 4);
  }
}

export async function exportSeparationReport({
  orders,
  orderItems,
  mode,
  logoUrl,
  sellerName,
}: SeparationReportOptions) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const contentWidth = pageWidth - margin * 2;

  // Load logo
  let logoData = logoUrl ? await loadImageAsBase64(logoUrl) : null;
  if (!logoData) logoData = await loadImageAsBase64(DEFAULT_LOGO_URL);

  // Pre-load unique thumbnails
  const thumbCache = new Map<string, string | null>();
  const allItems: OrderItemSummary[] = [];
  for (const order of orders) {
    const items = orderItems.get(order.order_id) || [];
    allItems.push(...items);
  }
  const uniqueThumbs = [...new Set(allItems.map(i => i.thumbnail).filter(Boolean))] as string[];
  await Promise.all(uniqueThumbs.map(async (url) => {
    thumbCache.set(url, await loadThumbnail(url));
  }));

  const headerH = drawHeader(doc, logoData, sellerName, mode, pageWidth);
  let y = headerH + 6;

  const rowH = 14;
  const thumbSize = 10;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 12) {
      doc.addPage();
      y = 10;
    }
  };

  if (mode === 'per_order') {
    // Per-order mode
    for (let oi = 0; oi < orders.length; oi++) {
      const order = orders[oi];
      const items = orderItems.get(order.order_id) || [];
      if (items.length === 0) continue;

      ensureSpace(rowH + 8);

      // Order header bar
      doc.setFillColor(235, 235, 240);
      doc.rect(margin, y, contentWidth, 7, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      const orderLabel = `Pedido: ${order.order_id}`;
      doc.text(orderLabel, margin + 2, y + 5);
      const buyerLabel = order.buyer_nickname ? `Comprador: ${order.buyer_nickname}` : '';
      if (buyerLabel) {
        doc.setFont('helvetica', 'normal');
        doc.text(buyerLabel, pageWidth - margin - 2, y + 5, { align: 'right' });
      }
      y += 9;

      // Items
      for (const item of items) {
        ensureSpace(rowH + 2);
        drawItemRow(doc, item, thumbCache, margin, y, contentWidth, thumbSize, rowH);
        y += rowH + 1;
      }

      y += 3; // gap between orders
    }
  } else {
    // Accumulated mode – group by product_key (item_id + variation_id)
    const accMap = new Map<string, AccumulatedItem>();
    for (const order of orders) {
      const items = orderItems.get(order.order_id) || [];
      for (const item of items) {
        const key = `${item.item_id}_${item.variation_id || ''}`;
        const existing = accMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          accMap.set(key, {
            item_id: item.item_id,
            variation_id: item.variation_id,
            variation_attributes: item.variation_attributes || null,
            sku: item.sku,
            title: item.title,
            thumbnail: item.thumbnail,
            quantity: item.quantity,
          });
        }
      }
    }

    // Sort by quantity desc
    const accumulated = [...accMap.values()].sort((a, b) => b.quantity - a.quantity);

    // Table header
    doc.setFillColor(235, 235, 240);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text('Produto', margin + 14, y + 5);
    doc.text('SKU', margin + contentWidth * 0.65, y + 5);
    doc.text('Qtd', margin + contentWidth - 8, y + 5, { align: 'right' });
    y += 9;

    doc.setFont('helvetica', 'normal');
    for (let i = 0; i < accumulated.length; i++) {
      const item = accumulated[i];
      ensureSpace(rowH + 2);

      // Alternating bg
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 252);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }

      drawItemRow(doc, {
        item_id: item.item_id,
        variation_id: item.variation_id,
        variation_attributes: item.variation_attributes || null,
        sku: item.sku,
        title_short: null,
        title: item.title,
        quantity: item.quantity,
        unit_price: 0,
        permalink: null,
        catalog_product_id: null,
        thumbnail: item.thumbnail,
      }, thumbCache, margin, y, contentWidth, thumbSize, rowH);
      y += rowH + 1;
    }
  }

  drawFooter(doc, pageWidth, pageHeight);

  doc.save(`relatorio-separacao-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
}

function drawItemRow(
  doc: jsPDF,
  item: OrderItemSummary,
  thumbCache: Map<string, string | null>,
  x: number,
  y: number,
  contentWidth: number,
  thumbSize: number,
  rowH: number,
) {
  // Thumbnail
  if (item.thumbnail) {
    const thumbData = thumbCache.get(item.thumbnail);
    if (thumbData) {
      try {
        doc.addImage(thumbData, 'JPEG', x + 1, y + 1, thumbSize, thumbSize);
      } catch { /* skip */ }
    }
  }

  const textX = x + thumbSize + 3;
  const maxTitleWidth = contentWidth * 0.55;

  // Title (up to 2 lines)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const title = item.title || item.item_id;
  const lines = doc.splitTextToSize(title, maxTitleWidth);
  const titleLines = lines.slice(0, 2) as string[];
  doc.text(titleLines, textX, y + 4);

  // Variation attributes below title (human-readable names)
  if (item.variation_attributes && item.variation_attributes.length > 0) {
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    const attrText = item.variation_attributes.map(a => `${a.name}: ${a.value}`).join(' | ');
    doc.text(attrText, textX, y + 4 + titleLines.length * 3.2);
  } else if (item.variation_id) {
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Var: ${item.variation_id}`, textX, y + 4 + titleLines.length * 3.2);
  }

  // SKU
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  const skuX = x + contentWidth * 0.65;
  doc.text(item.sku || '—', skuX, y + 6);

  // Quantity
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(String(item.quantity), x + contentWidth - 3, y + 7, { align: 'right' });
  doc.setFont('helvetica', 'normal');
}
