import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { CheckCircle, XCircle, Clock, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PrintJobV2 } from '@/hooks/useShippingLabelsV2';

interface PrintHistoryV2Props {
  jobs: PrintJobV2[];
  isLoading: boolean;
}

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  concluido: { label: 'Concluído', icon: CheckCircle, color: 'text-green-600' },
  parcial: { label: 'Parcial', icon: Clock, color: 'text-yellow-600' },
  erro: { label: 'Erro', icon: XCircle, color: 'text-red-600' },
  processando: { label: 'Processando', icon: Loader2, color: 'text-blue-600' },
  pendente: { label: 'Pendente', icon: Clock, color: 'text-muted-foreground' },
};

export function PrintHistoryV2({ jobs, isLoading }: PrintHistoryV2Props) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleRedownload = async (job: PrintJobV2) => {
    if (!job.file_url) return;
    setDownloadingId(job.id);
    try {
      const { data, error } = await supabase.storage.from('print-labels').download(job.file_url);
      if (error || !data) throw error || new Error('empty');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.download_filename || `etiquetas.${job.format === 'zpl' ? 'zpl' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('[PrintHistoryV2] redownload error:', e);
      toast.error('Não foi possível baixar o arquivo. Ele pode ter sido substituído por uma geração mais recente.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Nenhuma geração registrada ainda.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-auto max-h-[400px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Formato</TableHead>
            <TableHead>Layout</TableHead>
            <TableHead>Etiquetas</TableHead>
            <TableHead>Tamanho</TableHead>
            <TableHead>Duração</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Arquivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const info = STATUS_MAP[job.status] || STATUS_MAP.pendente;
            const Icon = info.icon;
            return (
              <TableRow key={job.id}>
                <TableCell className="whitespace-nowrap text-sm">
                  {format(new Date(job.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs uppercase">{job.format}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {job.layout === 'meli_100x150' && 'Padrão ML'}
                  {job.layout === 'meli_100x150_no_nf' && 'Só Etiqueta'}
                  {job.layout === 'mlfacil_100x175_header' && 'Cabeçalho'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {job.processed_labels}/{job.total_labels}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {job.page_width_mm && job.page_height_mm
                    ? `${job.page_width_mm}×${job.page_height_mm}mm`
                    : '-'}
                  {job.total_pages ? ` (${job.total_pages}p)` : ''}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${info.color} ${job.status === 'processando' ? 'animate-spin' : ''}`} />
                    <span className={`text-sm ${info.color}`}>{info.label}</span>
                  </div>
                  {job.error_log && (
                    <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={job.error_log}>
                      {job.error_log}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {job.file_url ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={downloadingId === job.id}
                      onClick={() => handleRedownload(job)}
                    >
                      {downloadingId === job.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Download className="h-3.5 w-3.5 mr-1" />}
                      Baixar novamente
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
