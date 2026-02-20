import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Users, Clock, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { useOnboardingFlowAudit, type OnboardingFlow } from '@/hooks/useWelcomeOnboarding';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatSeconds(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed': return <Badge variant="default" className="opacity-90">Concluído</Badge>;
    case 'skipped': return <Badge variant="secondary">Pulado</Badge>;
    case 'in_progress': return <Badge variant="outline" className="border-primary text-primary">Em andamento</Badge>;
    case 'forced_pending': return <Badge variant="outline" className="border-destructive text-destructive">Pendente forçado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

interface Props {
  flow: OnboardingFlow;
  onBack: () => void;
}

export function AdminWelcomeAudit({ flow, onBack }: Props) {
  const { data: audit, isLoading } = useOnboardingFlowAudit(flow.id);

  const completionRate = audit && audit.total > 0
    ? Math.round((audit.completed / audit.total) * 100)
    : 0;

  const skipRate = audit && audit.total > 0
    ? Math.round((audit.skipped / audit.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Auditoria · {flow.nome}</h2>
          <p className="text-sm text-muted-foreground font-mono">v{flow.versao}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" /> Total usuários
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{audit?.total ?? 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Concluíram
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{audit?.completed ?? 0}</p>
                <p className="text-xs text-muted-foreground">{completionRate}% do total</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" /> Pularam
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{audit?.skipped ?? 0}</p>
                <p className="text-xs text-muted-foreground">{skipRate}% do total</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Tempo médio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{formatSeconds(audit?.avgSeconds ?? 0)}</p>
                <p className="text-xs text-muted-foreground">para concluir</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          {audit && audit.total > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Taxa de conclusão vs abandono
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative h-5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-primary transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                  <div
                    className="absolute top-0 h-full bg-muted-foreground/40 transition-all"
                    style={{ left: `${completionRate}%`, width: `${skipRate}%` }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary inline-block" />Concluído ({completionRate}%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40 inline-block" />Pulado ({skipRate}%)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/20 inline-block" />Em andamento ({100 - completionRate - skipRate}%)</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Registros detalhados</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!audit?.rows || audit.rows.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Nenhum registro ainda</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Conclusão</TableHead>
                      <TableHead>IP Início</TableHead>
                      <TableHead>IP Fim</TableHead>
                      <TableHead>Duração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.rows.map((row, i) => {
                      const duracao =
                        row.completed_at
                          ? Math.round(
                              (new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 1000
                            )
                          : null;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-muted-foreground max-w-[140px] truncate">
                            {row.user_id.slice(0, 8)}…
                          </TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(row.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.completed_at
                              ? format(new Date(row.completed_at), "dd/MM/yy HH:mm", { locale: ptBR })
                              : '—'
                            }
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.ip_inicio ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{row.ip_fim ?? '—'}</TableCell>
                          <TableCell className="text-xs">
                            {duracao !== null ? formatSeconds(duracao) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
