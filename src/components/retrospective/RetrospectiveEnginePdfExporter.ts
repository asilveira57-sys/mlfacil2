import jsPDF from 'jspdf';
import type { Retrospective } from '@/hooks/useRetrospectiveEngine';

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Generates a PDF from the engine's Retrospective (summary_json format).
 */
export function generateRetrospectivePdfFromEngine(retro: Retrospective, companyName?: string) {
  const summary = retro.summary_json as any;
  if (!summary) return;

  const current = summary.current || {};
  const baseline = summary.baseline;
  const evolution = summary.evolution;
  const narrative = summary.trial_narrative;
  const onboarding = summary.onboarding_context;
  const adsSnapshot = summary.ads_snapshot;
  const abc = summary.abc_analysis;
  const sellerName = companyName || summary.company_name || '';

  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const margin = 20;
  let y = 20;

  // ─── Cover with Seller Branding ───
  pdf.setFillColor(79, 70, 229);
  pdf.roundedRect(margin, y, W - margin * 2, 52, 4, 4, 'F');

  // Seller name as main brand
  if (sellerName) {
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(sellerName, W / 2, y + 18, { align: 'center' });
  }

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(retro.title || 'Retrospectiva', W / 2, y + 30, { align: 'center' });

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${retro.period_start} — ${retro.period_end}`, W / 2, y + 38, { align: 'center' });

  const typeLabel = retro.retrospective_type === 'trial_conversion' ? 'Período de Teste'
    : retro.retrospective_type === 'trial_summary' ? 'Plano Ativo'
    : retro.retrospective_type;
  pdf.setFontSize(9);
  pdf.text(typeLabel, W / 2, y + 46, { align: 'center' });

  y += 58;

  // "Desenvolvido por Marketplace Fácil" under header
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(148, 163, 184);
  pdf.text('Desenvolvido por Marketplace Fácil', W / 2, y, { align: 'center' });
  y += 8;

  // ─── Baseline Section ───
  if (baseline) {
    pdf.setFillColor(254, 243, 199);
    pdf.roundedRect(margin, y, W - margin * 2, 32, 3, 3, 'F');

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(146, 64, 14);
    pdf.text('📌 Cenário de Entrada (30 dias anteriores)', margin + 6, y + 10);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    const baseItems = [
      ['Faturamento', `R$ ${fmt(baseline.revenue)}`],
      ['Pedidos', String(baseline.orders ?? 0)],
      ['Ticket Médio', `R$ ${fmt(baseline.ticket)}`],
    ];
    let bx = margin + 6;
    for (const [label, value] of baseItems) {
      pdf.setTextColor(146, 64, 14);
      pdf.text(label, bx, y + 20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(value, bx, y + 26);
      pdf.setFont('helvetica', 'normal');
      bx += 55;
    }
    y += 38;
  }

  // ─── KPIs ───
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 41, 59);
  pdf.text('Indicadores Principais', margin, y);
  y += 2;

  // Gradient line
  pdf.setDrawColor(79, 70, 229);
  pdf.setLineWidth(0.8);
  pdf.line(margin, y, margin + 44, y);
  y += 8;

  const kpis = [
    ['Faturamento', `R$ ${fmt(current.revenue)}`, true],
    ['Pedidos', String(current.orders ?? 0), false],
    ['Ticket Médio', `R$ ${fmt(current.ticket)}`, false],
    ['Margem Média', `${fmt(current.margin, 1)}%`, false],
    ['Lucro Estimado', `R$ ${fmt(current.profit)}`, true],
    ['Anúncios Ativos', String(current.listings ?? 0), false],
  ];

  pdf.setFontSize(9);
  let col = 0;
  const startX = margin;
  const colW = (W - margin * 2) / 3;

  for (const [label, value, highlight] of kpis) {
    const cx = startX + (col % 3) * colW;
    const cy = y + Math.floor(col / 3) * 20;

    // Card background
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(cx, cy, colW - 4, 18, 2, 2, 'F');

    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(String(label), cx + 4, cy + 7);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    if (highlight) {
      pdf.setTextColor(79, 70, 229);
    } else {
      pdf.setTextColor(30, 41, 59);
    }
    pdf.text(String(value), cx + 4, cy + 14);

    col++;
  }
  y += Math.ceil(kpis.length / 3) * 20 + 8;

  // ─── ADS ───
  if (Number(current.ads_spend) > 0) {
    if (y > 240) { pdf.addPage(); y = 20; }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Publicidade (ADS)', margin, y);
    y += 2;
    pdf.setDrawColor(79, 70, 229);
    pdf.line(margin, y, margin + 44, y);
    y += 8;

    const adsKpis = [
      ['Investimento', `R$ ${fmt(current.ads_spend)}`],
      ['ROAS', `${fmt(current.roas, 1)}x`],
      ['ACOS', `${fmt(current.acos, 1)}%`],
      ['TACOS', `${fmt(current.tacos, 1)}%`],
    ];

    pdf.setFontSize(9);
    for (const [label, value] of adsKpis) {
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'normal');
      pdf.text(label, margin, y);
      pdf.setTextColor(30, 41, 59);
      pdf.setFont('helvetica', 'bold');
      pdf.text(value, margin + 50, y);
      y += 6;
    }
    y += 6;
  }

  // ─── Evolution ───
  if (evolution) {
    if (y > 240) { pdf.addPage(); y = 20; }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Evolução vs. Baseline', margin, y);
    y += 2;
    pdf.setDrawColor(79, 70, 229);
    pdf.line(margin, y, margin + 44, y);
    y += 8;

    if (evolution.orders_growth_pct != null) {
      const pct = Number(evolution.orders_growth_pct);
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text('Pedidos', margin, y);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(pct >= 0 ? 5 : 220, pct >= 0 ? 150 : 38, pct >= 0 ? 105 : 38);
      pdf.text(`${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, margin + 50, y);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`(${evolution.orders_delta > 0 ? '+' : ''}${evolution.orders_delta} pedidos)`, margin + 90, y);
      y += 10;
    }

    if (evolution.revenue_growth_pct != null) {
      const pct = Number(evolution.revenue_growth_pct);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text('Faturamento', margin, y);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(pct >= 0 ? 5 : 220, pct >= 0 ? 150 : 38, pct >= 0 ? 105 : 38);
      pdf.text(`${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, margin + 50, y);
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`(${evolution.revenue_delta > 0 ? '+' : ''}R$ ${fmt(evolution.revenue_delta)})`, margin + 90, y);
      y += 10;
    }
    y += 4;
  }

  // ─── Opportunities ───
  if (narrative?.discoveries?.opportunities?.length > 0) {
    if (y > 240) { pdf.addPage(); y = 20; }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Oportunidades Identificadas', margin, y);
    y += 2;
    pdf.setDrawColor(245, 158, 11);
    pdf.line(margin, y, margin + 44, y);
    y += 8;

    pdf.setFontSize(9);
    for (const opp of narrative.discoveries.opportunities) {
      if (y > 275) { pdf.addPage(); y = 20; }
      pdf.setFillColor(255, 251, 235);
      pdf.roundedRect(margin, y - 3, W - margin * 2, 10, 1, 1, 'F');
      pdf.setTextColor(120, 53, 15);
      pdf.setFont('helvetica', 'normal');
      const lines = pdf.splitTextToSize(`→ ${opp}`, W - margin * 2 - 8);
      pdf.text(lines, margin + 4, y + 3);
      y += lines.length * 5 + 4;
    }
    y += 4;
  }

  // ─── Projections ───
  if (narrative?.projections) {
    if (y > 240) { pdf.addPage(); y = 20; }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Projeções de Crescimento', margin, y);
    y += 2;
    pdf.setDrawColor(79, 70, 229);
    pdf.line(margin, y, margin + 44, y);
    y += 8;

    const projections = [
      ['Fat. Mensal Estimado', `R$ ${fmt(narrative.projections.monthly_revenue_estimate)}`],
      ['Fat. Anual Estimado', `R$ ${fmt(narrative.projections.annual_revenue_estimate)}`],
    ];
    if (narrative.projections.monthly_profit_estimate != null) {
      projections.push(['Lucro Mensal Estimado', `R$ ${fmt(narrative.projections.monthly_profit_estimate)}`]);
    }

    for (const [label, value] of projections) {
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'normal');
      pdf.text(label, margin, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(79, 70, 229);
      pdf.text(value, margin + 60, y);
      y += 7;
    }
  }

  // ─── Footer on every page ───
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `Relatório gerado automaticamente pela Marketplace Fácil • ${new Date().getFullYear()}`,
      W / 2,
      290,
      { align: 'center' }
    );
  }

  const fileName = `retrospectiva-${retro.retrospective_type}-${retro.period_start}${companyName ? `-${companyName.replace(/\s+/g, '_')}` : ''}.pdf`;
  pdf.save(fileName);
}
