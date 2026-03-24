import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, AlertTriangle, CheckCircle2, Loader2, XCircle, Timer } from 'lucide-react';
import { useProcessingQueue } from '@/hooks/useProcessingQueue';
import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Na fila', variant: 'secondary' },
  processing: { label: 'Processando', variant: 'default' },
  done: { label: 'Concluído', variant: 'outline' },
  error: { label: 'Erro', variant: 'destructive' },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  IMPORT_ORDERS: 'Importar Pedidos',
  CALCULATE_COST: 'Calcular Custos',
  SYNC_LIGHT: 'Sync Leve',
  SYNC_BILLING_MANUAL: 'Sync Financeiro',
  REFRESH_KEYWORDS: 'Atualizar Keywords',
  RADIOGRAPHY_ANALYZE: 'Análise Radiografia',
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: 'text-red-500' },
  normal: { label: 'Normal', color: 'text-muted-foreground' },
  low: { label: 'Baixa', color: 'text-muted-foreground/60' },
};

function formatDuration(ms: number | null) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function FinanceiroRotinas() {
  const { jobs, stats, loading, refetch } = useProcessingQueue();

  useEffect(() => {
    const interval = setInterval(refetch, 10000);
    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fila de Processamento</h1>
          <p className="text-muted-foreground">Monitoramento de jobs e execuções em lote</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Na Fila</span>
            </div>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <span className="text-sm text-muted-foreground">Processando</span>
            </div>
            <p className="text-2xl font-bold">{stats.processing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Concluídos</span>
            </div>
            <p className="text-2xl font-bold">{stats.done}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Erros</span>
            </div>
            <p className="text-2xl font-bold">{stats.error}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tempo Médio</span>
            </div>
            <p className="text-2xl font-bold">{formatDuration(stats.avgDurationMs)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Protection Alert */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Proteção Anti-Loop Ativa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Jobs são processados em lote (batch). Nenhuma rotina executa em loop por conta individual.
              Tipos bloqueados são rejeitados automaticamente com SYSTEM_BLOCK.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Histórico de Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : jobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum job registrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  jobs.map((job) => {
                    const statusInfo = STATUS_MAP[job.status] || { label: job.status, variant: 'outline' as const };
                    const priorityInfo = PRIORITY_LABELS[job.priority] || PRIORITY_LABELS.normal;
                    return (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium text-sm">
                          {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {job.seller_id.length > 12 ? `${job.seller_id.slice(0, 12)}…` : job.seller_id}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs ${priorityInfo.color}`}>{priorityInfo.label}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="text-xs">
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {job.attempts}/{job.max_attempts}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {formatDuration(job.duration_ms)}
                        </TableCell>
                        <TableCell className="text-xs text-red-500 max-w-[200px] truncate">
                          {job.error_message || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
