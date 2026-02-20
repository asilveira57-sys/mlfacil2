import jsPDF from 'jspdf';
import { RetrospectiveReport } from '@/hooks/useRetrospective';

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function generateRetrospectivePdf(report: RetrospectiveReport) {
  const s = report.json_snapshot as any;
  const vendas = s?.vendas ?? {};
  const custos = s?.custos ?? {};
  const ads = s?.ads ?? {};
  const cancelamentos = s?.cancelamentos ?? {};
  const mensal = s?.mensal ?? [];
  const topProdutos = s?.top_produtos ?? [];

  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 20;

  // ─── Cover ───
  pdf.setFontSize(10);
  pdf.setTextColor(120);
  if (report.company_name) {
    pdf.text(report.company_name, W / 2, y, { align: 'center' });
    y += 8;
  }

  pdf.setFontSize(24);
  pdf.setTextColor(30);
  pdf.text('Retrospectiva Estratégica', W / 2, y + 10, { align: 'center' });
  y += 22;

  pdf.setFontSize(14);
  pdf.setTextColor(80);
  const tipoLabel = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual', ano_letivo: 'Ano Letivo' }[report.tipo] || report.tipo;
  pdf.text(`${tipoLabel} — ${report.periodo_inicio} a ${report.periodo_fim}`, W / 2, y, { align: 'center' });
  y += 16;

  pdf.setDrawColor(200);
  pdf.line(margin, y, W - margin, y);
  y += 10;

  // ─── KPIs ───
  pdf.setFontSize(16);
  pdf.setTextColor(30);
  pdf.text('Indicadores Principais', margin, y);
  y += 10;

  const kpis = [
    ['Faturamento', `R$ ${fmt(vendas.faturamento)}`, `Var: ${Number(vendas.variacao_faturamento ?? 0).toFixed(1)}%`],
    ['Pedidos', String(vendas.total_pedidos ?? 0), `Var: ${Number(vendas.variacao_pedidos ?? 0).toFixed(1)}%`],
    ['Ticket Médio', `R$ ${fmt(vendas.ticket_medio)}`, ''],
    ['Margem Média', `${fmt(custos.margem_media, 1)}%`, ''],
    ['Lucro Estimado', `R$ ${fmt(custos.lucro)}`, ''],
    ['Custo Total', `R$ ${fmt(custos.custo_total)}`, ''],
  ];

  pdf.setFontSize(10);
  for (const [label, value, extra] of kpis) {
    pdf.setTextColor(100);
    pdf.text(label, margin, y);
    pdf.setTextColor(30);
    pdf.text(value, margin + 50, y);
    if (extra) {
      pdf.setTextColor(120);
      pdf.text(extra, margin + 110, y);
    }
    y += 6;
  }
  y += 6;

  // ─── ADS ───
  if (Number(ads.investimento) > 0) {
    pdf.setFontSize(16);
    pdf.setTextColor(30);
    pdf.text('Publicidade (ADS)', margin, y);
    y += 10;

    pdf.setFontSize(10);
    const adsKpis = [
      ['Investimento', `R$ ${fmt(ads.investimento)}`],
      ['ROAS', `${fmt(ads.roas, 1)}x`],
      ['ACOS', `${fmt(ads.acos, 1)}%`],
      ['TACOS', `${fmt(ads.tacos, 1)}%`],
    ];
    for (const [label, value] of adsKpis) {
      pdf.setTextColor(100);
      pdf.text(label, margin, y);
      pdf.setTextColor(30);
      pdf.text(value, margin + 50, y);
      y += 6;
    }
    y += 6;
  }

  // ─── Monthly ───
  if (mensal.length > 0) {
    if (y > 230) { pdf.addPage(); y = 20; }
    pdf.setFontSize(16);
    pdf.setTextColor(30);
    pdf.text('Evolução Mensal', margin, y);
    y += 10;

    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text('Mês', margin, y);
    pdf.text('Pedidos', margin + 50, y);
    pdf.text('Faturamento', margin + 90, y);
    y += 5;
    pdf.line(margin, y, W - margin, y);
    y += 4;

    pdf.setTextColor(30);
    for (const m of mensal) {
      if (y > 275) { pdf.addPage(); y = 20; }
      pdf.text(m.month, margin, y);
      pdf.text(String(m.orders), margin + 50, y);
      pdf.text(`R$ ${fmt(m.revenue)}`, margin + 90, y);
      y += 5;
    }
    y += 6;
  }

  // ─── Top Products ───
  if (topProdutos.length > 0) {
    if (y > 230) { pdf.addPage(); y = 20; }
    pdf.setFontSize(16);
    pdf.setTextColor(30);
    pdf.text(`Top Produtos (${topProdutos.length})`, margin, y);
    y += 10;

    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text('Produto', margin, y);
    pdf.text('Unid.', margin + 100, y);
    pdf.text('Receita', margin + 120, y);
    y += 5;
    pdf.line(margin, y, W - margin, y);
    y += 4;

    pdf.setTextColor(30);
    for (const p of topProdutos.slice(0, 30)) {
      if (y > 275) { pdf.addPage(); y = 20; }
      const title = String(p.title || '').substring(0, 50);
      pdf.text(title, margin, y);
      pdf.text(String(p.units), margin + 100, y);
      pdf.text(`R$ ${fmt(p.revenue)}`, margin + 120, y);
      y += 5;
    }
  }

  // ─── Footer on every page ───
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Relatório gerado automaticamente pelo Marketplace Fácil • ${new Date().getFullYear()}`,
      W / 2,
      290,
      { align: 'center' }
    );
  }

  pdf.save(`retrospectiva-${report.tipo}-${report.periodo_inicio}.pdf`);
}
