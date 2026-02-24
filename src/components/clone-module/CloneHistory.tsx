import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ExternalLink, Eye, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'Na fila', variant: 'outline' },
  running: { label: 'Executando', variant: 'secondary' },
  done: { label: 'Concluído', variant: 'default' },
  partial: { label: 'Parcial', variant: 'secondary' },
  failed: { label: 'Falhou', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
  created: { label: 'Criado', variant: 'default' },
};

export function CloneHistory() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['clone-history', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('mktpfacil_clone_jobs')
        .select('*, mktpfacil_clone_job_units(*)')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="queued">Na fila</SelectItem>
            <SelectItem value="running">Executando</SelectItem>
            <SelectItem value="done">Concluídos</SelectItem>
            <SelectItem value="partial">Parciais</SelectItem>
            <SelectItem value="failed">Falhas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{jobs.length} job(s)</span>
      </div>

      {/* Jobs table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma clonagem encontrada.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Unidades</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map(job => {
                const snap = job.source_snapshot_json as Record<string, unknown> | null;
                const title = (snap?.title as string) || job.source_item_id;
                const units = (job.mktpfacil_clone_job_units as unknown[]) || [];
                const createdCount = units.filter((u: any) => u.status === 'created').length;
                const failedCount = units.filter((u: any) => u.status === 'failed').length;
                const st = STATUS_MAP[job.status] || { label: job.status, variant: 'outline' as const };

                return (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedJobId(job.id)}>
                    <TableCell>
                      <div className="max-w-[300px]">
                        <p className="text-sm font-medium truncate">{title}</p>
                        <p className="text-xs text-muted-foreground">{job.source_item_id}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-emerald-500">{createdCount} ✓</span>
                      {failedCount > 0 && <span className="text-destructive ml-2">{failedCount} ✗</span>}
                      <span className="text-muted-foreground ml-1">/ {units.length}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(job.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Job detail dialog */}
      <Dialog open={!!selectedJobId} onOpenChange={open => !open && setSelectedJobId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  Job: {selectedJob.source_item_id}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Source preview */}
                {selectedJob.source_snapshot_json && (
                  <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                    <p className="text-sm font-medium">{(selectedJob.source_snapshot_json as any)?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedJob.source_url || selectedJob.source_item_id}
                    </p>
                  </div>
                )}

                {/* Units table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Variação</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Item Destino</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((selectedJob.mktpfacil_clone_job_units as any[]) || []).map((unit: any) => {
                      const ust = STATUS_MAP[unit.status] || { label: unit.status, variant: 'outline' as const };
                      return (
                        <TableRow key={unit.id}>
                          <TableCell className="text-xs">{unit.unit_index}</TableCell>
                          <TableCell className="text-xs">{unit.source_variation_id || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={ust.variant} className="text-xs">{ust.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {unit.destination_item_id ? (
                              <a
                                href={unit.destination_permalink || `https://www.mercadolivre.com.br/anuncios/${unit.destination_item_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                                onClick={e => e.stopPropagation()}
                              >
                                {unit.destination_item_id}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                            {unit.error_message || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
