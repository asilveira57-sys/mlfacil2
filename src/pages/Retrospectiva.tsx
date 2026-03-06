import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  History, FileText, Trash2, Loader2, Calendar, AlertCircle,
  Presentation, ExternalLink, Eye, Sparkles, Crown, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveSellerId, useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Retrospective } from '@/hooks/useRetrospectiveEngine';
import { TrialRetrospectiveViewer } from '@/components/retrospective/TrialRetrospectiveViewer';

// Also keep backward compat with old reports
import {
  useRetrospectiveReports,
  useDeleteRetrospective,
  logPdfDownload,
  type RetrospectiveReport,
} from '@/hooks/useRetrospective';
import { RetrospectiveViewer } from '@/components/retrospective/RetrospectiveViewer';
import { generateRetrospectivePdf } from '@/components/retrospective/RetrospectivePdfExporter';

const TYPE_LABELS: Record<string, string> = {
  trial_conversion: 'Trial — Conversão',
  trial_summary: 'Trial — Resumo',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  annual: 'Anual',
  semester: 'Semestral',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
  ano_letivo: 'Ano Letivo',
};

// ─── Hook: seller retrospectives from new engine ───

function useSellerRetrospectives(companyId: string | null) {
  return useQuery({
    queryKey: ['seller-retrospectives', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('retrospectives')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Retrospective[];
    },
    enabled: !!companyId,
  });
}

function useDeleteEngineRetro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('retrospectives').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-retrospectives'] }),
  });
}

