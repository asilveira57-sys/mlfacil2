import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  History, FileText, Download, Trash2, Loader2, BarChart3, TrendingUp,
  DollarSign, Target, Calendar, AlertCircle, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserId } from '@/hooks/useCurrentUserId';
import { useActiveSellerId, useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  useRetrospectiveReports,
  useGenerateRetrospective,
  useDeleteRetrospective,
  logPdfDownload,
  RetrospectiveReport,
} from '@/hooks/useRetrospective';
import { RetrospectiveViewer } from '@/components/retrospective/RetrospectiveViewer';

const TIPO_LABELS: Record<string, string> = {
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  anual: 'Anual',
  ano_letivo: 'Ano Letivo',
};

export default function Retrospectiva() {
  const userId = useCurrentUserId();
  const sellerId = useActiveSellerId();
  const { activeAccount } = useActiveAccount();
  const accountName = activeAccount?.nickname || 'Minha Conta';
  const { data: reports = [], isLoading } = useRetrospectiveReports(userId, sellerId);
  const generateMut = useGenerateRetrospective();
  const deleteMut = useDeleteRetrospective();

  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedReport, setSelectedReport] = useState<RetrospectiveReport | null>(null);
  const [tipo, setTipo] = useState('mensal');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');

  // Auto-fill dates based on tipo
  const handleTipoChange = (newTipo: string) => {
    setTipo(newTipo);
    const now = new Date();
    const lastMonth = subMonths(now, 1);
    switch (newTipo) {
      case 'mensal':
        setPeriodoInicio(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
        setPeriodoFim(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
        break;
      case 'trimestral':
        const qStart = subMonths(startOfQuarter(now), 3);
        setPeriodoInicio(format(qStart, 'yyyy-MM-dd'));
        setPeriodoFim(format(endOfQuarter(subMonths(now, 1)), 'yyyy-MM-dd'));
        break;
      case 'anual':
        const lastYear = now.getFullYear() - 1;
        setPeriodoInicio(`${lastYear}-01-01`);
        setPeriodoFim(`${lastYear}-12-31`);
        break;
      case 'ano_letivo':
        const yearStart = now.getMonth() >= 7 ? now.getFullYear() - 1 : now.getFullYear() - 2;
        setPeriodoInicio(`${yearStart}-08-01`);
        setPeriodoFim(`${yearStart + 1}-07-31`);
        break;
    }
  };

  const handleGenerate = async () => {
    if (!userId || !sellerId || !periodoInicio || !periodoFim) {
      toast.error('Preencha todos os campos');
      return;
    }
    try {
      await generateMut.mutateAsync({
        userId,
        sellerId,
        tipo,
        periodoInicio,
        periodoFim,
        companyName: accountName || undefined,
      });
      toast.success('Retrospectiva gerada com sucesso!');
      setShowGenerate(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar retrospectiva');
    }
  };

  const handleDelete = (report: RetrospectiveReport) => {
    if (!confirm('Excluir este relatório?')) return;
    if (!userId) return;
    deleteMut.mutate(
      { id: report.id, userId },
      { onSuccess: () => toast.success('Relatório excluído') }
    );
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6 text-primary" />
              Retrospectiva Estratégica
            </h1>
            <p className="text-muted-foreground">
              Relatórios históricos consolidados do seu negócio
            </p>
          </div>
          <Button className="gap-2" onClick={() => { setShowGenerate(true); handleTipoChange('mensal'); }}>
            <Plus className="h-4 w-4" />
            Gerar Retrospectiva
          </Button>
        </div>

        {/* Reports list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma retrospectiva gerada</h3>
              <p className="text-muted-foreground mb-4">
                Gere seu primeiro relatório para visualizar a análise estratégica do período.
              </p>
              <Button onClick={() => { setShowGenerate(true); handleTipoChange('mensal'); }}>
                Gerar Primeira Retrospectiva
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onView={() => setSelectedReport(report)}
                onDelete={() => handleDelete(report)}
              />
            ))}
          </div>
        )}

        {/* Generate dialog */}
        <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Gerar Retrospectiva</DialogTitle>
              <DialogDescription>
                Selecione o tipo e período para consolidar os dados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Período</Label>
                <Select value={tipo} onValueChange={handleTipoChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                    <SelectItem value="ano_letivo">Ano Letivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Início</Label>
                  <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Fim</Label>
                  <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancelar</Button>
              <Button onClick={handleGenerate} disabled={generateMut.isPending} className="gap-2">
                {generateMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Gerar Retrospectiva
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Report viewer */}
        {selectedReport && (
          <RetrospectiveViewer
            report={selectedReport}
            open={!!selectedReport}
            onOpenChange={(open) => !open && setSelectedReport(null)}
            userId={userId}
          />
        )}
      </div>
    </PageContainer>
  );
}

// ─── Report Card ───
function ReportCard({
  report,
  onView,
  onDelete,
}: {
  report: RetrospectiveReport;
  onView: () => void;
  onDelete: () => void;
}) {
  const snapshot = report.json_snapshot as any;
  const vendas = snapshot?.vendas;

  return (
    <Card className="hover:border-primary/30 transition-colors cursor-pointer" onClick={onView}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{TIPO_LABELS[report.tipo] || report.tipo}</Badge>
          <div className="flex gap-1">
            {report.status === 'error' && (
              <Badge variant="destructive" className="text-xs">Erro</Badge>
            )}
            {report.status === 'processing' && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Processando
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-base mt-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {format(new Date(report.periodo_inicio + 'T12:00:00'), 'dd/MM/yyyy')} — {format(new Date(report.periodo_fim + 'T12:00:00'), 'dd/MM/yyyy')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {vendas && report.status === 'completed' ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Faturamento</p>
              <p className="font-semibold text-primary">
                R$ {Number(vendas.faturamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Pedidos</p>
              <p className="font-semibold">{vendas.total_pedidos || 0}</p>
            </div>
          </div>
        ) : report.status === 'error' ? (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {report.error_message || 'Erro ao processar'}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Processando dados...</p>
        )}

        <div className="flex justify-between items-center mt-4 pt-3 border-t">
          <span className="text-xs text-muted-foreground">
            {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
