import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { AdTimelineStats } from '@/types/ad-timeline';

const DEFAULT_LOGO_URL = '/marketplace-facil-logo.png';

interface ExportOptions {
  data: AdTimelineStats[];
  logoUrl?: string | null;
  sellerName?: string;
}

function buildRows(data: AdTimelineStats[]) {
  return data.map(item => ({
    'Item ID': item.item_id,
    'Título': item.title || item.item_id,
    'SKU': item.sku || '',
    'Status Radar': item.status_bucket,
    'Status ML': item.status || '',
    'Estoque': item.available_quantity ?? '',
    'Preço': item.price ?? '',
    'Total Vendido': item.sold_quantity ?? '',
    'Vendas 30d': item.sales_count_30d,
    'Vendas 60d': item.sales_count_60d,
    'Vendas 90d': item.sales_count_90d,
    'Vendas 120d': item.sales_count_120d,
    'Dias s/ Venda': item.days_since_last_sale ?? '',
    'Média Gap (h)': item.avg_gap_hours != null ? Math.round(item.avg_gap_hours) : '',
    'Última Venda': item.last_sale_at ? format(new Date(item.last_sale_at), 'dd/MM/yyyy', { locale: ptBR }) : '',
    'Primeira Venda': item.first_sale_at ? format(new Date(item.first_sale_at), 'dd/MM/yyyy', { locale: ptBR }) : '',
  }));
}

export function exportTimelineExcel({ data }: ExportOptions) {
  const rows = buildRows(data);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-fit column widths
  const colWidths = Object.keys(rows[0] || {}).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String((r as any)[key] || '').length)) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Linha do Tempo');
  XLSX.writeFile(wb, `linha-do-tempo-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}

async function loadImage(url: string): Promise<string | null> {
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

export async function exportTimelinePdf({ data, logoUrl, sellerName }: ExportOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Try to load logo
  let logoData = logoUrl ? await loadImage(logoUrl) : null;
  if (!logoData) {
    logoData = await loadImage(DEFAULT_LOGO_URL);
  }

  // Header
  const headerHeight = 25;
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 10, 3, 0, 18);
    } catch {
      // Logo load failed, skip
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Relatório - Linha do Tempo', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(9);
  doc.text(
    `${sellerName ? sellerName + ' • ' : ''}Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    pageWidth / 2,
    17,
    { align: 'center' }
  );

  // Table
  const columns = ['Item ID', 'Título', 'Status', 'Status ML', 'Estoque', 'Total Vend.', '30d', '60d', '90d', 'Dias s/ Venda', 'Última Venda'];
  const colWidths = [30, 55, 18, 22, 18, 22, 14, 14, 14, 24, 26];
  const startY = headerHeight + 5;
  const rowHeight = 6;
  const startX = 10;
  let y = startY;

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');

  let x = startX;
  columns.forEach((col, i) => {
    doc.text(col, x + 1, y + 4);
    x += colWidths[i];
  });
  y += rowHeight;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  const rows = data.map(item => [
    item.item_id,
    (item.title || item.item_id).substring(0, 35),
    item.status_bucket,
    item.status || '—',
    item.available_quantity != null ? String(item.available_quantity) : '—',
    item.sold_quantity != null ? String(item.sold_quantity) : '—',
    String(item.sales_count_30d),
    String(item.sales_count_60d),
    String(item.sales_count_90d),
    item.days_since_last_sale != null ? String(item.days_since_last_sale) : '—',
    item.last_sale_at ? format(new Date(item.last_sale_at), 'dd/MM/yy') : '—',
  ]);

  for (const row of rows) {
    if (y + rowHeight > pageHeight - 10) {
      doc.addPage();
      y = 10;
      // Repeat header on new page
      doc.setFillColor(240, 240, 240);
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      x = startX;
      columns.forEach((col, i) => {
        doc.text(col, x + 1, y + 4);
        x += colWidths[i];
      });
      y += rowHeight;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
    }

    // Alternating row bg
    if (rows.indexOf(row) % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight, 'F');
    }

    x = startX;
    row.forEach((cell, i) => {
      doc.text(String(cell), x + 1, y + 4);
      x += colWidths[i];
    });
    y += rowHeight;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 10, pageHeight - 5, { align: 'right' });
    doc.text('Marketplace Fácil', 10, pageHeight - 5);
  }

  doc.save(`linha-do-tempo-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
