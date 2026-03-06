import { useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download, TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  BarChart3, Target, Minus, ArrowUpRight, ArrowDownRight,
  FileText, Presentation, ExternalLink,
} from 'lucide-react';
import { RetrospectiveReport, logPdfDownload } from '@/hooks/useRetrospective';
import { generateRetrospectivePdf } from './RetrospectivePdfExporter';

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(val: number | null | undefined): string {
  const n = Number(val ?? 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function VariationBadge({ value }: { value: number | null | undefined }) {
  const n = Number(value ?? 0);
  if (n === 0) return <Badge variant="secondary" className="gap-1 text-xs"><Minus className="h-3 w-3" /> 0%</Badge>;
  if (n > 0) return <Badge className="gap-1 text-xs bg-primary"><ArrowUpRight className="h-3 w-3" /> {pct(n)}</Badge>;
  return <Badge variant="destructive" className="gap-1 text-xs"><ArrowDownRight className="h-3 w-3" /> {pct(n)}</Badge>;
}

interface Props {
  report: RetrospectiveReport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
}

export function RetrospectiveViewer({ report, open, onOpenChange, userId }: Props) {
  const s = report.json_snapshot as any;
  const vendas = s?.vendas ?? {};
  const custos = s?.custos ?? {};
  const ads = s?.ads ?? {};
  const cancelamentos = s?.cancelamentos ?? {};
  const mensal = s?.mensal ?? [];
  const topProdutos = s?.top_produtos ?? [];

  const handleDownloadPdf = () => {
    generateRetrospectivePdf(report);
    if (userId) logPdfDownload(userId, report.id);
  };

  if (report.status !== 'completed') return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">
              Retrospectiva {report.tipo.charAt(0).toUpperCase() + report.tipo.slice(1)}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4" /> PDF
              </Button>
              {report.pdf_url && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={report.pdf_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-3.5 w-3.5" /> HTML
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {report.periodo_inicio} — {report.periodo_fim}
            {report.company_name && ` • ${report.company_name}`}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="space-y-6 mt-4">
            {/* KPIs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={DollarSign}
                label="Faturamento"
                value={`R$ ${fmt(vendas.faturamento)}`}
                variation={vendas.variacao_faturamento}
              />
              <KpiCard
                icon={ShoppingCart}
                label="Pedidos"
                value={String(vendas.total_pedidos ?? 0)}
                variation={vendas.variacao_pedidos}
              />
              <KpiCard
                icon={Target}
                label="Ticket Médio"
                value={`R$ ${fmt(vendas.ticket_medio)}`}
              />
              <KpiCard
                icon={BarChart3}
                label="Margem Média"
                value={`${fmt(custos.margem_media, 1)}%`}
              />
            </div>

            {/* Costs & Profit */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Lucro Estimado</p>
                <p className="text-2xl font-bold text-primary">R$ {fmt(custos.lucro)}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Custo Total</p>
                <p className="text-2xl font-bold text-destructive">R$ {fmt(custos.custo_total)}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">Taxas ML</p>
                <p className="text-2xl font-bold">R$ {fmt(custos.taxas_ml)}</p>
              </div>
            </div>

            {/* ADS */}
            {Number(ads.investimento) > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-3">Publicidade (ADS)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">Investimento</p>
                    <p className="text-lg font-bold">R$ {fmt(ads.investimento)}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">ROAS</p>
                    <p className="text-lg font-bold">{fmt(ads.roas, 1)}x</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">ACOS</p>
                    <p className="text-lg font-bold">{fmt(ads.acos, 1)}%</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">TACOS</p>
                    <p className="text-lg font-bold">{fmt(ads.tacos, 1)}%</p>
                  </div>
                </div>
              </div>
            )}

            {/* Cancelamentos */}
            {Number(cancelamentos.total) > 0 && (
              <div className="border rounded-lg p-4 bg-destructive/5">
                <p className="text-sm font-medium text-destructive">Cancelamentos / Devoluções</p>
                <p className="text-lg">
                  {cancelamentos.total} pedidos — R$ {fmt(cancelamentos.valor)}
                </p>
              </div>
            )}

            {/* Monthly */}
            {mensal.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-3">Evolução Mensal</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3">Mês</th>
                        <th className="text-right p-3">Pedidos</th>
                        <th className="text-right p-3">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mensal.map((m: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-3">{m.month}</td>
                          <td className="p-3 text-right">{m.orders}</td>
                          <td className="p-3 text-right">R$ {fmt(m.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top Products */}
            {topProdutos.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-3">Top Produtos ({topProdutos.length})</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3">Produto</th>
                        <th className="text-right p-3">Unidades</th>
                        <th className="text-right p-3">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProdutos.slice(0, 20).map((p: any, i: number) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-3 max-w-xs truncate">{p.title}</td>
                          <td className="p-3 text-right">{p.units}</td>
                          <td className="p-3 text-right">R$ {fmt(p.revenue)}</td>
                        </tr>
                      ))}
                      {topProdutos.length > 20 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-center text-muted-foreground">
                            ... e mais {topProdutos.length - 20} produtos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground pt-4 border-t">
              Relatório gerado automaticamente pelo Marketplace Fácil • {new Date().getFullYear()}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Card ───
function KpiCard({
  icon: Icon,
  label,
  value,
  variation,
}: {
  icon: any;
  label: string;
  value: string;
  variation?: number | null;
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {variation !== undefined && variation !== null && (
        <div className="mt-1">
          <VariationBadge value={variation} />
        </div>
      )}
    </div>
  );
}