export default function Retrospectiva() {
  const userId = useCurrentUserId();
  const sellerId = useActiveSellerId();
  const { activeAccount } = useActiveAccount();
  const companyId = activeAccount?.companyId ?? null;

  // New engine retrospectives
  const { data: engineRetros = [], isLoading: loadingEngine } = useSellerRetrospectives(companyId);
  const deleteEngineMut = useDeleteEngineRetro();

  // Legacy reports (old system)
  const { data: legacyReports = [], isLoading: loadingLegacy } = useRetrospectiveReports(userId, sellerId);
  const deleteLegacyMut = useDeleteRetrospective();

  const [selectedEngineRetro, setSelectedEngineRetro] = useState<Retrospective | null>(null);
  const [selectedLegacyReport, setSelectedLegacyReport] = useState<RetrospectiveReport | null>(null);

  const isLoading = loadingEngine || loadingLegacy;
  const hasAny = engineRetros.length > 0 || legacyReports.length > 0;

  const handleDeleteEngine = (r: Retrospective) => {
    if (!confirm('Excluir este relatório?')) return;
    deleteEngineMut.mutate(r.id, { onSuccess: () => toast.success('Excluído') });
  };

  const handleDeleteLegacy = (r: RetrospectiveReport) => {
    if (!confirm('Excluir este relatório?')) return;
    if (!userId) return;
    deleteLegacyMut.mutate({ id: r.id, userId }, { onSuccess: () => toast.success('Excluído') });
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Retrospectiva Estratégica
          </h1>
          <p className="text-muted-foreground">
            Relatórios de evolução e performance do seu negócio
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasAny ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma retrospectiva disponível</h3>
              <p className="text-muted-foreground">
                Retrospectivas são geradas automaticamente conforme sua operação evolui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Engine retrospectives (new) */}
            {engineRetros.length > 0 && (
              <div className="space-y-3">
                {legacyReports.length > 0 && (
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Relatórios Automáticos
                  </h2>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {engineRetros.map((r) => (
                    <EngineReportCard
                      key={r.id}
                      report={r}
                      onView={() => setSelectedEngineRetro(r)}
                      onDelete={() => handleDeleteEngine(r)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Legacy reports */}
            {legacyReports.length > 0 && (
              <div className="space-y-3">
                {engineRetros.length > 0 && (
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Relatórios Manuais
                  </h2>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {legacyReports.map((r) => (
                    <LegacyReportCard
                      key={r.id}
                      report={r}
                      onView={() => setSelectedLegacyReport(r)}
                      onDelete={() => handleDeleteLegacy(r)}
                      userId={userId}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Engine viewer (trial or standard) */}
        {selectedEngineRetro && (
          <TrialRetrospectiveViewer
            report={selectedEngineRetro}
            open={!!selectedEngineRetro}
            onOpenChange={(open) => !open && setSelectedEngineRetro(null)}
          />
        )}

        {/* Legacy viewer */}
        {selectedLegacyReport && (
          <RetrospectiveViewer
            report={selectedLegacyReport}
            open={!!selectedLegacyReport}
            onOpenChange={(open) => !open && setSelectedLegacyReport(null)}
            userId={userId}
          />
        )}
      </div>
    </PageContainer>
  );
}

// ─── Engine Report Card ───

function EngineReportCard({
  report,
  onView,
  onDelete,
}: {
  report: Retrospective;
  onView: () => void;
  onDelete: () => void;
}) {
  const summary = report.summary_json as any;
  const current = summary?.current;
  const isTrialType = report.retrospective_type === 'trial_conversion' || report.retrospective_type === 'trial_summary';

  return (
    <Card
      className="hover:border-primary/30 transition-colors cursor-pointer group"
      onClick={onView}
    >
      <CardContent className="p-5">
        {/* Top badges */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {TYPE_LABELS[report.retrospective_type] || report.retrospective_type}
            </Badge>
            {isTrialType && (
              <span className="text-xs">
                {report.retrospective_type === 'trial_conversion' ? '🚀' : '✅'}
              </span>
            )}
          </div>
          {report.status === 'generated' && (
            <Badge className="text-xs bg-primary/10 text-primary border-0">Pronto</Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm mb-1 line-clamp-1">{report.title}</h3>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-4">
          <Calendar className="h-3 w-3" />
          {report.period_start} — {report.period_end}
        </p>

        {/* KPIs */}
        {current && report.status === 'generated' ? (
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <p className="text-muted-foreground text-xs">Faturamento</p>
              <p className="font-semibold text-primary">
                R$ {Number(current.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Pedidos</p>
              <p className="font-semibold">{current.orders || 0}</p>
            </div>
          </div>
        ) : report.status === 'error' ? (
          <p className="text-sm text-destructive flex items-center gap-1 mb-4">
            <AlertCircle className="h-3.5 w-3.5" /> Erro ao processar
          </p>
        ) : null}

        {/* Report links */}
        {(report.html_url || report.presentation_url) && (
          <div className="flex gap-2 mb-4">
            {report.html_url && (
              <a
                href={report.html_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="h-3 w-3" /> Relatório
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {report.presentation_url && (
              <a
                href={report.presentation_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Presentation className="h-3 w-3" /> Slides
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onView(); }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Legacy Report Card ───

function LegacyReportCard({
  report,
  onView,
  onDelete,
  userId,
}: {
  report: RetrospectiveReport;
  onView: () => void;
  onDelete: () => void;
  userId: string | null;
}) {
  const snapshot = report.json_snapshot as any;
  const vendas = snapshot?.vendas;

  const handleDownloadPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    generateRetrospectivePdf(report);
    if (userId) logPdfDownload(userId, report.id);
  };

  return (
    <Card className="hover:border-primary/30 transition-colors cursor-pointer group" onClick={onView}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <Badge variant="outline" className="text-xs">
            {TYPE_LABELS[report.tipo] || report.tipo}
          </Badge>
          {report.status === 'error' && (
            <Badge variant="destructive" className="text-xs">Erro</Badge>
          )}
          {report.status === 'processing' && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Processando
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-4">
          <Calendar className="h-3 w-3" />
          {format(new Date(report.periodo_inicio + 'T12:00:00'), 'dd/MM/yyyy')} — {format(new Date(report.periodo_fim + 'T12:00:00'), 'dd/MM/yyyy')}
        </p>

        {vendas && report.status === 'completed' ? (
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <p className="text-muted-foreground text-xs">Faturamento</p>
              <p className="font-semibold text-primary">
                R$ {Number(vendas.faturamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Pedidos</p>
              <p className="font-semibold">{vendas.total_pedidos || 0}</p>
            </div>
          </div>
        ) : report.status === 'error' ? (
          <p className="text-sm text-destructive flex items-center gap-1 mb-4">
            <AlertCircle className="h-3.5 w-3.5" /> {report.error_message || 'Erro ao processar'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">Processando dados...</p>
        )}

        <div className="flex justify-between items-center pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </span>
          <div className="flex gap-1">
            {report.status === 'completed' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleDownloadPdf}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
